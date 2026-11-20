import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('renders canonical documents, working links and code without YAML metadata', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Astrok documentation');
  await page.locator('.sl-markdown-content').getByRole('link', { name: 'Getting started', exact: true }).click();
  await expect(page).toHaveURL(/\/getting-started\/$/);
  await expect(page.locator('pre').first()).toContainText('npm ci');
  await page.goto('/');
  await page.locator('.sl-markdown-content').getByRole('link', { name: 'Write a page', exact: true }).click();
  await expect(page).toHaveURL(/\/writing-content\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Write a page');
  const body = page.locator('.sl-markdown-content');
  await expect(body).not.toContainText('description: Add a canonical');
  await expect(page.getByRole('link', { name: 'View Markdown' })).toHaveAttribute('href', '/okf/writing-content.md');
  await expect(body.getByRole('link', { name: 'OKF specification', exact: true })).toHaveAttribute('href', 'https://okf.md/spec/');
  await page.goto('/solid-rendering/');
  await expect(page.locator('pre').first()).toContainText('client:load');
  await expect(page.locator('.sl-markdown-content')).not.toContainText('type: Guide');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('publishes exact raw Markdown and manifest with source paths', async ({ request }) => {
  const manifest = await (await request.get('/okf/manifest.json')).json();
  expect(manifest.documents.map(document => document.id).sort()).toEqual(['index', 'getting-started', 'writing-content', 'solid-rendering', 'using-with-ai'].sort());
  for (const document of manifest.documents) {
    const response = await request.get(document.sourceUrl);
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe(await readFile(`knowledge/${document.path}`, 'utf8'));
    expect((await request.get(document.url)).status()).toBe(200);
  }
  expect(manifest.documents.find(d => d.id === 'using-with-ai').metadata.tags).toEqual(['agents', 'documentation']);
});

test('keyboard search finds source content and Escape closes the dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  const input = page.locator('.pagefind-ui__search-input');
  await input.fill('slots');
  await expect(page.locator('.pagefind-ui__result-link').first()).toContainText('Render Solid components');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('navigation is accessible on desktop and mobile', async ({ page, isMobile }) => {
  await page.goto('/getting-started/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  if (isMobile) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.locator('#starlight__sidebar')).toBeVisible();
    await page.locator('#starlight__sidebar').getByRole('link', { name: 'Write a page', exact: true }).click();
    await expect(page).toHaveURL(/\/writing-content\/$/);
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('published OKF graph supports SQL-free queries and source navigation', async ({ request }) => {
  const { KnowledgeGraph } = await import('../../backend/graph/memory.ts');
  const response = await request.get('/graph/graph.json');
  expect(response.status()).toBe(200);
  const index = KnowledgeGraph.fromJSON(await response.json());
  expect(index.runtime.engine).toBe('okf-memory');
  expect(index.search('slots')[0].node.id).toBe('solid-rendering');
  expect(index.export().metadata.okf_spec_version).toBe('0.3');
  expect(index.export().metadata.graph_model).toBe('gamma34/0.1');
  const { SqliteKnowledgeIndex } = await import('../../backend/graph/query.ts');
  const sqliteResponse = await request.get('/graph/knowledge.sqlite');
  expect(sqliteResponse.status()).toBe(200);
  const sql = await SqliteKnowledgeIndex.fromBytes(await sqliteResponse.body());
  try {
    expect(sql.runtime.wasm).toBe(true);
    expect(sql.export().metadata.source_hash).toBe(index.export().metadata.source_hash);
    expect(sql.export().nodes).toEqual(index.export().nodes);
    expect(sql.neighbors('getting-started')).toEqual(index.neighbors('getting-started'));
  } finally { sql.close(); }
  const linked = index.neighbors('getting-started', { family: 'reference' });
  expect(linked.items.some(item => item.node.id === 'writing-content')).toBe(true);
  for (const item of linked.items) {
    for (const evidence of item.evidence) expect((await request.get(evidence.sourceUrl)).status()).toBe(200);
  }
  const guide = await (await request.get('/llms.txt')).text();
  expect(guide).toContain('/okf/index.md');
  expect(guide).toContain('OKF 0.3');
  expect(guide).toContain('gamma34/0.1');
  expect(guide).not.toContain('The SDK authenticates API requests with a bearer token.');
  const links = [...guide.matchAll(/\[[^\]]+\]\((\/[^)]+)\)/g)].map(match => match[1]);
  expect(links).toContain('/graph/query-guide.md');
  for (const url of links) expect((await request.get(url)).status(), url).toBe(200);
  const reference = await (await request.get('/graph/query-guide.md')).text();
  expect(reference).toContain('KnowledgeGraph.fromJSON');
});

test('AI guide is discoverable and presents a copyable prompt without exposing frontmatter', async ({ page, request }) => {
  await page.goto('/');
  await page.locator('.sl-markdown-content').getByRole('link', { name: 'Using these docs with AI', exact: true }).click();
  await expect(page).toHaveURL(/\/using-with-ai\/$/);
  const body = page.locator('.sl-markdown-content');
  await expect(body).toContainText('web access');
  await expect(body).toContainText('localhost');
  await expect(body.locator('pre').first()).toContainText('<DOCS_BASE_URL>/llms.txt');
  await expect(body).not.toContainText('type: Guide');
  const raw = await (await request.get('/okf/using-with-ai.md')).text();
  expect(raw).toBe(await readFile('knowledge/using-with-ai.md', 'utf8'));
});

for (const theme of ['dark', 'light']) {
  test(`shared astrok template is accessible in Starlight ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript(value => localStorage.setItem('starlight-theme', value), theme);
    await page.goto('/getting-started/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.site-title')).toContainText('astrok');
    await page.evaluate(() => document.fonts.ready);
    const template = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const logos = [...document.querySelectorAll('.site-title img')].filter(img => getComputedStyle(img).display !== 'none');
      return { ground: root.getPropertyValue('--ground').trim().toUpperCase(), font: getComputedStyle(document.querySelector('h1')).fontFamily,
        overflow: document.documentElement.scrollWidth > innerWidth, logosLoaded: logos.length > 0 && logos.every(img => img.complete && img.naturalWidth > 0) };
    });
    expect(template.ground).toBe(theme === 'dark' ? '#0E1020' : '#F7F6F1');
    expect(template.font).toContain('Sora');
    expect(template.overflow).toBe(false);
    expect(template.logosLoaded).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: testInfo.outputPath(`starlight-${theme}.png`), fullPage: true });
  });
}
