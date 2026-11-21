import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

// Compile JSX here; Astro owns the final browser assets and shared runtime.
export default defineConfig({
  plugins: [solid({ compiler: 'native', ssr: false })],
  build: {
    outDir: '.client',
    lib: { entry: 'src/client/workspace.tsx', formats: ['es'], fileName: () => 'workspace.js' },
    rolldownOptions: {
      external: id => ['solid-js', '@solidjs/web', '@astrokjs/runtime', 'zod'].some(name => id === name || id.startsWith(name + '/')),
    },
  },
});
