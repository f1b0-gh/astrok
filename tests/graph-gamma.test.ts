import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readBundle } from '../lib/okf/bundle.mjs';
import { projectGraph } from '../backend/graph/project.ts';
import { compileIndex } from '../backend/graph/compiler.ts';
import { SqliteKnowledgeIndex } from '../backend/graph/query.ts';

const doc = (kind: string, relations = '', model = 'gamma34/0.1') => `---\ntype: Custom Domain Type\ngraph_model: ${model}\ngraph_kind: ${kind}\ncustom: {keep: true}\n${relations}---\n# Example\nSearchable café token.\n`;
async function fixture(t: test.TestContext, files: Record<string, string>) {
  const temp = await mkdtemp(path.join(tmpdir(), 'okf-gamma-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'knowledge');
  await mkdir(root);
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content);
  return { root, database: path.join(temp, 'index.sqlite') };
}
const relations = `graph_relations:
  - {target: b.md, relation: resembles, family: similar, contexts: [demo]}
  - {target: c.md, relation: advances, inverse: follows, family: leads_to, contexts: [demo]}
  - {target: b.md, relation: includes, inverse: part_of, family: contains}
  - {target: c.md, relation: shows, inverse: shown_by, family: expresses}
`;

test('Gamma categories remain separate from OKF types and all four families retain evidence', async t => {
  const { root } = await fixture(t, { 'a.md': doc('event', relations), 'b.md': doc('thing'), 'c.md': doc('concept') });
  const graph = projectGraph(await readBundle(root));
  assert.deepEqual(graph.nodes.filter(n => n.kind === 'concept').map(n => [n.id, n.graphKind, n.graphModel, n.type]), [
    ['a', 'event', 'gamma34/0.1', 'Custom Domain Type'], ['b', 'thing', 'gamma34/0.1', 'Custom Domain Type'], ['c', 'concept', 'gamma34/0.1', 'Custom Domain Type'],
  ]);
  assert.deepEqual(graph.nodes.find(n => n.id === 'a')!.metadata.custom, { keep: true });
  assert.deepEqual(graph.relations.filter(r => r.id.startsWith('semantic:')).map(r => r.stType).sort(), [0, 1, 2, 3]);
  assert.equal(graph.edges.filter(e => e.origin === 'explicit').length, 4);
  assert.ok(graph.evidence.filter(e => e.kind === 'graph_relation').every(e => e.sourcePath === 'a.md' && e.detail));
});

test('future graph extensions stay opaque while invalid known declarations fail graph only', async t => {
  const { root } = await fixture(t, { 'a.md': doc('quantum', 'graph_relations: {future: syntax}\n', 'gamma34/9.0'), 'b.md': '---\ntype: Unknown\n---\nPlain OKF.' });
  const graph = projectGraph(await readBundle(root));
  assert.equal(graph.nodes.find(n => n.id === 'a')!.graphKind, null);
  assert.equal(graph.nodes.find(n => n.id === 'a')!.graphModel, 'gamma34/9.0');
  assert.deepEqual(graph.nodes.find(n => n.id === 'a')!.metadata.graph_relations, { future: 'syntax' });
  assert.equal(graph.nodes.find(n => n.id === 'b')!.graphKind, null);
  assert.ok(graph.diagnostics.some(d => d.includes('gamma34/9.0')));
  await writeFile(path.join(root, 'a.md'), doc('quantum'));
  const invalid = await readBundle(root);
  assert.deepEqual(invalid.errors, []);
  assert.throws(() => projectGraph(invalid), /graph_kind/);
  await writeFile(path.join(root, 'a.md'), '---\ntype: Custom\ngraph_kind: thing\n---\nBody');
  const undeclared = await readBundle(root);
  assert.throws(() => projectGraph(undeclared), /graph_model/);
});

test('memory and SQLite agree on symmetric similarity, inverse labels, contexts and bounded paths', async t => {
  const { KnowledgeGraph } = await import('../backend/graph/memory.ts');
  const options = await fixture(t, { 'a.md': doc('event', relations), 'b.md': doc('thing', 'graph_relations:\n  - {target: c.md, relation: resembles, family: near, contexts: [demo]}\n'), 'c.md': doc('concept', 'graph_relations:\n  - {target: a.md, relation: advances, inverse: follows, family: leads_to}\n') });
  const memory = await KnowledgeGraph.open(options.root);
  await compileIndex(options);
  const sql = await SqliteKnowledgeIndex.open(options.database);
  t.after(() => sql.close());
  for (const index of [memory, sql]) {
    assert.equal(index.getNode('a')!.graphKind, 'event');
    assert.equal(index.getNode('b')!.graphKind, 'thing');
    assert.equal(index.getNode('c')!.graphKind, 'concept');
    assert.equal(index.search('cafe')[0]!.node.id, 'a');
    const similar = index.neighbors('b', { family: 'similar', context: 'demo', direction: 'out' });
    assert.deepEqual(similar.items.map(x => x.node.id).sort(), ['a', 'c']);
    assert.ok(similar.items.every(x => x.stType === 0 && x.label === 'resembles'));
    assert.equal(index.neighbors('c', { family: 'similar' }).items.some(x => x.node.id === 'a'), false);
    const inverse = index.neighbors('c', { family: 'expresses', direction: 'in' }).items[0]!;
    assert.equal(inverse.label, 'shown_by');
    assert.equal(inverse.stType, -3);
    assert.equal(inverse.evidence[0]!.sourcePath, 'a.md');
    assert.equal(index.path('b', 'a', { family: 'similar', maxDepth: 1 }).found, true);
    assert.equal(index.path('b', 'a', { family: 'similar', maxDepth: 0 }).found, false);
    assert.equal(index.traverse('a', { maxNodes: 1 }).truncated, true);
    const walk = index.traverse('a', { maxDepth: 4 });
    assert.equal(new Set(walk.nodes.map(n => n.node.id)).size, walk.nodes.length);
    assert.throws(() => index.traverse('a', { maxDepth: 9 }), /maxDepth/);
    assert.throws(() => index.neighbors('a', { family: 'bogus' as never }), /family/);
    assert.throws(() => index.search('a '.repeat(17)), /16 terms/);
  }
  assert.deepEqual(memory.neighbors('b', { family: 'similar' }), sql.neighbors('b', { family: 'similar' }));
  const first = memory.export();
  assert.deepEqual((await KnowledgeGraph.open(options.root)).export(), first);
  const restored = KnowledgeGraph.fromJSON(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(restored.path('b', 'a', { family: 'similar' }), memory.path('b', 'a', { family: 'similar' }));
  const bad = structuredClone(first);
  bad.edges[0]!.target = 'missing';
  assert.throws(() => KnowledgeGraph.fromJSON(bad), /target|dangling/);
  assert.throws(() => KnowledgeGraph.fromJSON({ ...first, schemaVersion: 999 }), /schema/);
  await rm(path.join(options.root, 'b.md'));
  const removed = await KnowledgeGraph.open(options.root);
  assert.equal(removed.getNode('b'), null);
  assert.ok(removed.export().diagnostics.length);
});

test('JSON publication and default CLI work with SQLite imports forbidden and remove stale optional artifacts', async t => {
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const exec = promisify(execFile);
  const { root } = await fixture(t, { 'a.md': doc('thing', 'graph_relations:\n  - {target: b.md, relation: resembles, family: similar}\n'), 'b.md': doc('concept') });
  const publicDir = path.join(path.dirname(root), 'public');
  const block = 'data:text/javascript,' + encodeURIComponent(`import { registerHooks } from 'node:module'; registerHooks({resolve(specifier, context, next) { if (specifier.includes('sqlite-wasm') || specifier.endsWith('/wasm.ts')) throw new Error('SQLITE_FORBIDDEN'); return next(specifier, context); }});`);
  const cli = (...args: string[]) => exec(process.execPath, ['--import', block, 'scripts/graph.ts', ...args]);
  const built = JSON.parse((await cli('build', '--no-sqlite', '--root', root, '--public-dir', publicDir)).stdout);
  assert.equal(built.runtime.engine, 'okf-memory');
  await assert.rejects(readFile(path.join(publicDir, 'graph/knowledge.sqlite')), /ENOENT/);
  const json = path.join(publicDir, 'graph/graph.json');
  assert.equal(JSON.parse((await cli('get', 'a', '--root', root)).stdout).graphKind, 'thing');
  assert.equal(JSON.parse((await cli('neighbors', 'b', '--json', json, '--family', 'similar')).stdout).items[0].node.id, 'a');
  assert.equal(JSON.parse((await cli('search', 'cafe', '--json', json)).stdout).length, 2);
  const initial = await readFile(json, 'utf8');
  await cli('build', '--no-sqlite', '--root', root, '--public-dir', publicDir);
  assert.equal(await readFile(json, 'utf8'), initial);
  await writeFile(path.join(publicDir, 'graph/knowledge.sqlite'), 'stale');
  await writeFile(path.join(publicDir, 'graph/sqlite-query.txt'), 'stale');
  await cli('build', '--no-sqlite', '--root', root, '--public-dir', publicDir);
  await assert.rejects(readFile(path.join(publicDir, 'graph/knowledge.sqlite')), /ENOENT/);
  await assert.rejects(readFile(path.join(publicDir, 'graph/sqlite-query.txt')), /ENOENT/);
  const guide = await readFile(path.join(publicDir, 'llms.txt'), 'utf8');
  assert.match(guide, /gamma34\/0\.1/);
  assert.match(guide, /OKF 0\.3/);
  assert.match(guide, /\/okf\/index.md/);
  assert.ok(!guide.includes('Searchable café token.'));
  assert.ok(guide.includes('](/graph/query-guide.md)'));
  assert.ok(!guide.includes('](/graph/knowledge.sqlite)'));
  const reference = await readFile(path.join(publicDir, 'graph/query-guide.md'), 'utf8');
  assert.ok(!reference.includes('/graph/knowledge.sqlite'));
  assert.ok(reference.includes('KnowledgeGraph.fromJSON'));
  await assert.rejects(cli('export', '--root', root, '--output', path.join(root, 'a.md')), /outside/);
  await assert.rejects(cli('export', '--json', json, '--output', json), /overwrite/);
  await assert.rejects(cli('build', '--no-sqlite', '--root', root, '--public-dir', root), /outside/);
});

test('automatic SQLite and JSON publication consume the exact same parsed OKF snapshot', async t => {
  const { publishIndex } = await import('../backend/graph/publish.ts');
  const { KnowledgeGraph } = await import('../backend/graph/memory.ts');
  const { root } = await fixture(t, { 'a.md': doc('event', relations), 'b.md': doc('thing'), 'c.md': doc('concept') });
  const bundle = await readBundle(root);
  // A subsequent disk edit must not leak into just one output of this publication.
  await writeFile(path.join(root, 'a.md'), doc('concept').replace('Searchable café token.', 'Newer disk version.'));
  const publicDir = path.join(path.dirname(root), 'public');
  await publishIndex({ root, publicDir, bundle });
  const memory = KnowledgeGraph.fromJSON(JSON.parse(await readFile(path.join(publicDir, 'graph/graph.json'), 'utf8')));
  const sql = await SqliteKnowledgeIndex.open(path.join(publicDir, 'graph/knowledge.sqlite'));
  try {
    assert.equal(memory.getNode('a')!.graphKind, 'event');
    assert.equal(sql.getNode('a')!.graphKind, 'event');
    assert.equal(memory.search('Newer').length, 0);
    const expected = memory.export(), stored = sql.export();
    assert.equal(stored.metadata.source_hash, expected.metadata.source_hash);
    assert.deepEqual(stored.nodes, expected.nodes);
    assert.deepEqual(JSON.parse(JSON.stringify(stored.sources)), expected.sources);
    assert.deepEqual(stored.relations.map(r => ({ id: r.id, name: r.name, inverse: r.inverse, family: r.family, stType: r.st_type })), expected.relations);
    assert.deepEqual(stored.edges.map(({ evidence, ...edge }) => edge), expected.edges);
    for (const node of expected.nodes) {
      for (const direction of ['out', 'in', 'both'] as const) assert.deepEqual(sql.neighbors(node.id, { direction }), memory.neighbors(node.id, { direction }));
    }
    assert.deepEqual(stored.diagnostics, expected.diagnostics);
  } finally { sql.close(); }
});

test('failed publication preserves the previous JSON and SQLite generation', async t => {
  const { publishIndex } = await import('../backend/graph/publish.ts');
  const { root } = await fixture(t, { 'a.md': doc('thing') });
  const publicDir = path.join(path.dirname(root), 'public');
  await publishIndex({ root, publicDir });
  const database = path.join(publicDir, 'graph/knowledge.sqlite');
  const json = path.join(publicDir, 'graph/graph.json');
  const oldDatabase = await readFile(database), oldJSON = await readFile(json);
  const blocked = path.join(publicDir, 'graph/sqlite-query.txt');
  await rm(blocked);
  await mkdir(blocked);
  await writeFile(path.join(root, 'a.md'), doc('event'));
  await assert.rejects(publishIndex({ root, publicDir }), /EISDIR|directory/);
  assert.deepEqual(await readFile(database), oldDatabase);
  assert.deepEqual(await readFile(json), oldJSON);
});

test('memory and SQLite match underscore-separated words consistently', async t => {
  const { KnowledgeGraph } = await import('../backend/graph/memory.ts');
  const options = await fixture(t, { 'a.md': doc('thing').replace('Searchable café token.', 'foo_bar') });
  const memory = await KnowledgeGraph.open(options.root);
  await compileIndex(options);
  const sql = await SqliteKnowledgeIndex.open(options.database);
  try {
    for (const text of ['foo', 'bar', 'foo bar', 'foo_bar']) {
      assert.deepEqual(sql.search(text).map(hit => hit.node.id), ['a']);
      assert.deepEqual(memory.search(text).map(hit => hit.node.id), ['a']);
    }
  } finally { sql.close(); }
});

test('CLI honors environment SQL opt-out without importing SQLite', async t => {
  const { promisify } = await import('node:util');
  const { execFile } = await import('node:child_process');
  const exec = promisify(execFile);
  const { root } = await fixture(t, { 'a.md': doc('thing') });
  const block = 'data:text/javascript,' + encodeURIComponent(`import { registerHooks } from 'node:module'; registerHooks({resolve(s,c,n) { if (s.includes('sqlite-wasm') || s.endsWith('/wasm.ts')) throw new Error('SQLITE_FORBIDDEN'); return n(s,c); }});`);
  const publicDir = path.join(path.dirname(root), 'public');
  const args = ['--import', block, 'scripts/graph.ts', 'build', '--root', root, '--public-dir', publicDir];
  const result = await exec(process.execPath, args, { env: { ...process.env, OKF_SQLITE: '0' } });
  assert.equal(JSON.parse(result.stdout).runtime.engine, 'okf-memory');
  await assert.rejects(readFile(path.join(publicDir, 'graph/knowledge.sqlite')), /ENOENT/);
  // Explicit --sqlite takes precedence over the environment.
  await assert.rejects(exec(process.execPath, [...args, '--sqlite'], { env: { ...process.env, OKF_SQLITE: '0' } }), /SQLITE_FORBIDDEN/);
});
