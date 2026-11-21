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

test('registered events update after attribute changes without compiling code', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { createHypermedia, createSharedState, flush } = await import('/__hypermedia_test__.js');
    const shared = createSharedState({ count: 0 }, (value) => value);
    const root = document.createElement('section');
    root.innerHTML = '<button data-on:click="increment">Click</button>';
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
    const html = createHypermedia(shared, {
      allowedPaths: [],
      handlers: {
        increment: {
          run: (state) => {
            state.count++;
          },
        },
        addTen: {
          run: (state) => {
            state.count += 10;
          },
        },
      },
    });
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
      button.setAttribute('data-on:click', 'addTen');
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
  expect(result).toEqual({ atMount: 0, afterClicks: 0, finalCompiles: 0, count: 12 });
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
      '<span data-attr:title="on" data-class:active="on" data-show="on" data-text="on"></span>';
    document.body.append(root);
    let scans = 0;
    const original = root.querySelectorAll;
    root.querySelectorAll = function (...args) {
      scans++;
      return original.apply(this, args);
    };
    const html = createHypermedia(shared, {
      allowedPaths: [],
      handlers: {
        on: { run: (state) => state.on },
        changed: { run: () => 'changed' },
        ignored: { run: () => 'ignored' },
      },
    });
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
      span.setAttribute('data-text', 'changed');
      await tick();
      flush();
      const changed = span.textContent;
      root.setAttribute('data-ignore', '');
      await tick();
      span.setAttribute('data-text', 'ignored');
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

test('registered bindings and fetched fragments work under an enforced strict CSP', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__hypermedia_csp__.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: {
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'",
      },
      body: `<!doctype html><html><head><script type="module" src="/__hypermedia_csp_app__.js"></script></head><body>
      <section id="region" data-signals="initial">
        <button id="increment" data-on:click__prevent__stop__once="increment">Increment once</button>
        <button id="load" data-on:click="load">Load fragment</button>
        <label>Note<input data-bind="note"></label>
        <span id="note" data-text="note"></span>
        <span id="count" data-text="count"></span>
        <span id="derived" data-effect="derive" data-text="double"></span>
        <span id="visible" data-show="even" data-class:even="even" data-attr:title="count">Even</span>
        <div id="fragment"></div>
      </section><output id="errors"></output><output id="violations"></output>
    </body></html>`,
    }),
  );
  await page.route('**/__hypermedia_csp_app__.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `import {createHypermedia, createSharedState} from '/__hypermedia_test__.js';
      document.addEventListener('securitypolicyviolation', event => {
        document.querySelector('#violations').textContent += event.blockedURI + ';';
      });
      // Confirm the policy is enforced by the browser, outside Playwright's evaluation world.
      try { new Function('return 1')(); document.body.dataset.eval = 'allowed'; }
      catch (error) { document.body.dataset.eval = error.name; }
      const shared = createSharedState({count: 0, double: 0, note: ''}, value => value);
      const html = createHypermedia(shared, {
        allowedPaths: ['/__hypermedia_fragment__'],
        onError: error => { document.querySelector('#errors').textContent = error.message; },
        handlers: {
          initial: {run: () => ({count: 2})},
          increment: {run: (state, actions, element, event) => {
            state.count++;
            element.dataset.prevented = String(event.defaultPrevented);
          }},
          count: {run: state => state.count},
          note: {run: state => state.note},
          double: {run: state => state.double},
          even: {run: state => state.count % 2 === 0},
          derive: {watch: ['count'], run: state => { state.double = state.count * 2; }},
          load: {run: (state, actions) => { void actions.get('/__hypermedia_fragment__'); }},
          invalid: {run: (state, actions, element) => { element.setAttribute('data-on:click', '$count++'); }},
        },
      });
      html.mount(document.querySelector('#region'));
      document.querySelector('#region').addEventListener('click', () => { document.body.dataset.bubbled = 'yes'; });
      document.body.dataset.ready = 'yes';
      window.addEventListener('pagehide', () => { html.dispose(); shared.dispose(); }, {once: true});`,
    }),
  );
  await page.route('**/__hypermedia_fragment__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'datastar-selector': '#fragment', 'datastar-mode': 'inner' },
      body: '<button id="added" data-on:click="increment">Added</button><span id="added-count" data-text="count"></span><button id="invalid" data-on:click="invalid">Invalid</button>',
    }),
  );
  await page.goto('/__hypermedia_csp__.html');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'yes');
  await expect(page.locator('body')).toHaveAttribute('data-eval', 'EvalError');
  await expect(page.locator('#count')).toHaveText('2');
  await expect(page.locator('#derived')).toHaveText('4');
  await expect(page.locator('#visible')).toBeVisible();
  await expect(page.locator('#visible')).toHaveClass('even');
  await page.getByLabel('Note').fill('CSP works');
  await expect(page.locator('#note')).toHaveText('CSP works');
  await page.locator('#increment').click();
  await expect(page.locator('#increment')).toHaveAttribute('data-prevented', 'true');
  await expect(page.locator('body')).not.toHaveAttribute('data-bubbled');
  await expect(page.locator('#count')).toHaveText('3');
  await expect(page.locator('#derived')).toHaveText('6');
  await expect(page.locator('#visible')).toBeHidden();
  await expect(page.locator('#visible')).not.toHaveClass('even');
  await page.locator('#increment').click();
  await expect(page.locator('#count')).toHaveText('3');
  await page.locator('#load').click();
  await expect(page.locator('#added-count')).toHaveText('3');
  await page.locator('#added').click();
  await expect(page.locator('#count')).toHaveText('4');
  await expect(page.locator('#derived')).toHaveText('8');
  await expect(page.locator('#visible')).toHaveAttribute('title', '4');
  await page.locator('#invalid').click();
  await expect(page.locator('#errors')).toContainText('Unknown hypermedia handler: $count++');
  await page.locator('#invalid').click();
  await expect(page.locator('#count')).toHaveText('4');
  // The deliberate enforcement probe is the only attempted CSP violation.
  await expect(page.locator('#violations')).toHaveText('eval;');
  expect(errors).toEqual([]);
});

test('effects require explicit watch keys and ignore unrelated state changes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createHypermedia, createSharedState, flush } = await import('/__hypermedia_test__.js');
    const shared = createSharedState({ count: 0, other: 0 }, (value) => value);
    const root = document.createElement('section');
    document.body.append(root);
    let runs = 0;
    let initialRuns = 0;
    const html = createHypermedia(shared, {
      allowedPaths: [],
      handlers: {
        missingWatch: {
          run: () => {
            throw new Error('must not run');
          },
        },
        watched: {
          watch: ['count'],
          run: () => {
            runs++;
          },
        },
        initial: {
          watch: [],
          run: () => {
            initialRuns++;
          },
        },
      },
    });
    try {
      root.setAttribute('data-effect', 'missingWatch');
      let rejected;
      try {
        html.mount(root);
      } catch (error) {
        rejected = error.message;
      }
      root.setAttribute('data-effect', 'watched');
      root.innerHTML = '<span data-effect="initial"></span>';
      const unmount = html.mount(root);
      flush();
      const initial = runs;
      shared.update((state) => {
        state.other++;
      });
      flush();
      const unrelated = runs;
      shared.update((state) => {
        state.count++;
      });
      flush();
      const changed = runs;
      unmount();
      shared.update((state) => {
        state.count++;
      });
      flush();
      return { rejected, initial, unrelated, changed, disposed: runs, initialRuns };
    } finally {
      html.dispose();
      shared.dispose();
      root.remove();
    }
  });
  expect(result).toEqual({
    rejected: 'Effect handler missingWatch requires an explicit watch list',
    initial: 1,
    unrelated: 1,
    changed: 2,
    disposed: 2,
    initialRuns: 1,
  });
});
