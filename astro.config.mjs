import { defineConfig } from 'astro/config';
import { copyFile, mkdir } from 'node:fs/promises';
import starlight from '@astrojs/starlight';
import { okfIntegration } from '@astrokjs/astro';

export default defineConfig({
  site: process.env.SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  publicDir: './.generated/public',
  integrations: [
    okfIntegration({ graph: true }),
    {
      name: 'astrok-example-icon',
      hooks: {
        'astro:config:setup': async ({ config }) => {
          // Starlight's favicon setting expects a public URL. Generate it from
          // the same packaged asset used by the generic example.
          await mkdir(config.publicDir, { recursive: true });
          await copyFile(new URL(import.meta.resolve('@astrokjs/theme/logos/astrok-app-icon.svg')), new URL('astrok-icon.svg', config.publicDir));
        },
      },
    },
    starlight({
      title: 'astrok',
      expressiveCode: {
        plugins: [{
          name: 'astrok-focusable-code',
          hooks: {
            postprocessRenderedBlock: ({ renderData }) => {
              // Make code keyboard-scrollable before the resize observer runs.
              function makeFocusable(node) {
                if (node.type === 'element' && node.tagName === 'pre') {
                  node.properties.tabIndex = 0;
                }
                node.children?.forEach(makeFocusable);
              }
              makeFocusable(renderData.blockAst);
            },
          },
        }],
      },
      favicon: '/astrok-icon.svg',
      description: 'Static knowledge and reactive interfaces for people and agents.',
      logo: { dark: '@astrokjs/theme/logos/astrok-mark-dark.svg', light: '@astrokjs/theme/logos/astrok-mark-ink.svg', alt: '', replacesTitle: false },
      components: { PageTitle: './src/components/PageTitle.astro' },
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'external', label: 'Open Knowledge Format', href: 'https://okf.md/' }],
    }),
  ],
});
