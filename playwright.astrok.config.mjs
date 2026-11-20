import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const port = process.env.ASTROK_PORT || '4338';

export default defineConfig({
  workers: 2,
  testDir: './tests',
  testMatch: ['astrok-browser.spec.mjs', 'design-system-browser.spec.mjs', 'solid-browser.spec.mjs'],
  outputDir: `./test-results-astrok/${port}`,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...(process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}),
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node fixture.mjs',
    cwd: process.env.ASTROK_CONSUMER || fileURLToPath(new URL('./examples/workspace/', import.meta.url)),
    env: { PORT: port },
    url: `http://127.0.0.1:${port}${process.env.ASTROK_BASE || '/'}`,
    reuseExistingServer: false,
  },
});
