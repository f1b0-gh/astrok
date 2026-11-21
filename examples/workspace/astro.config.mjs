import { defineConfig } from 'astro/config';
import { solidIntegration } from '@astrok/astro/solid';
import { okfIntegration } from '@astrok/astro';

export default defineConfig({
  output: 'static',
  site: process.env.ASTROK_SITE || 'http://127.0.0.1:4338',
  base: process.env.ASTROK_BASE || '/',
  trailingSlash: 'always',
  publicDir: '.generated/public',
  integrations: [solidIntegration(), okfIntegration({ presentation: 'plain', graph: true, sqlite: false })],
  vite: {
    resolve: { dedupe: ['solid-js', '@solidjs/web', '@solidjs/signals'] },
  },
});
