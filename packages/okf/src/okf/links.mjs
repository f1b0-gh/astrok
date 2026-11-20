import path from 'node:path';

/** @param {string} file @returns {string} */
export function pageUrl(file) {
  const id = file.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
  return '/' + id.split('/').filter(Boolean).map(encodeURIComponent).join('/') + (id ? '/' : '');
}
/** @param {string} href @param {string} sourcePath @param {Map<string, Pick<import('../types.js').Document, 'id' | 'headings'>>} documents @param {Map<string, Uint8Array>} assets @returns {import('../types.js').ResolvedLink} */
export function resolveLink(href, sourcePath, documents, assets) {
  if (/[\x00-\x20\x7f]/.test(href)) return { url: href, warning: 'invalid URL characters' };
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return { url: href, external: true };
  const match = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  if (!match) return { url: href, warning: 'invalid URL' };
  const [, rawPath, query = '', hash = ''] = match;
  let decoded;
  let fragment;
  try { decoded = decodeURIComponent(rawPath); fragment = decodeURIComponent(hash.slice(1)); }
  catch { return { url: href, warning: 'invalid URL encoding' }; }
  let targetPath = decoded ? path.posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(sourcePath), decoded)) : sourcePath;
  if (targetPath === '..' || targetPath.startsWith('../') || targetPath.includes('\\') || targetPath.includes('\0')) {
    return { url: href, external: true, warning: 'link escapes the bundle or uses an invalid path' };
  }
  if (targetPath === '.' || targetPath.endsWith('/')) targetPath = (targetPath === '.' ? '' : targetPath) + 'index.md';
  if (!documents.has(targetPath) && documents.has(targetPath + '/index.md')) targetPath += '/index.md';
  const target = documents.get(targetPath);
  if (target) {
    return { target: target.id, targetPath, fragment: fragment || null, url: pageUrl(targetPath) + query + hash,
      ...(fragment && !target.headings.includes(fragment) ? { warning: `missing heading #${fragment} in ${targetPath}` } : {}) };
  }
  if (assets.has(targetPath)) return { targetPath, url: '/okf/' + targetPath.split('/').map(encodeURIComponent).join('/') + query + hash };
  return { targetPath, url: targetPath.endsWith('.md') ? pageUrl(targetPath) + query + hash : href, warning: `missing target ${targetPath}` };
}


/** Resolve OKF path metadata with the optional <=0.2 compatibility fallback.
 * @param {string} href @param {string} sourcePath
 * @param {Map<string, Pick<import('../types.js').Document, 'id' | 'headings'>>} documents
 * @param {Map<string, Uint8Array>} assets @param {unknown} version
 * @returns {import('../types.js').ResolvedLink}
 */
export function resolvePathField(href, sourcePath, documents, assets, version) {
  const resolved = resolveLink(href, sourcePath, documents, assets);
  const legacy = version == null || version === '' || (typeof version === 'string' && /^0\.[012]$/.test(version));
  if (legacy && !resolved.external && resolved.targetPath && !documents.has(resolved.targetPath) && !assets.has(resolved.targetPath) && !href.startsWith('/')) {
    const fallback = resolveLink('/' + href, sourcePath, documents, assets);
    if (fallback.targetPath && (documents.has(fallback.targetPath) || assets.has(fallback.targetPath))) return fallback;
  }
  return resolved;
}
