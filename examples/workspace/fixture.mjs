// Local synthetic fixture/preview only; never a production authentication service.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const base = process.env.ASTROK_BASE || '/';
const root = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' || !url.pathname.startsWith(base)) { response.writeHead(404).end(); return; }
  const route = url.pathname.slice(base.length);
  if (route === 'api/rows') {
    const selection = url.searchParams.get('selection');
    if (!['alpha', 'beta'].includes(selection)) { response.writeHead(400).end('Invalid selection'); return; }
    if (url.searchParams.get('fail') === 'true') { response.writeHead(503).end('Fixture service unavailable'); return; }
    const timer = setTimeout(() => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ selection, rows: Array.from({ length: 240 }, (_, index) => ({ id: String(18446744073709551000n + BigInt(index)), label: `${selection} item ${index + 1}` })) }));
    }, selection === 'alpha' ? 150 : 10);
    response.once('close', () => clearTimeout(timer));
    return;
  }
  if (route === 'api/stream') {
    const region = url.searchParams.get('region');
    if (!['first', 'second'].includes(region)) { response.writeHead(400).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('event: datastar-patch-signals\ndata: signals {"summary":"Streaming…"}\n\n');
    const timer = setTimeout(() => {
      response.write(`event: datastar-patch-elements\ndata: selector #fragment-${region}\ndata: mode inner\ndata: elements <label>Panel note<input id="note-${region}" data-bind="note" value="Server default" /></label><p data-fragment-message>Server fragment updated</p>\n\n`);
      response.end('event: datastar-patch-signals\ndata: signals {"summary":"Stream complete"}\n\n');
    }, 40);
    response.once('close', () => clearTimeout(timer));
    return;
  }
  try {
    let file = path.resolve(root, decodeURIComponent(route));
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 4338), '127.0.0.1', () => console.log(`Astrok fixture http://127.0.0.1:${process.env.PORT || 4338}${base}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
