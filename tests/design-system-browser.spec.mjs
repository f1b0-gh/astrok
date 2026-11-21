import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';

const base = process.env.ASTROK_BASE || '/';
for (const theme of ['dark', 'light']) {
  test(`design preview: ${theme} is readable, responsive and keyboard accessible`, async ({
    page,
  }, testInfo) => {
    const pageErrors = [];
    const fontRequests = [];
    const externalFonts = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fontRequests.push(request.url());
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFonts.push(request.url());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${base}design-system/${theme === 'light' ? 'light/' : ''}`);
    await expect(page.getByRole('heading', { name: 'Astrok, ready to respond.' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const images = await page.locator('img').evaluateAll((images) =>
      images.map((image) => ({
        loaded: image.complete && image.naturalWidth > 0,
        src: image.currentSrc,
      })),
    );
    expect(images.length).toBeGreaterThanOrEqual(5);
    expect(images.every((image) => image.loaded)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    const field = page.getByLabel('Workspace name');
    // Use keyboard navigation to reach the input, not programmatic focus.
    for (let i = 0; i < 18 && !(await field.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
    const focus = await field.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: parseFloat(s.outlineWidth),
        style: s.outlineStyle,
        offset: parseFloat(s.outlineOffset),
      };
    });
    expect(focus.width).toBeGreaterThanOrEqual(2);
    expect(focus.style).not.toBe('none');
    expect(focus.offset).toBeGreaterThanOrEqual(2);
    await field.fill('Changed');
    await page.getByRole('button', { name: 'Reset fields' }).click();
    await expect(field).toHaveValue('Investigation');
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    const fonts = await page.evaluate(() =>
      ['Sora', 'Inter', 'JetBrains Mono'].map((name) => ({
        name,
        loaded: Array.from(document.fonts).some(
          (font) => font.family.replace(/["']/g, '') === name && font.status === 'loaded',
        ),
      })),
    );
    expect(fonts.every((font) => font.loaded)).toBe(true);
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(
      fontRequests.every(
        (url) =>
          new URL(url).origin === new URL(page.url()).origin &&
          new URL(url).pathname.startsWith(base),
      ),
    ).toBe(true);
    expect(externalFonts).toEqual([]);
    await expect(page.locator('link[rel=preconnect]')).toHaveCount(0);
    const audit = {
      fontRequests,
      externalFonts,
      theme,
      base,
      project: testInfo.project.name,
      fonts,
      images,
      focus,
      axeViolations: axe.violations.length,
      axeIncomplete: axe.incomplete.map((item) => item.id),
      pageErrors,
    };
    await writeFile(
      testInfo.outputPath('design-audit.json'),
      JSON.stringify(audit, null, 2) + '\n',
    );
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: testInfo.outputPath(`preview-${theme}.png`), fullPage: true });
    expect(pageErrors).toEqual([]);
  });
}

test('all generic pages use the shared default template without adding scripts to static reading', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const route of ['', 'guide/', 'workspace/', 'workspace/alternate/']) {
    await page.goto(`${baseURL}${base}${route}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('header .brand')).toContainText('astrok');
    const style = await page.evaluate(() => ({
      ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
      family: getComputedStyle(document.querySelector('h1')).fontFamily,
    }));
    expect(style.ground.toUpperCase()).toBe('#0E1020');
    expect(style.family).toContain('Sora');
    if (!route || route === 'guide/') await expect(page.locator('script')).toHaveCount(0);
  }
  await context.close();
});
