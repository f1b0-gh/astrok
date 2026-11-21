import { lstat, readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const marker = '.astrok-owned.json';
// Persisted format identifier: keep existing generated directories usable across npm scope changes.
const signature = '{"owner":"@astrok/okf","version":1}\n';
async function physical(file: string): Promise<string> {
  const { physicalPath } = await import('../graph/files.ts');
  return physicalPath(file);
}
/** Claim empty output directories only. Existing files require our ownership marker. */
export async function assertOwnedDirectory(
  root: string,
  directory: string,
  claim = false,
): Promise<void> {
  const resolved = path.resolve(directory);
  // Refuse symbolic links at any existing component, including child entries pruned later.
  async function inspect(current: string, recursive = false): Promise<void> {
    const stat = await lstat(current).catch((error) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return null;
    });
    if (!stat) return;
    if (stat.isSymbolicLink())
      throw new Error(`Generated output cannot contain symbolic links: ${current}`);
    if (recursive && stat.isDirectory())
      for (const name of await readdir(current)) await inspect(path.join(current, name), true);
  }
  for (let current = resolved; ; current = path.dirname(current)) {
    await inspect(current);
    if (path.dirname(current) === current) break;
  }
  const source = await physical(root);
  const output = await physical(directory);
  const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return (
      relative === '' ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  if (inside(source, output) || inside(output, source))
    throw new Error(
      'Generated output must be outside and must not contain the canonical knowledge directory',
    );
  const names = await readdir(resolved).catch((error) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    return [];
  });
  if (names.length) {
    const existing = await readFile(path.join(resolved, marker), 'utf8').catch((error) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      return null;
    });
    if (existing !== signature)
      throw new Error(
        `Generated directory ownership is required before replacing existing content: ${resolved}`,
      );
    await inspect(resolved, true);
  }
  if (claim) {
    await mkdir(resolved, { recursive: true });
    if (!names.length) await writeFile(path.join(resolved, marker), signature, { flag: 'wx' });
  }
}

/** @param {string[]} directories @returns {Promise<void>} */
export async function assertDisjointDirectories(directories: string[]): Promise<void> {
  const resolved = await Promise.all(directories.map(physical));
  for (let i = 0; i < resolved.length; i++)
    for (let j = i + 1; j < resolved.length; j++) {
      for (const [parent, child] of [
        [resolved[i]!, resolved[j]!],
        [resolved[j]!, resolved[i]!],
      ] as const) {
        const relative = path.relative(parent, child);
        if (
          relative === '' ||
          (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
        )
          throw new Error('Generated output directories must not overlap');
      }
    }
}
