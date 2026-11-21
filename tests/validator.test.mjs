import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec = promisify(execFile);

test('strict validation fails unresolved links and headings, preserving ordinary warnings', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'astrok-validate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'topic.md');
  const run = (...args) => exec(process.execPath, ['scripts/validate-okf.mjs', root, ...args]);
  for (const link of ['missing.md', '#missing']) {
    await writeFile(file, `---\ntype: Future Kind\n---\n# Topic\n[broken](${link})\n`);
    assert.match((await run()).stderr, /WARN/);
    await assert.rejects(
      run('--strict'),
      (error) => error.code === 1 && /missing/.test(error.stderr),
    );
  }
  await writeFile(
    file,
    '---\ntype: Future Kind\nextra: {nested: true}\n---\n# Topic\n[valid](#topic)\n',
  );
  await writeFile(path.join(root, 'untyped.md'), '# Skipped without type\n');
  assert.match((await run('--strict')).stdout, /0 errors/);
  await assert.rejects(run('--strcit'), (error) => error.code !== 0);
});
