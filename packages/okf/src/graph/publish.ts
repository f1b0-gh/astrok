import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { KnowledgeGraph } from './memory.ts';
import { publishFiles, assertOutside } from './files.ts';
import type { Bundle } from './model.ts';
import { queryGuide } from './query-guide.ts';
import { pageUrl } from '../okf/links.mjs';
import { normalizeBase, withBase } from '../site/generate.mjs';
import { queryReference } from './query-reference.ts';

export async function publishIndex({
  root = 'knowledge',
  publicDir = '.generated/public',
  sqlite = false,
  bundle,
  base = '/',
}: { root?: string; publicDir?: string; sqlite?: boolean; bundle?: Bundle; base?: string } = {}) {
  base = normalizeBase(base);
  const rebase = (text: string): string =>
    base === '/'
      ? text
      : text.replace(/(?<![\w./])\/(?:okf|graph)\//g, (match) => base.slice(0, -1) + match);
  const json = path.join(publicDir, 'graph/graph.json');
  const database = path.join(publicDir, 'graph/knowledge.sqlite');
  const guide = path.join(publicDir, 'llms.txt');
  const reference = path.join(publicDir, 'graph/query-guide.md');
  const sqlGuide = path.join(publicDir, 'graph/sqlite-query.txt');
  for (const output of [json, database, guide, reference, sqlGuide])
    await assertOutside(root, output);
  const index = bundle ? await KnowledgeGraph.fromBundle(bundle) : await KnowledgeGraph.open(root);
  const exported = index.export();
  const snapshot = {
    ...exported,
    nodes: exported.nodes.map((node) => ({
      ...node,
      url: node.sourcePath ? withBase(pageUrl(node.sourcePath), base) : null,
      sourceUrl: node.sourcePath
        ? withBase('/okf/' + node.sourcePath.split('/').map(encodeURIComponent).join('/'), base)
        : null,
    })),
  };
  const jsonText = JSON.stringify(snapshot, null, 2) + '\n';
  const outputs = new Map<string, string | Uint8Array | null>();
  if (sqlite) {
    const { serializeGraph } = await import('./compiler.ts');
    const { sqliteQueryGuide } = await import('./sqlite-guide.ts');
    const previous = await readFile(database).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    const bytes = await serializeGraph(snapshot, previous);
    outputs.set(database, bytes);
    outputs.set(sqlGuide, rebase(sqliteQueryGuide()));
  } else {
    outputs.set(database, null);
    outputs.set(sqlGuide, null);
  }
  outputs.set(json, jsonText);
  outputs.set(guide, rebase(queryGuide({ sqlite })));
  outputs.set(reference, rebase(queryReference({ sqlite })));
  await publishFiles(outputs);
  return { graph: snapshot, json, database: sqlite ? database : null };
}
