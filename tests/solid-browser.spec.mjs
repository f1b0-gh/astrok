import { test, expect } from '@playwright/test';
const base = process.env.ASTROK_BASE || '/';

test('native Solid HTML works without JavaScript and static pages ship no scripts', async ({ browser, baseURL, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}${base}solid/`);
    await expect(page.locator('[data-counter="first"] output')).toHaveText('2');
    await expect(page.getByRole('heading', { name: 'First counter' })).toBeVisible();
    await expect(page.getByText('Default slot from Astro.')).toBeVisible();
    await expect(page.getByText('Loading browser counter…')).toBeVisible();
    const html = await (await request.get(`${base}solid-static/`)).text();
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<astro-island');
    await page.goto(`${baseURL}${base}solid-static/`);
    await expect(page.getByRole('button', { name: 'Count safe <text> & "quotes"' })).toBeVisible();
    await expect(page.locator('output')).toHaveText('23');
  } finally { await context.close(); }
});

test('hydration reuses server nodes and each client directive owns an independent counter', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/*.js', async route => { await gate; await route.continue(); });
  try {
    await page.goto(`${base}solid/`, { waitUntil: 'commit' });
    const first = page.locator('[data-counter="first"] button');
    await expect(first).toBeVisible();
    await first.evaluate(node => { window.__serverCounter = node; });
  } finally { release(); }
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  expect(await page.locator('[data-counter="first"] button').evaluate(node => node === window.__serverCounter)).toBe(true);
  for (const [name, initial] of [['first', 2], ['second', 7], ['visible', 11], ['media', 13], ['browser', 17]]) {
    const counter = page.locator(`[data-counter="${name}"]`);
    await counter.getByRole('button').click();
    await expect(counter.locator('output')).toHaveText(String(initial + 1));
  }
  await expect(page.getByText('Loading browser counter…')).toHaveCount(0);
  await expect(page.getByText('Default slot from Astro.')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Astro navigation disposes hydrated roots and a return navigation installs one handler', async ({ page }) => {
  await page.goto(`${base}solid/`);
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.evaluate(() => {
    window.__disposedCounters = 0;
    document.addEventListener('astrok:counter-disposed', () => window.__disposedCounters++);
  });
  await page.getByRole('link', { name: 'Interactive workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Interactive workspace', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__disposedCounters)).toBe(5);
  await page.goBack();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('[data-counter="first"] button').click();
  await expect(page.locator('[data-counter="first"] output')).toHaveText('3');
});
