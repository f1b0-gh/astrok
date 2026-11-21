import path from 'node:path';
import { isMap } from 'yaml';
import { readMetadata } from './metadata.mjs';
import { parseDocument } from 'yaml';
import { inspectMarkdown, textContent } from './markdown.mjs';

/** @param {string} name @returns {string} */
export function humanize(name) {
  return name.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}
/** @param {string} source @param {string} file @returns {{document: import('../types.js').Document | null, errors: string[], warnings: string[]}} */
export function parseSource(source, file) {
  const name = path.posix.basename(file);
  const kind = name === 'index.md' ? 'index' : name === 'log.md' ? 'log' : 'concept';
  const errors = [];
  const warnings = [];
  const error = (message) => errors.push(`${file}: ${message}`);
  let metadata = {};
  let body = source;
  let bodyLineOffset = 0;
  const lines = source.split(/\r?\n/);
  const hasFrontmatter = lines[0] === '---';
  if (hasFrontmatter) {
    const end = lines.findIndex((line, index) => index > 0 && line === '---');
    if (end < 0) error('missing frontmatter closing delimiter');
    else {
      const parsed = parseDocument(lines.slice(1, end).join('\n'), { uniqueKeys: true });
      if (parsed.errors.length) error(`invalid YAML: ${parsed.errors[0].message}`);
      else {
        try {
          metadata = parsed.toJS({ maxAliasCount: 100 });
          if (
            !isMap(parsed.contents) ||
            metadata === null ||
            typeof metadata !== 'object' ||
            Array.isArray(metadata)
          ) {
            error('frontmatter must be a mapping');
            metadata = {};
          }
          // Manifests must carry serializable metadata, including future fields.
          JSON.stringify(metadata);
        } catch (cause) {
          error(`unsupported YAML metadata: ${cause.message}`);
        }
      }
      body = lines.slice(end + 1).join('\n');
      bodyLineOffset = end + 1;
    }
  }
  if (kind === 'concept' && (typeof metadata.type !== 'string' || !metadata.type.trim())) {
    warnings.push(`${file}: skipped Markdown without a non-empty string type`);
    return { document: null, errors, warnings };
  }
  if (kind !== 'concept' && hasFrontmatter && file !== 'index.md') {
    error('only the bundle-root index.md may contain reserved-file frontmatter');
  }
  if (kind === 'concept')
    warnings.push(...readMetadata(metadata).warnings.map((message) => `${file}: ${message}`));
  const { tree, headings, links } = inspectMarkdown(body);
  for (const link of links) link.line += bodyLineOffset;
  if (kind === 'index') {
    if (
      !tree.children.some((n) => n.type === 'heading') ||
      !tree.children.some((n) => n.type === 'list')
    ) {
      error('index must contain a heading and a directory listing');
    }
  }
  if (kind === 'log') {
    const dates = tree.children
      .filter((n) => n.type === 'heading' && n.depth === 2)
      .map(textContent);
    if (!dates.length || !tree.children.some((n) => n.type === 'list'))
      error('log must contain dated headings and list entries');
    let previous = '9999-99-99';
    for (const heading of dates) {
      const date = heading.match(/^(\d{4}-\d{2}-\d{2})(?:\s|$)/)?.[1];
      if (
        !date ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      )
        error(`invalid log date: ${heading}`);
      else if (date > previous) error('log dates must be newest first');
      if (date) previous = date;
    }
  }
  const fallback =
    kind === 'concept'
      ? humanize(name.slice(0, -3))
      : textContent(
          tree.children.find((n) => n.type === 'heading') ?? { value: humanize(name.slice(0, -3)) },
        );
  const title =
    typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title : fallback;
  return {
    document: {
      id: file.slice(0, -3),
      path: file,
      kind,
      title,
      description: typeof metadata.description === 'string' ? metadata.description : '',
      type: kind === 'concept' ? metadata.type : null,
      metadata,
      body,
      source,
      headings,
      links,
    },
    errors,
    warnings,
  };
}
