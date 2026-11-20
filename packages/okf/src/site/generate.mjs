import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import { readBundle } from '../okf/bundle.mjs';
import { markdown, walk, textContent } from '../okf/markdown.mjs';
import { pageUrl, resolveLink } from '../okf/links.mjs';
import { assertOwnedDirectory, assertDisjointDirectories } from './ownership.ts';

export function normalizeBase(base = '/') {
  if (typeof base !== 'string' || !base.startsWith('/') || base.startsWith('//') || /[?#\\]/.test(base) || base.split('/').some(segment => segment === '..' || segment === '.')) throw new Error('base must be an absolute URL path without traversal, query or fragment');
  return '/' + base.split('/').filter(Boolean).join('/') + (base.split('/').filter(Boolean).length ? '/' : '');
}
/** @param {string} url @param {string} [base] @returns {string} */
export function withBase(url, base = '/') {
  return url.startsWith('/') && !url.startsWith('//') ? normalizeBase(base).slice(0, -1) + url : url;
}

// Only generator-owned directories are passed here. Avoid rewriting unchanged files
// so Astro's content watcher gets a change only when content actually changed.
async function syncFiles(directory, files) {
  await mkdir(directory, { recursive: true });
  async function prune(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await prune(full, relative + '/');
        if (!(await readdir(full)).length) await rm(full, { recursive: true });
      }
      else if (relative !== '.astrok-owned.json' && !files.has(relative)) await rm(full);
    }
  }
  await prune(directory);
  for (const [file, data] of files) {
    const full = path.join(directory, file);
    const bytes = Buffer.from(data);
    const old = await readFile(full).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (old?.equals(bytes)) continue;
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }
}

/** @param {import('../types.js').SiteOptions} [options] @returns {Promise<import('../types.js').LoadedSite>} */
export async function loadSite({ root = 'knowledge', base = '/' } = {}) {
  base = normalizeBase(base);
  const bundle = await readBundle(root);
  if (bundle.errors.length) throw new Error(bundle.errors.join('\n'));
  const routes = new Map();
  for (const document of bundle.documents) {
    const url = pageUrl(document.path);
    if (url === '/404/') throw new Error(`Route collision: ${document.path} conflicts with Starlight's 404 page`);
    if (routes.has(url)) throw new Error(`Route collision: ${document.path} and ${routes.get(url)} map to ${url}`);
    routes.set(url, document.path);
  }
  if (bundle.assets.has('manifest.json')) throw new Error('Export collision: knowledge/manifest.json conflicts with the generated manifest');
  const byPath = new Map(bundle.documents.map(document => [document.path, document]));
  const pages = new Map();
  const documents = [];
  const raw = new Map(bundle.assets);
  for (const document of bundle.documents) {
    const tree = markdown.parse(document.body);
    walk(tree, node => {
      if (node.type === 'link' || node.type === 'image' || node.type === 'definition') {
        node.url = withBase(resolveLink(node.url, document.path, byPath, bundle.assets).url, base);
      }
    });
    const first = tree.children[0];
    const hasBodyTitle = first?.type === 'heading' && first.depth === 1 && textContent(first) === document.title;
    // Source metadata never becomes Starlight configuration (e.g. draft, sidebar).
    const frontmatter = {
      title: document.title,
      ...(document.description ? { description: document.description } : {}),
      // Astro expects decoded route parameters; Starlight removes terminal index.
      slug: document.id,
      okf: { sourcePath: document.path, sourceUrl: withBase('/okf/' + document.path.split('/').map(encodeURIComponent).join('/'), base), type: document.type, hasBodyTitle },
    };
    // Explicit slugs preserve source paths instead of lowercasing filenames.
    pages.set(document.path, `---\n${stringify(frontmatter)}---\n\n${markdown.stringify(tree)}`);
    raw.set(document.path, document.source);
    documents.push({ ...document, body: markdown.stringify(tree), url: withBase(pageUrl(document.path), base), sourceUrl: frontmatter.okf.sourceUrl });
  }
  if (!byPath.has('index.md')) {
    const tree = { type: 'root', children: [
      { type: 'paragraph', children: [{ type: 'text', value: 'Browse the knowledge bundle.' }] },
      { type: 'list', ordered: false, children: bundle.documents.map(document => ({ type: 'listItem', children: [
        { type: 'paragraph', children: [{ type: 'link', url: withBase(pageUrl(document.path), base), children: [{ type: 'text', value: document.title }] }] },
      ] })) },
    ] };
    pages.set('index.md', `---\ntitle: Knowledge\nslug: ""\n---\n\n${markdown.stringify(tree)}`);
  }
  const manifest = {
    format: 'okf-site-manifest', version: 1,
    documents: bundle.documents.map(({ id, path: sourcePath, kind, title, description, type, metadata, headings, links }) => ({
      id, path: sourcePath, kind, title, description, type, metadata, headings, links: links.map(link => ({ ...link, url: withBase(link.url, base) })),
      url: withBase(pageUrl(sourcePath), base), sourceUrl: withBase('/okf/' + sourcePath.split('/').map(encodeURIComponent).join('/'), base),
    })),
  };
  raw.set('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return { bundle, documents, manifest, pages, raw };
}

/** @param {import('../types.js').GenerateOptions} [options] @returns {Promise<import('../types.js').Bundle>} */
export async function generateSite({ root = 'knowledge', docsDir = 'src/content/docs', publicDir = '.generated/public', base = '/', presentation = 'starlight' } = {}) {
  if (presentation !== 'plain' && presentation !== 'starlight') throw new Error('Unknown presentation');
  const site = await loadSite({ root, base });
  // Check every output before claiming or replacing either directory.
  const outputs = presentation === 'plain' ? [path.join(publicDir, 'okf')] : [docsDir, path.join(publicDir, 'okf')];
  await assertDisjointDirectories(outputs);
  for (const directory of outputs) await assertOwnedDirectory(root, directory, false);
  for (const directory of outputs) await assertOwnedDirectory(root, directory, true);
  if (presentation !== 'plain') await syncFiles(docsDir, site.pages);
  await syncFiles(path.join(publicDir, 'okf'), site.raw);
  return site.bundle;
}

export { assertOwnedDirectory, assertDisjointDirectories } from './ownership.ts';
