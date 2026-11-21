import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAst } from 'rolldown/parseAst';
import { solidMarker } from '../packages/astro/dist/solid-marker.js';
const transform = code => solidMarker().transform.call({ parse: parseAst }, code, '/src/example.tsx', { ssr: true });
const load = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('renderer markers belong to local functions, never imported aliases or members', async () => {
  const foreignUrl = 'data:text/javascript,export default function Foreign(){}';
  const source = `import Foreign from '${foreignUrl}'; import * as foreignNamespace from '${foreignUrl}'; export const Alias = Foreign; export default foreignNamespace.default;`;
  const result = transform(source);
  const exports = await load(result?.code ?? source);
  assert.equal(exports.Alias[Symbol.for('astro:renderer')], undefined);
  assert.equal(exports.default[Symbol.for('astro:renderer')], undefined);
});

test('renderer markers cover named, default and anonymous local function exports with maps', async () => {
  for (const source of [
    'export default function Counter() {}',
    'export default () => "text";',
    'function Counter() {} export { Counter as default };',
    'export const Counter = () => "text";',
  ]) {
    const result = transform(source);
    assert.ok(result?.map);
    const exports = await load(result.code);
    assert.equal((exports.default ?? exports.Counter)[Symbol.for('astro:renderer')], '@astrokjs/solid');
  }
});
