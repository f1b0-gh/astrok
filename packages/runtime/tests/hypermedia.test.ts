import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlerRegistry } from '../dist/handlers.js';
import { createHypermedia } from '../dist/hypermedia.js';
import { createSharedState } from '../dist/state.js';

const actions = { get: async () => {}, peek: (fn: () => unknown) => fn() };

test('registered callbacks receive current state, actions, element and event', () => {
  const resolve = createHandlerRegistry<{ count: number; label: string }>({
    increment: {
      run(state, actions, element, event) {
        state.count += (event as CustomEvent<number>).detail;
        state.label = element.id;
        return actions.peek(() => state.count);
      },
    },
    count: { run: (state) => state.count },
  });
  const state = { count: 1, label: '' };
  assert.equal(
    resolve('increment').run(
      state,
      actions,
      { id: 'button' } as Element,
      { detail: 2 } as CustomEvent<number>,
    ),
    3,
  );
  assert.equal(
    resolve('increment').run(
      state,
      actions,
      { id: 'other' } as Element,
      { detail: 4 } as CustomEvent<number>,
    ),
    7,
  );
  assert.equal(resolve('count').run(state, actions, {} as Element), 7);
  assert.equal(state.label, 'other');
});

test('registrations are instance-owned snapshots, with copied watch lists', () => {
  const watch = ['count'];
  const definition = { watch, run: () => 'original' };
  const handlers = { count: definition };
  const first = createHandlerRegistry(handlers);
  definition.run = () => 'changed';
  watch.push('other');
  const second = createHandlerRegistry(handlers);
  assert.equal(first('count').run({}, actions, {} as Element), 'original');
  assert.deepEqual(first('count').watch, ['count']);
  assert.equal(second('count').run({}, actions, {} as Element), 'changed');
  assert.equal(first(' count '), first('count'));
});

test('unknown names, legacy expressions and prototype properties never resolve', () => {
  const handlers = Object.create({ inherited: { run: () => assert.fail('inherited handler') } });
  handlers.allowed = { run: () => 1 };
  const resolve = createHandlerRegistry(handlers);
  for (const name of [
    'missing',
    'inherited',
    'constructor',
    'toString',
    '__proto__',
    '$count++',
    '@get("/api/")',
  ]) {
    assert.throws(() => resolve(name), /Unknown hypermedia handler/);
  }
  for (const name of ['constructor', 'prototype', '__proto__', 'not a name', '$count++']) {
    assert.throws(
      () => createHandlerRegistry({ [name]: { run: () => 1 } }),
      /Invalid hypermedia handler name/,
    );
  }
});

test('malformed handler definitions and watch keys fail before mounting', () => {
  for (const entry of [
    null,
    1,
    {},
    { run: 'code' },
    { run: () => {}, watch: 'count' },
    { run: () => {}, watch: [1] },
    { run: () => {}, watch: ['constructor'] },
  ]) {
    assert.throws(
      () => createHandlerRegistry({ bad: entry } as never),
      /Invalid hypermedia handler/,
    );
  }
  const shared = createSharedState({ count: 0 }, (value) => value as { count: number });
  try {
    assert.throws(
      () =>
        createHypermedia(shared, { allowedPaths: [], handlers: { bad: { run: 'code' } } as never }),
      /Invalid hypermedia handler/,
    );
  } finally {
    shared.dispose();
  }
});
