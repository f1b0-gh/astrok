import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { publishIndex } from '../backend/graph/publish.ts';
import { SqliteKnowledgeIndex } from '../backend/graph/query.ts';
import { WasmDatabase } from '../backend/graph/wasm.ts';
import { OKF_SPEC } from '../backend/graph/version.ts';

const exec = promisify(execFile);
test('CLI builds and queries real WASM snapshot and rejects invalid arguments', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'okf-cli-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'knowledge');
  await mkdir(root);
  await writeFile(path.join(root, 'a.md'), '---\ntype: Custom\n---\nA searchable record.');
  const database = path.join(temp, 'index.sqlite');
  const cli = (...args: string[]) => exec(process.execPath, ['scripts/graph.ts', ...args]);
  const built = JSON.parse((await cli('build', '--root', root, '--db', database)).stdout);
  assert.equal(built.runtime.wasm, true);
  assert.equal(built.runtime.engine, 'sqlite-wasm');
  assert.equal(built.integrity.ok, true);
  assert.equal(built.metadata.okf_spec_version, '0.3');
  assert.equal(JSON.parse((await cli('get', 'a', '--db', database)).stdout).sourcePath, 'a.md');
  assert.equal(JSON.parse((await cli('search', 'searchable', '--db', database)).stdout)[0].node.id, 'a');
  assert.equal(JSON.parse((await cli('neighbors', 'a', '--direction', 'in', '--db', database)).stdout).items[0].node.kind, 'directory');
  assert.equal(JSON.parse((await cli('path', '@directory/', 'a', '--db', database)).stdout).found, true);
  await assert.rejects(cli('traverse', 'a', '--depth', '999', '--db', database), /maxDepth/);
  await assert.rejects(cli('get', 'missing', '--db', database), /Unknown node/);
  await assert.rejects(cli('unknown'), /Unknown command/);
  await assert.rejects(cli('export', '--output', database, '--db', database), /cannot overwrite/);
});

test('published guide explains only query usage plus OKF format/version, and SQL examples run', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'okf-publish-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'knowledge');
  const publicDir = path.join(temp, 'public');
  await mkdir(root);
  await writeFile(path.join(root, 'index.md'), '---\nokf_version: "0.3-future"\n---\n# Contents\n- [Entry](a.md)');
  await writeFile(path.join(root, 'a.md'), '---\ntype: Future Kind\n---\nCORPUS_SENTINEL_NOT_FOR_LLMS_GUIDE');
  await publishIndex({ root, publicDir, sqlite: true });
  const bytes = await readFile(path.join(publicDir, 'graph/knowledge.sqlite'));
  assert.equal(bytes.subarray(0, 16).toString(), 'SQLite format 3\0');
  const index = await SqliteKnowledgeIndex.fromBytes(bytes);
  try {
    assert.equal(index.runtime.wasm, true);
    const exported = index.export();
    assert.equal(exported.metadata.okf_spec_revision, OKF_SPEC.revision);
    assert.equal(exported.metadata.bundle_declared_okf_version, '"0.3-future"');
    const { KnowledgeGraph } = await import('../backend/graph/memory.ts');
    const memory = KnowledgeGraph.fromJSON(JSON.parse(await readFile(path.join(publicDir, 'graph/graph.json'), 'utf8')));
    assert.deepEqual(memory.getNode('a'), index.getNode('a'));
    assert.deepEqual(memory.export().sources, JSON.parse(JSON.stringify(exported.sources)));
  } finally { index.close(); }
  const guide = await readFile(path.join(publicDir, 'llms.txt'), 'utf8');
  assert.match(guide, /OKF.*canonical Markdown/s);
  assert.match(guide, /OKF 0\.3/);
  assert.ok(guide.includes(OKF_SPEC.revision));
  assert.ok(!guide.includes('CORPUS_SENTINEL_NOT_FOR_LLMS_GUIDE'));
  assert.ok(!guide.includes('Future Kind'));
  const reference = await readFile(path.join(publicDir, 'graph/query-guide.md'), 'utf8');
  assert.ok(!reference.includes('CORPUS_SENTINEL_NOT_FOR_LLMS_GUIDE'));
  assert.ok(guide.includes('](/graph/query-guide.md)'));
  assert.ok(reference.includes('KnowledgeGraph.fromJSON'));
  assert.ok(reference.includes('CLI examples:'));
  const db = await WasmDatabase.open(bytes);
  try {
    const sqlGuide = await readFile(path.join(publicDir, 'graph/sqlite-query.txt'), 'utf8');
    const statements = [...sqlGuide.matchAll(/^  (SELECT[\s\S]*?;|PRAGMA[^\n]*;|WITH RECURSIVE[\s\S]*?;)/gm)].map(match => match[1]!.replace(/^  /gm, ''));
    assert.equal(statements.length, 6);
    for (const sql of statements) {
      const runnable = sql.replaceAll(':concept_id', "'a'").replaceAll(':terms', "'CORPUS_SENTINEL_NOT_FOR_LLMS_GUIDE'");
      db.prepare(runnable).all();
    }
  } finally { db.close(); }
});
