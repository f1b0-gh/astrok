import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { WasmDatabase } from '@astrokjs/okf/sqlite';
import { readBundle } from '@astrokjs/okf';
import { KnowledgeGraph } from '@astrokjs/okf/graph';
import { projectGraph } from '@astrokjs/okf/graph';
import { compileIndex } from '@astrokjs/okf/sqlite';
import { migrate, SCHEMA_VERSION } from '@astrokjs/okf/sqlite';
import { SqliteKnowledgeIndex } from '@astrokjs/okf/sqlite';

async function fixture(t: test.TestContext, files: Record<string, string>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'okf-graph-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'knowledge');
  await mkdir(root);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  return { root, database: path.join(directory, 'index.sqlite') };
}
const concept = (body = '', fields = '') => `---\ntype: Future Concept\n${fields}---\n${body}`;

test('projection keeps canonical IDs and metadata, directory edges and all link evidence', async (t) => {
  const { root } = await fixture(t, {
    'a.md': concept(
      '## Links\n[One](nested/b.md#target)\n[Again](nested/b.md#target)\n[Missing](missing.md)',
      'custom: {keep: [one, two]}\n',
    ),
    'nested/b.md': concept('## Target\nBody'),
  });
  const graph = projectGraph(await readBundle(root));
  assert.deepEqual(graph.nodes.find((n) => n.id === 'a')?.metadata.custom, {
    keep: ['one', 'two'],
  });
  assert.ok(graph.nodes.some((n) => n.id === '@directory/nested/' && n.kind === 'directory'));
  const links = graph.edges.filter((e) => e.source === 'a' && e.target === 'nested/b');
  assert.equal(links.length, 1);
  assert.equal(links[0]!.origin, 'structural');
  assert.equal(links[0]!.relation, 'structural:references');
  const evidence = graph.evidence.filter((e) => e.edgeId === links[0]!.id);
  assert.deepEqual(
    evidence.map((e) => e.sourceLine),
    [6, 7],
  );
  assert.ok(evidence.every((e) => e.sourceFragment === 'links' && e.targetFragment === 'target'));
  assert.equal(graph.diagnostics.length, 1);
  assert.ok(!graph.nodes.some((n) => n.id === 'missing'));
});

test('authored relations retain semantic family, contexts and labeled inference', async (t) => {
  const { root } = await fixture(t, {
    'a.md': concept(
      'Body',
      'graph_relations:\n  - target: b.md\n    relation: precedes\n    inverse: follows\n    family: leads_to\n    contexts: [setup, demo, setup]\n    weight: 0.7\n  - target: b.md\n    relation: resembles\n    family: near\n    origin: inferred\n    confidence: 0.4\n    evidence: "An author supplied this hypothesis."\n',
    ),
    'b.md': concept('Body'),
  });
  const graph = projectGraph(await readBundle(root));
  const explicit = graph.edges.find((e) => e.origin === 'explicit')!;
  assert.deepEqual(explicit.contexts, ['demo', 'setup']);
  assert.equal(explicit.weight, 0.7);
  assert.equal(graph.relations.find((r) => r.id === explicit.relation)?.stType, 1);
  assert.equal(graph.edges.find((e) => e.origin === 'inferred')?.confidence, 0.4);
  assert.ok(graph.evidence.some((e) => e.detail?.includes('hypothesis')));
});

test('invalid graph extensions fail compilation without changing OKF conformance', async (t) => {
  for (const relation of [
    '  - target: b.md\n    relation: guesses\n    family: near\n    origin: inferred\n',
    '  - target: b.md\n    relation: x\n    family: unsupported\n',
    '  - target: https://example.com\n    relation: x\n    family: near\n',
  ]) {
    const { root } = await fixture(t, {
      'a.md': concept('', 'graph_relations:\n' + relation),
      'b.md': concept(),
    });
    const bundle = await readBundle(root);
    assert.deepEqual(bundle.errors, []);
    assert.throws(() => projectGraph(bundle), /graph_relations/);
  }
});

test('schema migrates idempotently, enforces foreign keys and rejects future versions', async () => {
  const db = await WasmDatabase.open();
  try {
    migrate(db, 1);
    db.exec(
      "INSERT INTO sources VALUES ('a.md', 'hash'); INSERT INTO nodes VALUES ('a', 'concept', 'A', '', 'Kind', 'searchable body', '{}', 'a.md');",
    );
    migrate(db);
    migrate(db);
    assert.equal(db.prepare('PRAGMA user_version').get()!.user_version, SCHEMA_VERSION);
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM node_search WHERE node_search MATCH 'searchable'")
        .get()!.n,
      1,
    );
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO nodes VALUES ('b', 'concept', 'B', '', 'Kind', '', '{}', 'missing.md')",
        ),
      /FOREIGN KEY/,
    );
    db.exec('PRAGMA user_version = 999');
    assert.throws(() => migrate(db), /newer/);
  } finally {
    db.close();
  }
});

test('rebuild is deterministic, removes deleted nodes, and preserves old index on invalid sources', async (t) => {
  const options = await fixture(t, {
    'a.md': concept('[B](b.md)'),
    'b.md': concept('Searchable token'),
  });
  await compileIndex(options);
  let index = await SqliteKnowledgeIndex.open(options.database);
  const first = index.export();
  assert.equal(index.integrity().ok, true);
  index.close();
  await compileIndex(options);
  index = await SqliteKnowledgeIndex.open(options.database);
  assert.deepEqual(index.export(), first);
  index.close();
  await rm(path.join(options.root, 'b.md'));
  await compileIndex(options);
  index = await SqliteKnowledgeIndex.open(options.database);
  assert.equal(index.getNode('b'), null);
  assert.equal(index.search('Searchable').length, 0);
  assert.equal(index.integrity().ok, true);
  const after = index.export();
  index.close();
  await writeFile(path.join(options.root, 'a.md'), '---\ntype: [broken\n---\n');
  await assert.rejects(compileIndex(options), /YAML/);
  index = await SqliteKnowledgeIndex.open(options.database);
  assert.deepEqual(index.export(), after);
  index.close();
});

test('queries search, invert typed edges and return bounded cycle-safe paths with citations', async (t) => {
  const options = await fixture(t, {
    'a.md': concept(
      'Alpha token',
      'graph_relations:\n  - {target: b.md, relation: precedes, inverse: follows, family: leads_to, contexts: [demo]}\n',
    ),
    'b.md': concept(
      'Beta token',
      'graph_relations:\n  - {target: c.md, relation: precedes, inverse: follows, family: leads_to, contexts: [demo]}\n',
    ),
    'c.md': concept('[Back](a.md)'),
  });
  await compileIndex(options);
  const index = await SqliteKnowledgeIndex.open(options.database);
  t.after(() => index.close());
  assert.equal(index.search('Alpha')[0]!.node.id, 'a');
  assert.equal(index.search('" OR * --').length, 0);
  const incoming = index.neighbors('b', { direction: 'in', family: 'leads_to', context: 'demo' });
  assert.equal(incoming.items.length, 1);
  assert.equal(incoming.items[0]!.label, 'follows');
  assert.equal(incoming.items[0]!.stType, -1);
  assert.equal(incoming.items[0]!.node.id, 'a');
  assert.equal(incoming.items[0]!.evidence[0]!.sourcePath, 'a.md');
  const walk = index.traverse('a', { maxDepth: 4, maxNodes: 10, maxEdges: 20 });
  assert.equal(new Set(walk.nodes.map((n) => n.node.id)).size, walk.nodes.length);
  const route = index.path('a', 'c', { family: 'leads_to', maxDepth: 2 });
  assert.equal(route.found, true);
  assert.deepEqual(
    route.nodes.map((n) => n.id),
    ['a', 'b', 'c'],
  );
  assert.equal(route.steps.length, 2);
  assert.equal(route.steps[1]!.evidence[0]!.sourcePath, 'b.md');
  assert.equal(index.path('a', 'c', { maxDepth: 1, family: 'leads_to' }).found, false);
  assert.equal(index.traverse('a', { maxNodes: 1 }).truncated, true);
  assert.throws(() => index.traverse('a', { maxDepth: 999 }), /maxDepth/);
  assert.throws(() => index.neighbors('a', { limit: -1 }), /limit/);
  assert.throws(() => index.traverse('missing'), /Unknown node/);
});

test('never writes database output inside canonical sources, including dot-prefixed paths and aliases', async (t) => {
  const { root } = await fixture(t, { 'a.md': concept('Canonical source') });
  await assert.rejects(
    compileIndex({ root, database: path.join(root, '..unexpected.sqlite') }),
    /outside/,
  );
  const { symlink } = await import('node:fs/promises');
  const alias = path.join(path.dirname(root), 'source-alias');
  await symlink(root, alias, 'dir');
  await assert.rejects(
    compileIndex({ root, database: path.join(alias, 'index.sqlite') }),
    /outside/,
  );
});

test('repeated links on the same line retain separate source positions', async (t) => {
  const { root } = await fixture(t, {
    'a.md': concept('[B](b.md) [B again](b.md)'),
    'b.md': concept(),
  });
  const graph = projectGraph(await readBundle(root));
  const edge = graph.edges.find((e) => e.source === 'a' && e.target === 'b')!;
  const evidence = graph.evidence.filter((e) => e.edgeId === edge.id);
  assert.equal(evidence.length, 2);
  assert.deepEqual(
    evidence.map((e) => e.sourceColumn).sort((a, b) => a! - b!),
    [1, 11],
  );
});

test('a failed SQL rebuild rolls back all graph tables and the search index', async (t) => {
  const { storeGraph } = await import('@astrokjs/okf/sqlite');
  const { root } = await fixture(t, { 'a.md': concept('Original searchable body') });
  const graph = projectGraph(await readBundle(root));
  const db = await WasmDatabase.open();
  try {
    storeGraph(db, graph);
    const original = db.prepare('SELECT * FROM nodes ORDER BY id').all();
    const bad = structuredClone(graph);
    bad.edges[0]!.target = 'nonexistent';
    assert.throws(() => storeGraph(db, bad), /FOREIGN KEY/);
    assert.deepEqual(db.prepare('SELECT * FROM nodes ORDER BY id').all(), original);
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM node_search WHERE node_search MATCH 'searchable'")
        .get()!.n,
      1,
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('OKF 0.3 metadata paths retain field provenance through JSON and SQLite', async (t) => {
  const options = await fixture(t, {
    'index.md': '---\nokf_version: "0.3"\n---\n# Contents\n- [A](nested/a.md)',
    'nested/a.md': concept(
      '[B](b.md)',
      'resource: b.md\nsources: {resource: /root.md, x-data: {keep: true}}\ncomputation: ../code.sql\nexecutor: {resource: b.md}\nattester: {resource: ../root.md}\nstatus: deprecated\nsuperseded_by: b.md\n',
    ),
    'nested/b.md': concept(),
    'root.md': concept(),
    'code.sql': 'SELECT 1',
  });
  const graph = projectGraph(await readBundle(options.root));
  const memory = KnowledgeGraph.fromJSON(KnowledgeGraph.fromGraph(graph).export());
  assert.equal(memory.export().schemaVersion, 2);
  assert.equal(memory.export().evidence.filter((e) => e.kind === 'metadata_path').length, 5);
  const proofs = graph.evidence.filter((e) => e.kind === 'metadata_path');
  assert.deepEqual(proofs.map((e) => e.detail).sort(), [
    'attester.resource',
    'executor.resource',
    'resource',
    'sources[0].resource',
    'superseded_by',
  ]);
  assert.ok(proofs.every((e) => e.sourcePath === 'nested/a.md'));
  assert.equal(graph.edges.filter((e) => e.source === 'nested/a').length, 2);
  await compileIndex(options);
  const index = await SqliteKnowledgeIndex.open(options.database);
  t.after(() => index.close());
  assert.equal(
    index
      .export()
      .edges.flatMap((e) => e.evidence)
      .filter((e) => e.kind === 'metadata_path').length,
    5,
  );
  assert.equal(index.integrity().ok, true);
});

test('metadata paths are file-relative with a legacy fallback, never external reads', async (t) => {
  for (const version of ['0.2', '0.3', '9.0']) {
    const { root } = await fixture(t, {
      'index.md': `---\nokf_version: "${version}"\n---\n# Contents\n- [A](nested/a.md)`,
      'nested/a.md': concept(
        '',
        'sources:\n  - {resource: root.md}\n  - {resource: "../space%20name.md"}\n  - {resource: "../../private.md"}\n  - {resource: "all queries in project X"}\n  - {resource: "https://example.com/a.md"}\n  - {resource: /index.md}\n',
      ),
      'root.md': concept(),
      'space name.md': concept(),
    });
    const graph = projectGraph(await readBundle(root));
    const targets = graph.edges
      .filter((e) => e.source === 'nested/a')
      .map((e) => e.target)
      .sort();
    assert.deepEqual(targets, version === '0.2' ? ['root', 'space name'] : ['space name']);
    assert.ok(!graph.nodes.some((n) => n.id === 'private'));
  }
});

test('schema 3 preserves existing evidence while allowing metadata path evidence', async () => {
  const db = await WasmDatabase.open();
  try {
    migrate(db, 2);
    db.exec(`INSERT INTO sources VALUES ('a.md', 'hash');
      INSERT INTO nodes VALUES ('a', 'concept', 'A', '', 'Kind', '', '{}', 'a.md');
      INSERT INTO relations VALUES ('ref', 'ref', 'back', 'reference', NULL);
      INSERT INTO edges VALUES ('edge', 'a', 'a', 'ref', 'structural', 1, NULL);
      INSERT INTO evidence VALUES ('old', 'edge', 'a.md', NULL, 1, 1, NULL, 'markdown_link', NULL);`);
    migrate(db);
    assert.equal(
      db.prepare("SELECT kind FROM evidence WHERE id = 'old'").get()!.kind,
      'markdown_link',
    );
    db.exec(
      "INSERT INTO evidence VALUES ('new', 'edge', 'a.md', NULL, NULL, NULL, NULL, 'metadata_path', 'resource')",
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM evidence').get()!.n, 2);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('malformed optional metadata paths produce diagnostics rather than aborting graph publication', async (t) => {
  const { root } = await fixture(t, {
    'a.md': concept('', 'resource: "b.md#first\\nsecond"\n'),
    'b.md': concept(),
  });
  const graph = projectGraph(await readBundle(root));
  assert.ok(graph.diagnostics.some((message) => message.includes('resource')));
  assert.ok(!graph.edges.some((edge) => edge.source === 'a'));
});
