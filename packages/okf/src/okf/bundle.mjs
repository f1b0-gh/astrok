import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSource } from './document.mjs';
import { resolveLink } from './links.mjs';

/** @param {string} root @returns {Promise<import('../types.js').Bundle>} */
export async function readBundle(root) {
  const documents = [];
  const assets = new Map();
  const errors = [];
  const warnings = [];
  async function scan(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      // Hidden files are not published; symlinks cannot pull content outside the bundle.
      if (entry.name.startsWith('.')) continue;
      const file = prefix + entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        warnings.push(`${file}: symbolic links are not followed`);
        continue;
      }
      if (entry.isDirectory()) await scan(absolute, file + '/');
      else if (entry.isFile()) {
        const data = await readFile(absolute);
        if (!file.endsWith('.md')) {
          assets.set(file, data);
          continue;
        }
        try {
          const source = new TextDecoder('utf-8', { fatal: true }).decode(data);
          const parsed = parseSource(source, file);
          if (parsed.document) documents.push(parsed.document);
          warnings.push(...parsed.warnings);
          errors.push(...parsed.errors);
        } catch (cause) {
          errors.push(`${file}: ${cause.message}`);
        }
      }
    }
  }
  await scan(root);
  documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const byPath = new Map(documents.map((document) => [document.path, document]));
  for (const document of documents) {
    document.links = document.links.map((link) => {
      const resolved = resolveLink(link.href, document.path, byPath, assets);
      if (resolved.warning) warnings.push(`${document.path}:${link.line}: ${resolved.warning}`);
      return { ...link, ...resolved, sourcePath: document.path };
    });
  }
  return { documents, assets, errors, warnings };
}
