import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileAttribute } from '../dist/hypermedia.js';

test('trusted attribute actions are rewritten without changing strings, templates, regexes or comments', () => {
  const expression = compileAttribute(
    '[$count, "@get", `@get`, /@get/.source, @peek(() => $count)]',
  );
  assert.deepEqual(
    expression.run({ count: 2 }, { get: async () => {}, peek: (fn) => fn() }, {} as Element),
    [2, '@get', '@get', '@get', 2],
  );
  assert.deepEqual(expression.refs, ['count']);
});
test('trusted attribute assignment reaches supplied draft and rejects forbidden root names', () => {
  const state = { count: 1 };
  compileAttribute('$count += 2', true).run(
    state,
    { get: async () => {}, peek: (fn) => fn() },
    {} as Element,
  );
  assert.equal(state.count, 3);
  assert.throws(
    () =>
      compileAttribute('$constructor', false).run(
        state,
        { get: async () => {}, peek: (fn) => fn() },
        {} as Element,
      ),
    /Invalid signal name/,
  );
});

test('token rewriting preserves comments, escaped literals and template interpolations', () => {
  const expression = compileAttribute(
    '/* @missing $ignored */ [`raw @get ${@peek(() => $count)}`, "escaped \\\"@get", /@get/.test("@get"), $count] // @missing',
  );
  assert.deepEqual(expression.refs, ['count']);
  assert.deepEqual(
    expression.run({ count: 3 }, { get: async () => {}, peek: (fn) => fn() }, {} as Element),
    ['raw @get 3', 'escaped "@get', true, 3],
  );
});

test('statements receive the current event, element and state on every run', () => {
  const expression = compileAttribute(
    '$count += evt.detail; $label = el.id; @peek(() => $count)',
    true,
  );
  const state = { count: 1, label: '' };
  const actions = { get: async () => {}, peek: (fn: () => unknown) => fn() };
  expression.run(state, actions, { id: 'button' } as Element, { detail: 2 } as unknown as Event);
  expression.run(state, actions, { id: 'other' } as Element, { detail: 4 } as unknown as Event);
  assert.deepEqual(state, { count: 7, label: 'other' });
});

test('invalid expressions fail at compilation and forbidden assignments fail at execution', () => {
  assert.throws(() => compileAttribute('$count +'));
  for (const name of ['__proto__', 'prototype', 'constructor']) {
    assert.throws(
      () =>
        compileAttribute(`$${name} = 1`, true).run(
          {},
          { get: async () => {}, peek: (fn) => fn() },
          {} as Element,
        ),
      /Invalid signal name/,
    );
  }
});
