// Exercise client rebuilds in a disposable consumer; never edit maintained inputs.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const consumer = process.argv[2];
if (!consumer || !path.isAbsolute(consumer)) throw new Error('Pass the absolute path of a disposable packed consumer');
const file = path.join(consumer, 'src/client/workspace.tsx');
const original = await readFile(file, 'utf8');
const nativeFile = path.join(consumer, 'src/components/Counter.tsx');
const nativeOriginal = await readFile(nativeFile, 'utf8');
const edited = original.replace('Load rows</button>', 'Reload rows</button>');
assert.notEqual(edited, original, 'Expected the source button label to edit');
const port = process.env.ASTROK_DEV_PORT || '4341';
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dev.mjs'], { cwd: consumer, env: { ...process.env, ASTROK_BASE: '/', ASTROK_DEV_PORT: port }, stdio: 'inherit' });
const frames = [];
const consoleMessages = [];
const pageErrors = [];
let browser;
async function waitUntil(condition, timeout, message) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
try {
  const deadline = Date.now() + 30000;
  while (true) {
    if (server.exitCode !== null) throw new Error(`Dev server exited ${server.exitCode}`);
    const response = await fetch(origin, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (response) await response.arrayBuffer();
    if (response?.ok) break;
    if (Date.now() > deadline) throw new Error('Dev server readiness timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage();
  page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    const frame = JSON.parse(String(payload));
    if (frame.type !== 'custom') frames.push(frame);
  }));
  await page.goto(`${origin}/workspace/`);
  await page.getByRole('button', { name: 'Load rows', exact: true }).first().waitFor();
  await waitUntil(() => frames.some(frame => frame.type === 'connected'), 5000, 'Vite browser WebSocket did not connect');
  const beforeEdit = frames.length;
  await writeFile(file, edited);
  await page.getByRole('button', { name: 'Reload rows', exact: true }).first().waitFor({ timeout: 20000 });
  assert.ok(frames.slice(beforeEdit).some(frame => frame.type === 'full-reload' || frame.updates?.some(update => update.acceptedPath?.includes('/.client/workspace.js'))), 'Expected a browser HMR or reload frame for the compiler output');
  const first = page.locator('[data-workspace="first"]');
  await first.getByRole('button', { name: 'Count click' }).click();
  await page.waitForFunction(() => document.querySelector('[data-workspace="first"] [data-clicks]')?.textContent === '1');
  await page.goto(`${origin}/solid/`);
  await page.locator('[data-counter="first"] button').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
  const nativeEdited = nativeOriginal.replace('Count {props.name}', 'Updated {props.name}');
  assert.notEqual(nativeEdited, nativeOriginal);
  await writeFile(nativeFile, nativeEdited);
  await page.getByRole('button', { name: 'Updated first', exact: true }).waitFor({ timeout: 20000 });
  const output = page.locator('[data-counter="first"] output');
  const before = Number(await output.textContent());
  await page.getByRole('button', { name: 'Updated first', exact: true }).click();
  await page.waitForFunction(expected => document.querySelector('[data-counter="first"] output')?.textContent === String(expected), before + 1);
  assert.deepEqual(pageErrors, [], 'Development browser errors');
  console.log('PASS: Solid source edit updates the Astro development browser through Vite; one live click handler. Native Astro/Solid component HMR also passed.');
} catch (error) {
  console.error('Browser Vite frames:', JSON.stringify(frames));
  console.error('Browser console:', consoleMessages.join('\n'));
  console.error('Browser errors:', pageErrors.join('\n'));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  await writeFile(file, original);
  await writeFile(nativeFile, nativeOriginal);
}
