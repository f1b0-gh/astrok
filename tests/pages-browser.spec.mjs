import { test, expect } from '@playwright/test';
const base = process.env.ASTROK_BASE || '/';

test('static workspace keeps local interactions and does not call unavailable services', async ({ page, request }) => {
  const errors = [], serviceRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith(`${base}api/`)) serviceRequests.push(request.url()); });
  await page.goto(`${base}workspace/`);
  await expect(page.getByText('Rows and streaming are available in the local preview.')).toBeVisible();
  const first = page.locator('[data-workspace="first"]');
  const second = page.locator('[data-workspace="second"]');
  for (const panel of [first, second]) {
    for (const name of ['Load rows', 'Stream summary', 'Request failure']) await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled();
    await expect(panel.locator('[data-service-notice]')).toContainText('need the local preview server');
    await expect(panel.getByRole('status')).toContainText('Try changing the selection or counting clicks');
  }
  await first.getByRole('button', { name: 'Count click', exact: true }).click();
  await expect(first.locator('[data-clicks]')).toHaveText('1');
  await expect(second.locator('[data-clicks]')).toHaveText('0');
  await first.getByRole('button', { name: 'Toggle selection', exact: true }).click();
  await expect(first.locator('select')).toHaveValue('beta');
  await expect(second.locator('select')).toHaveValue('alpha');
  await page.getByRole('button', { name: 'Remount workspaces', exact: true }).click();
  await expect(first.locator('[data-clicks]')).toHaveText('0');
  await page.getByRole('link', { name: 'Alternate workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Alternate workspace', exact: true })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Load rows', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
  expect(serviceRequests).toEqual([]);
  // This preview has no synthetic API: a successful test cannot rely on fixture.mjs.
  expect((await request.get(`${base}api/rows?selection=alpha`)).status()).toBe(404);
});

test('Pages navigation and source downloads respect the repository prefix', async ({ page, request }) => {
  await page.goto(base);
  await page.getByRole('navigation', {name: 'Main'}).getByText('Demos', {exact: true}).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Solid components', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}solid/$`));
  const manifest = await (await request.get(`${base}okf/manifest.json`)).json();
  for (const doc of manifest.documents) {
    expect(doc.url.startsWith(base)).toBe(true);
    expect(doc.sourceUrl.startsWith(base)).toBe(true);
    expect((await request.get(doc.url)).status()).toBe(200);
    expect((await request.get(doc.sourceUrl)).status()).toBe(200);
  }
});

test('homepage explains Astrok and publishes copyable agent discovery without JavaScript', async ({ browser, baseURL, request, viewport }, testInfo) => {
  const context = await browser.newContext({javaScriptEnabled: false, viewport});
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}${base}`);
    await expect(page.getByRole('heading', {name: 'Astrok', exact: true})).toBeVisible();
    await expect(page.locator('main')).toContainText('Write your docs once, in Markdown.');
    await expect(page.getByRole('link', {name: 'installation instructions'})).toHaveAttribute('href', 'https://github.com/f1b0-gh/astrok/blob/main/knowledge/getting-started.md#use-it-in-your-astro-project');
    const manifest = await (await request.get(`${base}okf/manifest.json`)).json();
    await expect(page.locator('main')).toContainText(`${manifest.documents.length} Markdown files`);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.getByRole('navigation', {name: 'Main'}).getByRole('link', {name: 'GitHub'})).toBeVisible();
    await page.getByText('Demos', {exact: true}).click();
    await expect(page.getByRole('link', {name: 'Workspace', exact: true})).toBeVisible();
    await page.getByText('Demos', {exact: true}).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: testInfo.outputPath('homepage.png'), fullPage: true});
    await page.goto(`${baseURL}${base}agents/`);
    const origin = process.env.ASTROK_SITE || 'http://127.0.0.1:4338';
    await expect(page.locator('[data-agent-prompt]')).toContainText(new URL(`${base}llms.txt`, origin).href);
    await expect(page.locator('[data-agent-prompt]')).toContainText(new URL(`${base}okf/manifest.json`, origin).href);
    await expect(page.locator('main')).not.toContainText('<SITE_BASE_URL>');
    expect((await request.get(`${base}llms.txt`)).ok()).toBe(true);
    expect((await request.get(`${base}graph/graph.json`)).ok()).toBe(true);
    expect((await request.get(`${base}graph/knowledge.sqlite`)).status()).toBe(404);
    for (const dir of ['okf', 'graph']) expect((await request.get(`${base}${dir}/.astrok-owned.json`)).status()).toBe(404);
  } finally { await context.close(); }
});
