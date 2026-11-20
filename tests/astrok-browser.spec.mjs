import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const base = process.env.ASTROK_BASE || '/';
test('static documentation and agent source work without JavaScript', async ({ browser, request, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}${base}`);
  await expect(page.getByRole('heading', { name: 'astrok workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Read the guide' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace guide' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('type: Guide');
  const manifest = await (await request.get(`${base}okf/manifest.json`)).json();
  expect(manifest.documents.find(row => row.path === 'guide.md').metadata.future).toEqual({ nested: { retained: true } });
  for (const row of manifest.documents) {
    expect((await request.get(row.sourceUrl)).ok()).toBeTruthy();
    expect((await request.get(row.url)).ok()).toBeTruthy();
  }
  await context.close();
});

test('shared controls, stream, table, request replacement and instance isolation', async ({ page }) => {
  const rowRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname === `${base}api/rows`) rowRequests.push(request.url()); });
  await page.goto(`${base}workspace/`);
  const first = page.locator('[data-workspace="first"]');
  const second = page.locator('[data-workspace="second"]');
  await expect(first.locator('[data-summary]')).toHaveText('Before mount');
  await first.getByRole('button', { name: 'Select beta' }).click();
  await expect(first.locator('[data-selected]')).toHaveText('beta');
  await expect(second.locator('[data-selected]')).toHaveText('alpha');
  await first.getByRole('button', { name: 'Toggle selection' }).click();
  await expect(first.locator('[data-selected]')).toHaveText('alpha');
  await expect(first.getByLabel('Selection')).toHaveValue('alpha');
  await first.getByLabel('Selection').selectOption('alpha');
  await expect(first.locator('[data-selected]')).toHaveText('alpha');
  await first.getByRole('button', { name: 'Load rows' }).click();
  await first.getByLabel('Selection').selectOption('beta');
  await first.getByRole('button', { name: 'Load rows' }).click();
  await expect(first.getByRole('cell', { name: 'beta item 1', exact: true })).toBeVisible();
  expect(rowRequests).toHaveLength(2);
  await expect(first.getByRole('cell', { name: 'alpha item 1', exact: true })).toHaveCount(0);
  await first.getByRole('button', { name: 'Stream summary' }).click();
  await expect(first.locator('[data-summary]')).toHaveText('Stream complete');
  await expect(first.locator('[data-fragment-message]')).toHaveText('Server fragment updated');
  await first.getByRole('button', { name: 'Request failure' }).click();
  await expect(first.getByRole('alert')).toContainText('503');
  await first.getByRole('button', { name: 'Load rows' }).click();
  await expect(first.getByRole('cell', { name: 'beta item 1', exact: true })).toBeVisible();
  expect(rowRequests).toHaveLength(4);
});

test('disposal, remount and morph boundaries retain one live owner', async ({ page }) => {
  await page.goto(`${base}workspace/`);
  const first = page.locator('[data-workspace="first"]');
  await first.getByRole('button', { name: 'Select beta' }).click();
  await expect(first.locator('[data-selected]')).toHaveText('beta');
  await page.getByRole('button', { name: 'Remount workspaces' }).click();
  await expect(first.locator('[data-selected]')).toHaveText('alpha');
  await first.getByRole('button', { name: 'Count click' }).click();
  await expect(first.locator('[data-clicks]')).toHaveText('1');
  await first.getByRole('button', { name: 'Try protected patch' }).click();
  await expect(first.getByRole('alert')).toContainText('protected');
  await expect(first.getByRole('button', { name: 'Load rows' })).toBeVisible();
  await first.getByLabel('Fragment note').fill('Keep my draft');
  await first.getByRole('button', { name: 'Stream summary' }).evaluate(button => { if (button instanceof HTMLButtonElement) button.click(); });
  await expect(first.locator('[data-fragment-message]')).toHaveText('Server fragment updated');
  await expect(first.getByLabel('Fragment note')).toBeFocused();
  await expect(first.getByLabel('Fragment note')).toHaveValue('Keep my draft');
  const token = await page.evaluate(() => {
    const value = crypto.randomUUID();
    Reflect.set(window, '__astrokNavigationTest', value);
    return value;
  });
  await page.getByRole('link', { name: 'Alternate workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alternate workspace', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__astrokNavigationTest'))).toBe(token);
  await expect(first.locator('[data-clicks]')).toHaveText('0');
  await first.getByRole('button', { name: 'Count click' }).click();
  await expect(first.locator('[data-clicks]')).toHaveText('1');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'astrok workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Open workspace' }).click();
  await expect(first.locator('[data-clicks]')).toHaveText('0');
});

test('fixture validates routes and preserves exact integer payloads', async ({ request }) => {
  expect((await request.get(`${base}api/rows?selection=invalid`)).status()).toBe(400);
  expect((await request.get(`${base}api/stream?region=unknown`)).status()).toBe(400);
  expect((await request.post(`${base}api/rows?selection=alpha`)).status()).toBe(404);
  const rows = await (await request.get(`${base}api/rows?selection=beta`)).json();
  expect(rows.rows[0].id).toBe('18446744073709551000');
});

test('static reading loads no scripts and data requests stay on demand', async ({ page }, testInfo) => {
  const scripts = [];
  const bodies = [];
  const api = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith(`${base}api/`)) api.push(request.url()); });
  page.on('response', response => {
    if (response.request().resourceType() === 'script') {
      scripts.push(response.url());
      bodies.push(response.body().then(bytes => bytes.length));
    }
  });
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'astrok workspace' })).toBeVisible();
  expect(scripts).toHaveLength(0);
  await page.getByRole('link', { name: 'Open workspace' }).click();
  await expect(page.locator('[data-workspace="first"] [data-summary]')).toHaveText('Before mount');
  expect(api).toHaveLength(0);
  const sizes = await Promise.all(bodies);
  const metrics = { base, project: testInfo.project.name, scripts: scripts.length, decodedJavaScriptBytes: sizes.reduce((sum, value) => sum + value, 0), initialDataRequests: api.length };
  await writeFile(testInfo.outputPath('payload.json'), JSON.stringify(metrics, null, 2) + '\n');
  await testInfo.attach('payload', { body: JSON.stringify(metrics), contentType: 'application/json' });
});

test('stale hypermedia unmount preserves a remount and final disposal stops observation', async ({ page }) => {
  const { build } = await import('vite');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const root = process.env.ASTROK_CONSUMER || fileURLToPath(new URL('../examples/workspace/', import.meta.url));
  const entry = path.join(root, '__astrok_lifecycle_test__.js');
  // Resolve public entrypoints from the selected consumer, including its tarballs.
  const result = await build({
    root, configFile: false, logLevel: 'silent',
    plugins: [{
      name: 'astrok-lifecycle-test-entry',
      resolveId(id) { if (id === entry) return entry; },
      load(id) { if (id === entry) return 'export {createHypermedia} from "@astrok/runtime/hypermedia"; export {createSharedState} from "@astrok/runtime";'; },
    }],
    build: { write: false, lib: { entry, formats: ['es'] } },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const module = outputs.flatMap(output => output.output).find(output => output.type === 'chunk' && output.isEntry);
  expect(module).toBeTruthy();
  await page.route('**/__astrok_lifecycle_test__.js', route => route.fulfill({ contentType: 'text/javascript', body: module.code }));
  await page.goto(base);
  const observed = await page.evaluate(async () => {
    const { createHypermedia, createSharedState } = await import('/__astrok_lifecycle_test__.js');
    const shared = createSharedState({ clicks: 0 }, input => {
      if (!input || typeof input !== 'object' || typeof input.clicks !== 'number') throw new Error('Invalid click count');
      return { clicks: input.clicks };
    });
    const root = document.createElement('section');
    root.innerHTML = '<button data-on:click="$clicks = $clicks + 1">Original</button>';
    document.body.append(root);
    const NativeMutationObserver = window.MutationObserver;
    let callbacks = 0;
    // Keep the real browser observer; count deliveries to detect orphaned observers.
    window.MutationObserver = class extends NativeMutationObserver {
      constructor(callback) { super((records, observer) => { callbacks++; callback(records, observer); }); }
    };
    const hypermedia = createHypermedia(shared, { allowedPaths: [] });
    try {
      const staleUnmount = hypermedia.mount(root);
      staleUnmount();
      hypermedia.mount(root);
      staleUnmount();
      root.querySelector('button').click();
      const afterStaleUnmount = shared.state.clicks;
      const added = document.createElement('button');
      added.setAttribute('data-on:click', '$clicks = $clicks + 1');
      root.append(added);
      await new Promise(resolve => setTimeout(resolve, 0));
      added.click();
      const afterAddedControl = shared.state.clicks;
      hypermedia.dispose();
      const beforeDisposedMutation = callbacks;
      root.append(document.createElement('span'));
      await new Promise(resolve => setTimeout(resolve, 0));
      root.querySelector('button').click();
      added.click();
      return { afterStaleUnmount, afterAddedControl, afterDisposal: shared.state.clicks, callbacksAfterDisposal: callbacks - beforeDisposedMutation };
    } finally {
      hypermedia.dispose();
      shared.dispose();
      window.MutationObserver = NativeMutationObserver;
      root.remove();
    }
  });
  expect(observed).toEqual({ afterStaleUnmount: 1, afterAddedControl: 2, afterDisposal: 2, callbacksAfterDisposal: 0 });
});

test('AI agents page is discoverable without scripts and exposes canonical sources', async ({ browser, request, baseURL, viewport }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  const page = await context.newPage();
  await page.goto(`${baseURL}${base}`);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'AI agents', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}${base}agents/`);
  await expect(page.getByRole('heading', { name: 'For AI agents', exact: true })).toBeVisible();
  await expect(page.locator('pre')).toContainText('<SITE_BASE_URL>/okf/manifest.json');
  await expect(page.locator('body')).not.toContainText('type: Guide');
  await expect(page.locator('script')).toHaveCount(0);
  const source = page.getByRole('link', { name: 'View Markdown', exact: true });
  await expect(source).toHaveAttribute('href', `${base}okf/agents.md`);
  const markdown = await request.get(await source.getAttribute('href'));
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain('title: For AI agents');
  const manifest = await (await request.get(`${base}okf/manifest.json`)).json();
  expect(manifest.documents.find(document => document.id === 'agents')).toMatchObject({
    path: 'agents.md', url: `${base}agents/`, sourceUrl: `${base}okf/agents.md`, type: 'Guide',
  });
  for (const href of await page.locator('main a').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
    if (href?.startsWith(base)) expect((await request.get(href)).ok()).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await context.close();
});
