import { test, expect } from '@playwright/test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let code;
test.beforeAll(async () => {
  const root =
    process.env.ASTROK_CONSUMER ||
    fileURLToPath(new URL('../examples/workspace/', import.meta.url));
  const entry = path.join(root, '__hypermedia_test__.js');
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'hypermedia-test',
        resolveId: (id) => (id === entry ? entry : undefined),
        load: (id) =>
          id === entry
            ? 'export {createHypermedia} from "@astrok/runtime/hypermedia"; export {createSharedState} from "@astrok/runtime"; export {flush} from "solid-js";'
            : undefined,
      },
    ],
    build: { write: false, lib: { entry, formats: ['es'] } },
  });
  code = (Array.isArray(result) ? result : [result])
    .flatMap((result) => result.output)
    .find((chunk) => chunk.isEntry).code;
});
test.beforeEach(async ({ page }) => {
  await page.route('**/__hypermedia_test__.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: code }),
  );
  await page.goto(process.env.ASTROK_BASE || '/');
});

test('event expressions compile once per binding and update after attribute changes', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { createHypermedia, createSharedState, flush } = await import('/__hypermedia_test__.js');
    const shared = createSharedState({ count: 0 }, (value) => value);
    const root = document.createElement('section');
    root.innerHTML = '<button data-on:click="$count++">Click</button>';
    document.body.append(root);
    const NativeFunction = window.Function;
    let compiled = 0;
    window.Function = new Proxy(NativeFunction, {
      apply(target, receiver, args) {
        compiled++;
        return Reflect.apply(target, receiver, args);
      },
      construct(target, args) {
        compiled++;
        return Reflect.construct(target, args);
      },
    });
    const html = createHypermedia(shared, { allowedPaths: [] });
    try {
      html.mount(root);
      flush();
      const atMount = compiled;
      const button = root.firstElementChild;
      button.click();
      flush();
      button.click();
      flush();
      const afterClicks = compiled;
      button.setAttribute('data-on:click', '$count += 10');
      await new Promise((resolve) => setTimeout(resolve, 0));
      button.click();
      flush();
      return { atMount, afterClicks, finalCompiles: compiled, count: shared.state.count };
    } finally {
      html.dispose();
      shared.dispose();
      window.Function = NativeFunction;
      root.remove();
    }
  });
  expect(result).toEqual({ atMount: 1, afterClicks: 1, finalCompiles: 2, count: 12 });
});

test('number bindings accept empty as null, report validation errors and recover', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const result = await page.evaluate(async () => {
    const { createHypermedia, createSharedState, flush } = await import('/__hypermedia_test__.js');
    const shared = createSharedState({ amount: 2 }, (value) => {
      if (value.amount !== null && (typeof value.amount !== 'number' || value.amount < 0))
        throw new Error('Nonnegative amount required');
      return value;
    });
    const root = document.createElement('section');
    root.innerHTML = '<input type="number" data-bind:amount>';
    document.body.append(root);
    const reported = [];
    const html = createHypermedia(shared, {
      allowedPaths: [],
      onError: (error) => reported.push(error.message),
    });
    try {
      html.mount(root);
      flush();
      const input = root.firstElementChild;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      flush();
      const empty = shared.state.amount;
      input.value = '-1';
      input.dispatchEvent(new Event('input'));
      flush();
      const rejected = shared.state.amount;
      input.value = '7';
      input.dispatchEvent(new Event('input'));
      flush();
      input.value = '9';
      input.dispatchEvent(new Event('input'));
      input.value = '7';
      input.dispatchEvent(new Event('input'));
      flush();
      return {
        empty,
        rejected,
        final: shared.state.amount,
        reported,
      };
    } finally {
      html.dispose();
      shared.dispose();
      root.remove();
    }
  });
  expect(errors).toEqual([]);
  expect(result).toEqual({
    empty: null,
    rejected: null,
    final: 7,
    reported: ['Nonnegative amount required'],
  });
});

test('rendered attributes and text do not rescan but new bindings and data-ignore do', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { createHypermedia, createSharedState, flush } = await import('/__hypermedia_test__.js');
    const shared = createSharedState({ on: false }, (value) => value);
    const root = document.createElement('section');
    root.innerHTML =
      '<span data-attr:title="$on" data-class:active="$on" data-show="$on" data-text="$on"></span>';
    document.body.append(root);
    let scans = 0;
    const original = root.querySelectorAll;
    root.querySelectorAll = function (...args) {
      scans++;
      return original.apply(this, args);
    };
    const html = createHypermedia(shared, { allowedPaths: [] });
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    try {
      html.mount(root);
      flush();
      await tick();
      const before = scans;
      shared.update((value) => {
        value.on = true;
      });
      flush();
      await tick();
      const renderScans = scans - before;
      const span = root.firstElementChild;
      const rendered = [span.title, span.className, span.style.display, span.textContent];
      span.setAttribute('data-text', '"changed"');
      await tick();
      flush();
      const changed = span.textContent;
      root.setAttribute('data-ignore', '');
      await tick();
      span.setAttribute('data-text', '"ignored"');
      await tick();
      flush();
      const ignored = span.textContent;
      root.removeAttribute('data-ignore');
      await tick();
      flush();
      return { renderScans, rendered, changed, ignored, resumed: span.textContent };
    } finally {
      html.dispose();
      shared.dispose();
      root.remove();
    }
  });
  expect(result).toEqual({
    renderScans: 0,
    rendered: ['true', 'active', '', 'true'],
    changed: 'changed',
    ignored: 'changed',
    resumed: 'ignored',
  });
});

test('trusted fragments preserve authored markup, including nested templates and native handlers', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { createHypermedia, createSharedState } = await import('/__hypermedia_test__.js');
    const shared = createSharedState({}, (value) => value);
    const root = document.createElement('section');
    root.id = 'trusted-region';
    document.body.append(root);
    const html = createHypermedia(shared, { allowedPaths: [] });
    try {
      html.mount(root);
      html.applyElements({
        selector: '#trusted-region',
        mode: 'inner',
        elements:
          '<form><button type="button" onclick="this.dataset.clicked = \'yes\'">Native</button></form><template><iframe srcdoc="<p>Trusted</p>"></iframe><svg><a xlink:href="#trusted">Link</a></svg></template>',
      });
      const button = root.querySelector('button');
      button.click();
      const template = root.querySelector('template');
      return {
        form: !!root.querySelector('form'),
        handler: button.hasAttribute('onclick'),
        clicked: button.dataset.clicked,
        srcdoc: template.content.querySelector('iframe').getAttribute('srcdoc'),
        href: template.content.querySelector('a').getAttribute('xlink:href'),
      };
    } finally {
      html.dispose();
      shared.dispose();
      root.remove();
    }
  });
  expect(result).toEqual({
    form: true,
    handler: true,
    clicked: 'yes',
    srcdoc: '<p>Trusted</p>',
    href: '#trusted',
  });
});
