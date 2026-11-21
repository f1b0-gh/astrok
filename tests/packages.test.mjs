import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const source = '---\ntype: Future Kind\ncustom: {nested: {retained: true}}\n---\n# Topic\n[Other](other.md)\n![Asset](image.svg)\n';
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'astrok-packages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'knowledge');
  await mkdir(root);
  await writeFile(path.join(root, 'topic.md'), source);
  await writeFile(path.join(root, 'other.md'), '---\ntype: Another Future Kind\n---\n# Other\n');
  await writeFile(path.join(root, 'image.svg'), '<svg/>');
  return { directory, root };
}

test('package root preserves parser exports and future nested metadata', async () => {
  const { parseSource, parseDocument, readBundle } = await import('@astrok/okf');
  assert.equal(typeof readBundle, 'function');
  assert.equal(parseDocument, parseSource);
  const result = parseDocument(source, 'topic.md');
  assert.deepEqual(result.errors, []);
  assert.equal(result.document.type, 'Future Kind');
  assert.deepEqual(result.document.metadata.custom, { nested: { retained: true } });
});

test('site exports preserve base URLs across pages, raw sources, links and manifest', async t => {
  const { generateSite, loadSite } = await import('@astrok/okf/site');
  const { root, directory } = await fixture(t);
  const publicDir = path.join(directory, 'public');
  const docsDir = path.join(directory, 'docs');
  await generateSite({ root, docsDir, publicDir, base: '/portal/' });
  const manifest = JSON.parse(await readFile(path.join(publicDir, 'okf/manifest.json'), 'utf8'));
  const topic = manifest.documents.find(document => document.id === 'topic');
  assert.equal(topic.url, '/portal/topic/');
  assert.equal(topic.sourceUrl, '/portal/okf/topic.md');
  assert.equal(topic.links[0].url, '/portal/other/');
  assert.match(await readFile(path.join(docsDir, 'topic.md'), 'utf8'), /\/portal\/other\//);
  assert.equal(await readFile(path.join(publicDir, 'okf/topic.md'), 'utf8'), source);
  const site = await loadSite({ root, base: '/portal/' });
  assert.match(site.documents.find(document => document.id === 'topic').body, /\/portal\/okf\/image.svg/);
});

test('generator refuses caller-owned directories and symlinked output without removing files', async t => {
  const { generateSite } = await import('@astrok/okf/site');
  const { root, directory } = await fixture(t);
  const docsDir = path.join(directory, 'caller');
  await mkdir(docsDir);
  await writeFile(path.join(docsDir, 'keep.md'), 'Caller content');
  const publicDir = path.join(directory, 'public');
  await assert.rejects(generateSite({ root, docsDir, publicDir }), /owned|ownership/i);
  assert.equal(await readFile(path.join(docsDir, 'keep.md'), 'utf8'), 'Caller content');
  await symlink(docsDir, path.join(directory, 'linked'));
  await assert.rejects(generateSite({ root, docsDir: path.join(directory, 'linked'), publicDir }), /symbolic|symlink|owned/i);
});

test('integration validates options before mutation and supports plain Astro without Starlight', async t => {
  const { okfIntegration } = await import('@astrok/astro');
  assert.throws(() => okfIntegration({ graph: 'invalid' }), /graph/);
  assert.throws(() => okfIntegration({ mystery: true }), /mystery/);
  const { root, directory } = await fixture(t);
  const publicDir = path.join(directory, 'public');
  const integration = okfIntegration({ root, publicDir, presentation: 'plain', graph: false, base: '/portal/' });
  let update;
  await integration.hooks['astro:config:setup']({
    config: { root: new URL('file://' + directory + '/'), base: '/portal/', publicDir: new URL('file://' + publicDir + '/') },
    updateConfig(value) { update = value; }, logger: { info() {}, warn() {} },
  });
  assert.ok(update.vite.plugins.length);
  const manifest = JSON.parse(await readFile(path.join(publicDir, 'okf/manifest.json'), 'utf8'));
  assert.equal(manifest.documents[0].url.startsWith('/portal/'), true);
});

test('graph publication keeps provenance and base-aware guides without importing SQLite', async t => {
  const { publishIndex, KnowledgeGraph } = await import('@astrok/okf/graph');
  const { root, directory } = await fixture(t);
  const publicDir = path.join(directory, 'public');
  const publication = await publishIndex({ root, publicDir, sqlite: false, base: '/portal/' });
  assert.equal(publication.database, null);
  assert.equal(publication.graph.nodes.find(node => node.id === 'topic').url, '/portal/topic/');
  const graph = KnowledgeGraph.fromJSON(publication.graph);
  assert.equal(graph.getNode('topic').sourcePath, 'topic.md');
  assert.equal(graph.getNode('topic').url, '/portal/topic/');
  assert.equal(graph.getNode('topic').sourceUrl, '/portal/okf/topic.md');
  assert.equal(graph.search('Topic')[0].node.url, '/portal/topic/');
  assert.equal(graph.export().nodes.find(node => node.id === 'topic').url, '/portal/topic/');
  const evidence = graph.neighbors('topic').items.flatMap(item => item.evidence);
  assert.ok(evidence.some(item => item.pageUrl === '/portal/topic/#topic' && item.sourceUrl === '/portal/okf/topic.md#topic'));
  assert.ok(publication.graph.evidence.some(evidence => evidence.sourcePath === 'topic.md'));
  const guide = await readFile(path.join(publicDir, 'llms.txt'), 'utf8');
  assert.match(guide, /\]\(\/portal\/okf\/index.md\)/);
  const reference = await readFile(path.join(publicDir, 'graph/query-guide.md'), 'utf8');
  assert.match(reference, /\.generated\/public\/graph\/graph.json/);
  assert.doesNotMatch(reference, /\.generated\/public\/portal\//);
});

test('output ownership rejects source ancestors and links inside an owned tree', async t => {
  const { generateSite } = await import('@astrok/okf/site');
  const { root, directory } = await fixture(t);
  await assert.rejects(generateSite({ root, docsDir: directory, publicDir: path.join(directory + '-public') }), /canonical knowledge/);
  const docsDir = path.join(directory, 'docs');
  const publicDir = path.join(directory, 'public');
  await generateSite({ root, docsDir, publicDir });
  const external = path.join(directory, 'keep.txt');
  await writeFile(external, 'Keep');
  await symlink(external, path.join(docsDir, 'alias.txt'));
  await assert.rejects(generateSite({ root, docsDir, publicDir }), /symbolic/);
  assert.equal(await readFile(external, 'utf8'), 'Keep');
});

test('overlapping page and raw output directories are refused before publication', async t => {
  const { generateSite } = await import('@astrok/okf/site');
  const { root, directory } = await fixture(t);
  const publicDir = path.join(directory, 'public');
  await assert.rejects(generateSite({ root, docsDir: publicDir, publicDir }), /overlap/);
});

test('graph and SQLite generation require explicit opt-in', async t => {
  const { okfOptionsSchema } = await import('@astrok/astro');
  assert.equal(okfOptionsSchema.parse({}).graph, false);
  const { publishIndex } = await import('@astrok/okf/graph');
  const { root, directory } = await fixture(t);
  const publication = await publishIndex({root, publicDir: path.join(directory, 'optional-public')});
  assert.equal(publication.database, null);
  await assert.rejects(readFile(path.join(directory, 'optional-public/graph/knowledge.sqlite')), /ENOENT/);
});

test('default integration publishes sources without a graph directory', async t => {
  const { okfIntegration } = await import('@astrok/astro');
  const { root, directory } = await fixture(t);
  const publicDir = path.join(directory, 'plain-public');
  await okfIntegration({root, publicDir, presentation: 'plain'}).hooks['astro:config:setup']({
    config: {root: new URL('file://' + directory + '/'), base: '/', publicDir: new URL('file://' + publicDir + '/')},
    updateConfig() {}, logger: {info() {}, warn() {}},
  });
  assert.ok(JSON.parse(await readFile(path.join(publicDir, 'okf/manifest.json'), 'utf8')).documents.length);
  await assert.rejects(readFile(path.join(publicDir, 'graph/graph.json')), /ENOENT/);
});
