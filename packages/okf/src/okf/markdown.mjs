import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import GithubSlugger from 'github-slugger';

export const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);
export function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}
export function textContent(node) {
  return node.value ?? node.alt ?? (node.children ?? []).map(textContent).join('');
}
export function inspectMarkdown(body) {
  const tree = markdown.parse(body);
  const slugger = new GithubSlugger();
  const headings = [];
  const links = [];
  const definitions = new Map();
  walk(tree, (node) => {
    if (node.type === 'definition') definitions.set(node.identifier, node.url);
  });
  let sourceFragment = null;
  walk(tree, (node) => {
    if (node.type === 'heading') {
      sourceFragment = slugger.slug(textContent(node));
      headings.push(sourceFragment);
    }
    const href =
      node.type === 'link' || node.type === 'image'
        ? node.url
        : node.type === 'linkReference' || node.type === 'imageReference'
          ? definitions.get(node.identifier)
          : null;
    if (href != null)
      links.push({
        href,
        sourceFragment,
        line: node.position?.start.line,
        column: node.position?.start.column,
      });
  });
  return { tree, headings, links };
}
