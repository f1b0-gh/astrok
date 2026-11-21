import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AstroIntegration } from 'astro';
import { z } from 'zod';
import { generateSite, normalizeBase, assertOwnedDirectory, assertDisjointDirectories } from '@astrok/okf/site';

/** Framework options are strict; canonical OKF metadata remains opaque/preserved. */
export const okfOptionsSchema = z.strictObject({
  root: z.string().min(1).optional(),
  docsDir: z.string().min(1).optional(),
  publicDir: z.string().min(1).optional(),
  base: z.string().refine(value => { try { normalizeBase(value); return true; } catch { return false; } }, 'Expected an absolute URL path without traversal').optional(),
  graph: z.boolean().default(false),
  sqlite: z.boolean().optional(),
  presentation: z.enum(['plain', 'starlight']).default('starlight'),
});
export type OkfOptions = z.input<typeof okfOptionsSchema>;
export type ResolvedOkfOptions = z.output<typeof okfOptionsSchema>;

export function okfIntegration(options: OkfOptions = {}): AstroIntegration {
  const parsed = okfOptionsSchema.parse(options);
  return {
    name: '@astrok/astro',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig, logger }) => {
        const project = fileURLToPath(config.root);
        const root = path.resolve(project, parsed.root ?? 'knowledge');
        const publicDir = path.resolve(project, parsed.publicDir ?? (parsed.presentation === 'plain' ? fileURLToPath(config.publicDir) : '.generated/public'));
        const docsDir = path.resolve(project, parsed.docsDir ?? 'src/content/docs');
        const base = normalizeBase(parsed.base ?? config.base);
        await assertDisjointDirectories([
          path.join(publicDir, 'okf'),
          ...(parsed.presentation === 'starlight' ? [docsDir] : []),
          ...(parsed.graph ? [path.join(publicDir, 'graph')] : []),
        ]);
        // Astro's base controls the actual served routes as well as emitted links.
        if (parsed.base !== undefined && normalizeBase(config.base) !== base) updateConfig({ base });
        async function generate(): Promise<void> {
          // Graph publication also owns llms.txt at the public root. Claim the
          // graph directory first, so an unrelated graph tree is never overwritten.
          if (parsed.graph) {
            const { access, readFile } = await import('node:fs/promises');
            const marker = path.join(publicDir, 'graph/.astrok-owned.json');
            const guideExists = await access(path.join(publicDir, 'llms.txt')).then(() => true, () => false);
            const hasOwner = await readFile(marker, 'utf8').then(value => value === '{"owner":"@astrok/okf","version":1}\n', () => false);
            if (guideExists && !hasOwner) throw new Error('Generated llms.txt ownership is required before replacement');
            await assertOwnedDirectory(root, path.join(publicDir, 'graph'), false);
          }
          const bundle = await generateSite({ root, docsDir, publicDir, base, presentation: parsed.presentation });
          if (parsed.graph) {
            await assertOwnedDirectory(root, path.join(publicDir, 'graph'), true);
            const { publishIndex } = await import('@astrok/okf/graph');
            await publishIndex({ root, publicDir, bundle, sqlite: parsed.sqlite ?? process.env.OKF_SQLITE === '1', base });
          }
          for (const warning of bundle.warnings) logger.warn(warning);
          logger.info(`Generated ${bundle.documents.length} OKF documents.`);
        }
        await generate();
        updateConfig({ publicDir: pathToFileURL(publicDir + path.sep), vite: { plugins: [{
          name: 'watch-okf-sources',
          configureServer(server) {
            server.watcher.add(root);
            let queue = Promise.resolve();
            const onChange = (_event: string, file: string): void => {
              const relative = path.relative(root, path.resolve(file));
              if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return;
              queue = queue.then(generate).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                logger.error(message);
                server.ws.send({ type: 'error', err: { message, stack: '' } });
              });
            };
            server.watcher.on('all', onChange);
            const close = (): void => { server.watcher.off('all', onChange); };
            server.httpServer?.once('close', close);
            // Vite's watcher also closes in middleware mode without an HTTP server.
            server.watcher.once('close', close);
          },
        }] } });
      },
    },
  };
}
export default okfIntegration;
