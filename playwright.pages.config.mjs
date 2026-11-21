import { defineConfig, devices } from '@playwright/test';

const base = process.env.ASTROK_BASE || '/';
export default defineConfig({
  workers: 2,
  testDir: './tests',
  testMatch: ['pages-browser.spec.mjs', 'solid-browser.spec.mjs', 'design-system-browser.spec.mjs'],
  outputDir: './test-results-pages',
  use: {
    baseURL: 'http://127.0.0.1:4342',
    ...(process.env.CHROME_PATH
      ? { launchOptions: { executablePath: process.env.CHROME_PATH } }
      : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command:
      'npm exec --workspace @astrokjs/example-workspace -- astro preview --host 127.0.0.1 --port 4342 --ignore-lock',
    url: `http://127.0.0.1:4342${base}`,
    reuseExistingServer: false,
  },
});
