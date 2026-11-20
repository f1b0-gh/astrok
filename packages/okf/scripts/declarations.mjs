import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// TS rewrites executable imports but retains .ts specifiers in inferred import()
// declaration types. The shipped declarations must reference shipped JS modules.
async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await rewrite(file);
    else if (/\.d\.[mc]?ts$/.test(entry.name)) {
      const text = await readFile(file, 'utf8');
      const updated = text.replace(/(['"])(\.{1,2}\/[^'"\n]+)\.ts\1/g, '$1$2.js$1');
      if (text !== updated) await writeFile(file, updated);
    }
  }
}
await rewrite(fileURLToPath(new URL('../dist/', import.meta.url)));
