import { build } from 'vite';
import { dev } from 'astro';

// Vite build() otherwise sets NODE_ENV=production in this shared process,
// which makes Astro disable its development HMR channel.
process.env.NODE_ENV = 'development';

// Keep Solid compilation independent while making edits visible to Astro dev.
// Astro can request the previous module while a second rebuild is starting.
// Keep it available; production builds still clean their output normally.
const watcher = await build({ build: { watch: {}, emptyOutDir: false } });
await new Promise((resolve, reject) => {
  const ready = (event) => {
    if (event.code === 'ERROR') {
      watcher.off('event', ready);
      reject(event.error);
    }
    if (event.code === 'END') {
      watcher.off('event', ready);
      resolve();
    }
  };
  watcher.on('event', ready);
});
let server;
try {
  server = await dev({
    root: process.cwd(),
    server: { host: '127.0.0.1', port: Number(process.env.ASTROK_DEV_PORT || 4341) },
  });
} catch (error) {
  await watcher.close();
  throw error;
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await watcher.close();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void stop();
  });
