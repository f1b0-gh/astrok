import { defineConfig } from 'astro/config';
import { copyFile, mkdir } from 'node:fs/promises';
import starlight from '@astrojs/starlight';
import { okfIntegration } from './lib/site/integration.mjs';

export default defineConfig({
  site: process.env.SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  publicDir: './.generated/public',
  integrations: [
    okfIntegration(),
    {
      name: 'astrok-example-icon',
      hooks: {
        'astro:config:setup': async ({ config }) => {
          // Starlight's favicon setting expects a public URL. Generate it from
          // the same packaged asset used by the generic example.
          await mkdir(config.publicDir, { recursive: true });
          await copyFile(new URL(import.meta.resolve('@astrok/theme/logos/astrok-app-icon.svg')), new URL('astrok-icon.svg', config.publicDir));
        },
      },
    },
    starlight({
      title: 'astrok',
      favicon: '/astrok-icon.svg',
      description: 'Static knowledge and reactive interfaces for people and agents.',
      logo: { dark: '@astrok/theme/logos/astrok-mark-dark.svg', light: '@astrok/theme/logos/astrok-mark-ink.svg', alt: '', replacesTitle: false },
      components: { PageTitle: './src/components/PageTitle.astro' },
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'external', label: 'Open Knowledge Format', href: 'https://okf.md/' }],
    }),
  ],
});
