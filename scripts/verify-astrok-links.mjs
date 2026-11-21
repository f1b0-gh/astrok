import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

// Run the installed Astro CLI against packed packages, with no workspace imports.
const consumer = process.argv[2];
if (!consumer || !path.isAbsolute(consumer)) throw new Error('Expected an absolute consumer directory');
const fixture = await mkdtemp(path.join(consumer, '.link-check-'));
const execute = promisify(execFile);
const valid = '---\ntype: Guide\n---\n# Topic\n[Other](other.md#other)\n';
const invalid = '---\ntype: Guide\n---\n# Topic\n[Missing](missing.md)\n[Heading](other.md#gone)\n';
const topic = path.join(fixture, 'knowledge/topic.md');
const output = path.join(fixture, 'public/okf/topic.md');
async function configure(strictLinks, base = '/') {
  const options = { presentation: 'plain', ...(strictLinks === undefined ? {} : { strictLinks }) };
  await writeFile(path.join(fixture, 'astro.config.mjs'), `import {okfIntegration} from '@astrok/astro';\nexport default {base: ${JSON.stringify(base)}, integrations: [okfIntegration(${JSON.stringify(options)})]};\n`);
}
async function build() {
  try {
    const result = await execute(process.execPath, [path.join(consumer, 'node_modules/astro/bin/astro.mjs'), 'build'], {
      cwd: fixture, timeout: 60000, env: { ...process.env, NO_COLOR: '1' },
    });
    return { code: 0, log: result.stdout + result.stderr };
  } catch (error) {
    if (typeof error.code !== 'number' || error.killed) throw error;
    return { code: error.code, log: error.stdout + error.stderr };
  }
}
try {
  await mkdir(path.join(fixture, 'src/pages'), { recursive: true });
  await mkdir(path.join(fixture, 'knowledge'));
  await writeFile(path.join(fixture, 'package.json'), '{"type":"module","private":true}\n');
  // Exercise the exact README route and Markdown, so the quickstart cannot drift.
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const route = readme.match(/Create `src\/pages\/\[\.\.\.slug\]\.astro`:[\s\S]*?```astro\n([\s\S]*?)```/)?.[1];
  assert.ok(route, 'README plain-mode route');
  await writeFile(path.join(fixture, 'src/pages/[...slug].astro'), route);
  const example = readme.match(/```markdown\n([\s\S]*?)```/)?.[1];
  assert.ok(example, 'README Markdown example');
  await writeFile(path.join(fixture, 'knowledge/first-page.md'), example);
  await writeFile(path.join(fixture, 'knowledge/index.md'), '# Home\n- [First page](first-page.md)\n');
  await mkdir(path.join(fixture, 'knowledge/nested'));
  await writeFile(path.join(fixture, 'knowledge/nested/Guide One.md'), '---\ntype: Guide\n---\n# Nested guide\n[Home](/index.md)\n');
  await writeFile(path.join(fixture, 'knowledge/other.md'), '---\ntype: Guide\n---\n# Other\n');
  await writeFile(topic, valid);
  await configure();
  let result = await build();
  assert.equal(result.code, 0, result.log);
  let page = await readFile(path.join(fixture, 'dist/first-page/index.html'), 'utf8');
  assert.match(page, /<title>My first page<\/title>/);
  assert.match(page, /<h1[^>]*>My first page<\/h1>/);
  assert.match(page, /href="\/"/);
  assert.doesNotMatch(page, /type: Guide|description: A short/);
  await readFile(path.join(fixture, 'dist/nested/Guide One/index.html'));
  const manifestPath = path.join(fixture, 'public/okf/manifest.json');
  const manifest = await readFile(manifestPath, 'utf8');
  await writeFile(topic, invalid);
  result = await build();
  assert.equal(result.code, 1, result.log);
  assert.match(result.log, /topic.md:5: missing target missing.md/);
  assert.match(result.log, /topic.md:6: missing heading #gone/);
  assert.equal(await readFile(output, 'utf8'), valid);
  assert.equal(await readFile(manifestPath, 'utf8'), manifest);

  await configure(false, '/portal/');
  result = await build();
  assert.equal(result.code, 0, result.log);
  assert.match(result.log, /missing target missing.md/);
  assert.match(result.log, /missing heading #gone/);
  assert.equal(await readFile(output, 'utf8'), invalid);
  page = await readFile(path.join(fixture, 'dist/first-page/index.html'), 'utf8');
  assert.match(page, /href="\/portal\/"/);
  await readFile(path.join(fixture, 'dist/nested/Guide One/index.html'));

  await configure();
  await writeFile(topic, valid);
  await writeFile(path.join(fixture, 'knowledge/untyped.md'), '# Untyped\n');
  result = await build();
  assert.equal(result.code, 0, result.log);
  assert.match(result.log, /untyped.md/);
  console.log('Packed consumer link checks passed: strict failure, preserved output, warning opt-out and repair.');
} finally {
  await rm(fixture, { recursive: true, force: true });
}
