import type { AstroIntegration } from 'astro';
import { solidMarker } from './solid-marker.js';
import solid from '@solidjs/vite-plugin';

/** Compile Solid 2 components in Astro's own server and browser build graphs. */
export function solidIntegration(): AstroIntegration {
  return {
    name: '@astrok/solid',
    hooks: {
      'astro:config:setup': ({ addRenderer, updateConfig }) => {
        addRenderer({
          name: '@astrok/solid',
          serverEntrypoint: '@astrok/astro/solid/server',
          clientEntrypoint: '@astrok/astro/solid/client',
        });
        updateConfig({ vite: {
          plugins: [solid({ compiler: 'native', ssr: true, diagnostics: false, performanceTracks: false }), solidMarker()],
          resolve: { dedupe: ['solid-js', '@solidjs/web', '@solidjs/signals'] },
        } });
      },
    },
  };
}
export default solidIntegration;
