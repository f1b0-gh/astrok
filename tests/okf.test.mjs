import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readBundle } from '@astrok/okf';

async function bundle(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'okf-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  return readBundle(root);
}
const concept = (body = '', fields = 'type: Future Type') => `---\n${fields}\n---\n${body}`;

test('preserves unknown YAML metadata, nested structures and path-derived IDs', async t => {
  const result = await bundle(t, { 'guides/my-topic.md': concept('Hello', 'type: Future Type\ncustom: {enabled: true, values: [one, two]}') });
  assert.deepEqual(result.errors, []);
  assert.equal(result.documents[0].id, 'guides/my-topic');
  assert.equal(result.documents[0].title, 'My Topic');
  assert.deepEqual(result.documents[0].metadata.custom, { enabled: true, values: ['one', 'two'] });
  assert.equal(result.documents[0].body, 'Hello');
});

test('rejects malformed YAML and non-mapping frontmatter', async t => {
  for (const fields of ['type: [broken', '- sequence', 'null', '', 'type: x\ntype: y']) {
    const result = await bundle(t, { 'bad.md': concept('', fields) });
    assert.ok(result.errors.length, fields);
  }

});

test('accepts CRLF, optional fields, unknown types and root version declaration', async t => {
  const result = await bundle(t, {
    'index.md': '---\nokf_version: "0.2"\n---\n# Contents\n\n- [Thing](thing.md)',
    'thing.md': concept('Text').replaceAll('\n', '\r\n'),
    'log.md': '# History\n\n## 2026-10-24\n- Created a thing.\n',
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.documents.find(d => d.path === 'index.md').kind, 'index');
});

test('checks reserved index and log structures without requiring them', async t => {
  for (const files of [
    { 'nested/index.md': concept('# Index\n- [Thing](thing.md)') },
    { 'index.md': 'Just prose.' },
    { 'log.md': '# History\n## Yesterday\n- Updated.' },
    { 'log.md': '# History\n## 2026-02-30\n- Updated.' },
  ]) assert.ok((await bundle(t, files)).errors.length);
  assert.deepEqual((await bundle(t, { 'thing.md': concept() })).errors, []);
});

test('resolves relative, root, reference and fragment links with source heading provenance', async t => {
  const result = await bundle(t, {
    'guides/start.md': concept('## Next\n[Auth](../auth.md#tokens)\n[Root](/auth.md)\n[Ref][a]\n\n[a]: ../auth.md\n\n```md\n[Not a link](missing.md)\n```'),
    'auth.md': concept('## Tokens\nContent'),
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  const links = result.documents.find(d => d.path === 'guides/start.md').links;
  assert.equal(links.length, 3);
  assert.equal(links[0].target, 'auth');
  assert.equal(links[0].fragment, 'tokens');
  assert.equal(links[0].sourceFragment, 'next');
  assert.equal(links[0].sourcePath, 'guides/start.md');
  assert.equal(links[0].line, 5);
  assert.equal(links[0].url, '/auth/#tokens');
});

test('broken links and escaping paths are diagnostics, not conformance errors', async t => {
  const result = await bundle(t, { 'thing.md': concept('[Missing](missing.md) [Escape](../private.md) [Anchor](#absent)') });
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 3);
});

test('sorts documents deterministically and preserves exact source text', async t => {
  const source = concept('Hello\r\n');
  const result = await bundle(t, { 'z.md': source, 'a.md': concept() });
  assert.deepEqual(result.documents.map(d => d.path), ['a.md', 'z.md']);
  assert.equal(result.documents[1].source, source);
});


test('OKF 0.3 skips ordinary Markdown and missing or invalid types with warnings', async t => {
  const result = await bundle(t, {
    'README.md': '# For contributors',
    'notes.md': concept('Notes', 'title: Notes'),
    'empty.md': concept('', 'type: null'),
    'invalid-type.md': concept('', 'type: [x]'),
    'real.md': concept(),
    '.hidden.md': concept(),
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.documents.map(d => d.id), ['real']);
  assert.equal(result.warnings.length, 4);
  assert.equal(result.assets.size, 0);
});

test('root bundle metadata is optional and never becomes concept metadata', async t => {
  const result = await bundle(t, {
    'index.md': '---\ntitle: Bundle\nlicense: MIT\nx-owner: {team: docs}\ntype: Not a concept\n---\n# Contents\n- [Thing](thing.md)',
    'thing.md': concept(),
  });
  assert.deepEqual(result.errors, []);
  const index = result.documents.find(d => d.id === 'index');
  assert.equal(index.kind, 'index');
  assert.equal(index.type, null);
  assert.deepEqual(index.metadata['x-owner'], { team: 'docs' });
  assert.equal(result.documents.find(d => d.id === 'thing').metadata.license, undefined);
});
