import test from 'node:test';
import assert from 'node:assert/strict';

test('native Solid integration registers separate server and browser renderers', async () => {
  const { solidIntegration } = await import('@astrokjs/astro/solid');
  const integration = solidIntegration();
  let renderer, update;
  await integration.hooks['astro:config:setup']({
    addRenderer: (value) => {
      renderer = value;
    },
    updateConfig: (value) => {
      update = value;
    },
  });
  assert.equal(renderer.name, '@astrokjs/solid');
  assert.match(renderer.serverEntrypoint, /solid\/server/);
  assert.match(renderer.clientEntrypoint, /solid\/client/);
  assert.ok(update.vite.plugins.length);
});

test('server renderer assigns per-request IDs, preserves slots', async () => {
  const { default: renderer } = await import('@astrokjs/astro/solid/server');
  const { ssr } = await import('@solidjs/web');
  const component = (props) => [props.label, props.children, props.title];
  const context = { result: { request: new Request('https://example.test/') } };
  const metadata = { hydrate: 'load' };
  const first = await renderer.renderToStaticMarkup.call(
    context,
    component,
    { label: 'One' },
    { default: '<b>Body</b>', title: '<em>Title</em>' },
    metadata,
  );
  const second = await renderer.renderToStaticMarkup.call(
    context,
    component,
    { label: 'Two' },
    {},
    metadata,
  );
  assert.notEqual(first.attrs['data-astrok-solid-id'], second.attrs['data-astrok-solid-id']);
  assert.match(first.html, /<astro-slot><b>Body<\/b><\/astro-slot>/);
  assert.match(first.html, /name="title"/);
  const independent = await renderer.renderToStaticMarkup.call(
    { result: {} },
    component,
    { label: 'New request' },
    {},
    metadata,
  );
  assert.equal(independent.attrs['data-astrok-solid-id'], first.attrs['data-astrok-solid-id']);
  const staticHtml = await renderer.renderToStaticMarkup.call(
    context,
    () => ssr('<p>Static</p>'),
    {},
    {},
  );
  assert.doesNotMatch(staticHtml.html, /<script/);
  await assert.rejects(
    renderer.renderToStaticMarkup.call(
      context,
      () => {
        throw new Error('SSR failure');
      },
      {},
      {},
    ),
    /SSR failure/,
  );
});

test('the Solid renderer does not claim unrelated component functions', async () => {
  const { default: renderer } = await import('@astrokjs/astro/solid/server');
  assert.equal(await renderer.check(() => ({ foreign: true })), false);
  const component = () => 'Solid';
  Object.defineProperty(component, Symbol.for('astro:renderer'), { value: '@astrokjs/solid' });
  assert.equal(await renderer.check(component), true);
});

test('buffered async rendering surfaces undefined rejections and cancellation', async () => {
  const { default: renderer } = await import('@astrokjs/astro/solid/server');
  const { transform } = await import('@solidjs/compiler');
  const source = `import {createMemo, Loading} from 'solid-js';
export default function Failing() { const value = createMemo(() => Promise.reject(undefined)); return <Loading fallback={<p>Waiting</p>}><p>{value()}</p></Loading>; }`;
  let { code } = transform(source, { filename: 'failing.tsx', generate: 'ssr', hydratable: true });
  for (const name of ['solid-js', '@solidjs/web'])
    code = code
      .replaceAll(`'${name}'`, JSON.stringify(import.meta.resolve(name)))
      .replaceAll(`"${name}"`, JSON.stringify(import.meta.resolve(name)));
  const { default: failing } = await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
  let rejected = false;
  try {
    await renderer.renderToStaticMarkup.call(
      {
        result: {
          request: new Request('https://example.test/', { signal: AbortSignal.timeout(2000) }),
        },
      },
      failing,
      {},
      {},
      { hydrate: 'load' },
    );
  } catch (error) {
    assert.notEqual(error?.name, 'TimeoutError', 'render failure must not require a timeout');
    rejected = true;
  }
  assert.equal(rejected, true, 'an async failure must not become successful partial HTML');
  const controller = new AbortController();
  controller.abort(new Error('cancelled render'));
  await assert.rejects(
    renderer.renderToStaticMarkup.call(
      { result: { request: new Request('https://example.test/', { signal: controller.signal }) } },
      () => 'unused',
      {},
      {},
    ),
    /cancelled render/,
  );
});
