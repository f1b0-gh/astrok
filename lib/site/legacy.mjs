import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';

// One-time migration for this repository's pre-package generated projections.
// The public package only claims absent/empty directories; this compatibility
// entry recognizes the exact legacy defaults and leaves all files in place.
export async function adoptLegacyDefaults(project) {
  const signature = '{"owner":"@astrok/okf","version":1}\n';
  const docs = path.join(project, 'src/content/docs');
  const raw = path.join(project, '.generated/public/okf');
  const graph = path.join(project, '.generated/public/graph');
  async function claim(directory, validate) {
    for (let current = directory;; current = path.dirname(current)) {
      const stat = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      if (stat?.isSymbolicLink()) throw new Error(`Legacy generated output cannot use symbolic links: ${current}`);
      if (path.dirname(current) === current) break;
    }
    const entries = await readdir(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
    if (!entries.length || entries.includes('.astrok-owned.json')) return;
    if (await validate()) await writeFile(path.join(directory, '.astrok-owned.json'), signature, { flag: 'wx' });
  }
  async function onlyGeneratedPages(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) { if (!(await onlyGeneratedPages(full))) return false; }
      else {
        if (!entry.name.endsWith('.md')) return false;
        const text = await readFile(full, 'utf8');
        if (!/^---\n/.test(text) || !/\nokf:\n  sourcePath: /.test(text)) return false;
      }
    }
    return true;
  }
  await claim(docs, () => onlyGeneratedPages(docs));
  await claim(raw, async () => {
    const manifest = JSON.parse(await readFile(path.join(raw, 'manifest.json'), 'utf8'));
    return manifest.format === 'okf-site-manifest' && manifest.version === 1;
  });
  await claim(graph, async () => {
    const names = await readdir(graph);
    if (names.some(name => !['graph.json', 'knowledge.sqlite', 'query-guide.md', 'sqlite-query.txt'].includes(name))) return false;
    const snapshot = JSON.parse(await readFile(path.join(graph, 'graph.json'), 'utf8'));
    return snapshot.format === 'okf-graph' && snapshot.schemaVersion === 1;
  });
}

