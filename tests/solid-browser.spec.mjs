import { test, expect } from '@playwright/test';
const base = process.env.ASTROK_BASE || '/';

test('native Solid HTML works without JavaScript and static pages ship no scripts', async ({ browser, baseURL, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}${base}solid/`);
    await expect(page.locator('[data-counter="first"] output')).toHaveText('0');
    await expect(page.getByRole('heading', { name: 'On page load' })).toBeVisible();
    await expect(page.getByText('client:load makes this counter interactive as soon as the page loads.')).toBeVisible();
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
  await page.setViewportSize({width: 900, height: 900});
  await page.locator('astro-island[client="visible"]').scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  expect(await page.locator('[data-counter="first"] button').evaluate(node => node === window.__serverCounter)).toBe(true);
  for (const [name, initial] of [['first', 0], ['second', 0], ['visible', 0], ['media', 0], ['browser', 0]]) {
    const counter = page.locator(`[data-counter="${name}"]`);
    await counter.getByRole('button').click();
    await expect(counter.locator('output')).toHaveText(String(initial + 1));
  }
  await expect(page.getByText('Loading browser counter…')).toHaveCount(0);
  await expect(page.getByText('client:load makes this counter interactive as soon as the page loads.')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Astro navigation disposes hydrated roots and a return navigation installs one handler', async ({ page }) => {
  await page.goto(`${base}solid/`);
  await page.setViewportSize({width: 900, height: 900});
  await page.locator('astro-island[client="visible"]').scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.evaluate(() => {
    window.__disposedCounters = 0;
    document.addEventListener('astrok:counter-disposed', () => window.__disposedCounters++);
  });
  await page.getByRole('link', { name: 'Interactive workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Interactive workspace', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__disposedCounters)).toBe(5);
  await page.evaluate(() => {
    window.__returnedToSolid = false;
    document.addEventListener('astro:page-load', () => { window.__returnedToSolid = true; }, {once: true});
  });
  await page.goBack();
  await page.waitForFunction(() => window.__returnedToSolid);
  await page.setViewportSize({width: 900, height: 900});
  await page.locator('astro-island[client="visible"]').scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await page.locator('[data-counter="first"] button').click();
  await expect(page.locator('[data-counter="first"] output')).toHaveText('1');
});

test('loading modes are explained and the media counter stays static on narrow screens', async ({ page, viewport }, testInfo) => {
  await page.goto(`${base}solid/`);
  await expect(page.getByRole('heading', {name: 'On page load'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'When the browser is idle'})).toBeVisible();
  const media = page.locator('[data-counter="media"]');
  await media.scrollIntoViewIfNeeded();
  if (viewport.width < 768) {
    await expect(media.locator('..')).toHaveAttribute('ssr', '');
    await media.getByRole('button').click();
    await expect(media.locator('output')).toHaveText('0');
  } else {
    await expect(media.locator('..')).not.toHaveAttribute('ssr', '');
  }
  await expect(page.locator('main')).toContainText('viewport width of at least 768 pixels');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({path: testInfo.outputPath('solid-loading-modes.png'), fullPage: true});
});
