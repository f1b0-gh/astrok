import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateSite } from '../lib/site/generate.mjs';

async function fixture(t, files) {
  const temp = await mkdtemp(path.join(tmpdir(), 'okf-site-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const options = { root: path.join(temp, 'knowledge'), docsDir: path.join(temp, 'docs'), publicDir: path.join(temp, 'public') };
  await mkdir(options.root);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(options.root, file)), { recursive: true });
    await writeFile(path.join(options.root, file), text);
  }
  return options;
}
const source = (body, extra = '') => `---\ntype: Experimental\n${extra}---\n${body}`;

test('generates clean pages, canonical links, raw sources and metadata manifest', async t => {
  const raw = source('# Topic\n[Tokens](nested/auth.md#tokens)\n[Ref][a]\n\n[a]: /nested/auth.md\n\n```yaml\ntype: example\n```', 'title: Topic\ncustom: {flag: true}\n');
  const options = await fixture(t, {
    'topic.md': raw,
    'nested/auth.md': source('## Tokens\n![Diagram](diagram.svg)'),
    'nested/diagram.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  });
  await generateSite(options);
  const page = await readFile(path.join(options.docsDir, 'topic.md'), 'utf8');
  assert.match(page, /\/nested\/auth\/#tokens/);
  assert.match(page, /\[a\]: \/nested\/auth\//);
  assert.doesNotMatch(page, /custom:|flag:/);
  assert.doesNotMatch(page.split("---\n").slice(2).join("---\n"), /Experimental/);
  assert.match(page, /type: example/); // Code examples must survive metadata stripping.
  assert.equal(await readFile(path.join(options.publicDir, 'okf/topic.md'), 'utf8'), raw);
  const manifest = JSON.parse(await readFile(path.join(options.publicDir, 'okf/manifest.json'), 'utf8'));
  const topic = manifest.documents.find(d => d.id === 'topic');
  assert.deepEqual(topic.metadata.custom, { flag: true });
  assert.equal(topic.url, '/topic/');
  assert.equal(topic.sourceUrl, '/okf/topic.md');
  const authPage = await readFile(path.join(options.docsDir, 'nested/auth.md'), 'utf8');
  assert.match(authPage, /\/okf\/nested\/diagram.svg/);
  await access(path.join(options.publicDir, 'okf/nested/diagram.svg'));
  assert.match(await readFile(path.join(options.docsDir, 'index.md'), 'utf8'), /\/topic\//);
});

test('rebuild is deterministic and removes deleted source pages and assets', async t => {
  const options = await fixture(t, { 'topic.md': source('Body'), 'old.txt': 'old asset' });
  await generateSite(options);
  const before = await readFile(path.join(options.publicDir, 'okf/manifest.json'), 'utf8');
  await generateSite(options);
  assert.equal(await readFile(path.join(options.publicDir, 'okf/manifest.json'), 'utf8'), before);
  await rm(path.join(options.root, 'topic.md'));
  await rm(path.join(options.root, 'old.txt'));
  await generateSite(options);
  await assert.rejects(access(path.join(options.docsDir, 'topic.md')));
  await assert.rejects(access(path.join(options.publicDir, 'okf/topic.md')));
  await assert.rejects(access(path.join(options.publicDir, 'okf/old.txt')));
});

test('index routes resolve to directory URLs and case and spaces are retained', async t => {
  const options = await fixture(t, {
    'index.md': '# Home\n- [Guide](Guide%20One.md)\n- [Nested](nested/)\n',
    'Guide One.md': source('[Home](/index.md)'),
    'nested/index.md': '# Nested\n- [Home](/index.md)\n',
  });
  const result = await generateSite(options);
  assert.deepEqual(result.warnings, []);
  const manifest = JSON.parse(await readFile(path.join(options.publicDir, 'okf/manifest.json'), 'utf8'));
  assert.equal(manifest.documents.find(d => d.path === 'Guide One.md').url, '/Guide%20One/');
  assert.equal(manifest.documents.find(d => d.path === 'nested/index.md').url, '/nested/');
  assert.equal(manifest.documents.find(d => d.path === 'index.md').url, '/');
});

test('fails on route collisions and invalid input before replacing good output', async t => {
  const options = await fixture(t, { 'topic.md': source('Valid') });
  await generateSite(options);
  await mkdir(path.join(options.root, 'topic'));
  await writeFile(path.join(options.root, 'topic/index.md'), '# Topic\n- [Home](/index.md)');
  await assert.rejects(generateSite(options), /collision/i);
  await rm(path.join(options.root, 'topic'), { recursive: true });
  await writeFile(path.join(options.root, 'topic.md'), source('Bad', 'type: Duplicate\n'));
  await assert.rejects(generateSite(options), /YAML/);
  assert.match(await readFile(path.join(options.docsDir, 'topic.md'), 'utf8'), /Valid/);
});

test('regeneration supports replacing an asset directory with a file and back', async t => {
  const options = await fixture(t, { 'topic.md': source('Body'), 'assets/a.svg': '<svg/>' });
  await generateSite(options);
  await rm(path.join(options.root, 'assets'), { recursive: true });
  await writeFile(path.join(options.root, 'assets'), 'replacement');
  await generateSite(options);
  assert.equal(await readFile(path.join(options.publicDir, 'okf/assets'), 'utf8'), 'replacement');
  await rm(path.join(options.root, 'assets'));
  await mkdir(path.join(options.root, 'assets'));
  await writeFile(path.join(options.root, 'assets/new.svg'), '<svg/>');
  await generateSite(options);
  assert.equal(await readFile(path.join(options.publicDir, 'okf/assets/new.svg'), 'utf8'), '<svg/>');
});
