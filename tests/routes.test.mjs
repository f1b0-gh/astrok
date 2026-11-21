import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
const exec = promisify(execFile);

test('clean installation builds canonical routes and refreshes source edits in development', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'okf-routes-'));
  let server;
  t.after(async () => {
    if (server && server.exitCode === null) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill('SIGTERM');
      await stopped;
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const file of ['astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json', 'packages', 'examples/workspace/package.json', 'src/components', 'src/styles', 'src/content.config.ts']) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(file, path.join(root, file), { recursive: true, filter: source => !source.split(path.sep).includes('node_modules') });
  }
  await exec('npm', ['ci', '--offline', '--no-audit', '--no-fund'], { cwd: root, timeout: 60000 });
  // The default site must build even when the optional SQL engine is unavailable.
  await rm(path.join(root, 'node_modules/@sqlite.org/sqlite-wasm'), { recursive: true, force: true });
  await mkdir(path.join(root, 'knowledge/nested'), { recursive: true });
  await mkdir(path.join(root, 'knowledge/index'), { recursive: true });
  const files = {
    'index.md': '# Home\n- [Guide](Guide%20One.md)\n- [Nested](nested/)\n- [Private name](_topic.md)\n',
    'Guide One.md': '---\ntype: Future Kind\ncustom: {untouched: true}\n---\n## A heading\n[Home](/index.md)\n',
    'nested/index.md': '# Nested\n- [Guide](/Guide%20One.md#a-heading)\n',
    'index/index.md': '# Index Directory\n- [Guide](/Guide%20One.md)\n',
    '_topic.md': '---\ntype: Future Kind\n---\nUnderscore concept.\n',
  };
  for (const [file, text] of Object.entries(files)) await writeFile(path.join(root, 'knowledge', file), text);
  await exec(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'build'], { cwd: root, timeout: 60000 });
  const manifest = JSON.parse(await readFile(path.join(root, 'dist/okf/manifest.json'), 'utf8'));
  for (const document of manifest.documents) {
    const destination = path.join(root, 'dist', decodeURIComponent(document.url), 'index.html');
    await access(destination);
    const html = await readFile(destination, 'utf8');
    assert.ok(!html.includes('custom: {untouched: true}'));
  }
  for (const name of ['okf', 'graph']) {
    await assert.rejects(readFile(path.join(root, 'dist', name, '.astrok-owned.json')), /ENOENT/);
    assert.match(await readFile(path.join(root, '.generated/public', name, '.astrok-owned.json'), 'utf8'), /@astrok\/okf/);
  }
  const nested = await readFile(path.join(root, 'dist/nested/index.html'), 'utf8');
  assert.match(nested, /href="\/Guide%20One\/#a-heading"/);

  let output = '';
  server = spawn(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'dev', '--host', '127.0.0.1', '--port', '0', '--ignore-lock'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  async function eventually(check) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await check()) return;
      if (server.exitCode !== null) throw new Error(output);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.fail('Development server did not reflect source change. Logs: ' + output);
  }
  let address;
  await eventually(async () => {
    address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    return address && (await fetch(address).catch(() => null))?.ok;
  });
  await writeFile(path.join(root, 'knowledge/_topic.md'), '---\ntype: Future Kind\n---\nUpdated through canonical source.\n');
  await eventually(async () => (await (await fetch(address + '/_topic/')).text()).includes('Updated through canonical source.'));
  await writeFile(path.join(root, 'knowledge/added.md'), '---\ntype: Future Kind\n---\nNew page from canonical source.\n');
  await eventually(async () => (await (await fetch(address + '/added/')).text()).includes('New page from canonical source.'));
  await rm(path.join(root, 'knowledge/added.md'));
  await eventually(async () => (await fetch(address + '/added/')).status === 404);

});
