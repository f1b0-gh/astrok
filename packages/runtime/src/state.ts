/** Adapted from soc-proto/apps/web/src/shared-signals.ts (native Solid 2 draft store). */
import { createRoot, createStore, getOwner, onCleanup, reconcile, snapshot } from 'solid-js';
export type SignalPatch = Record<string, unknown>;
export const DEFAULT_MAX_DEPTH = 64;
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validate the entire graph before mutating a store, including objects inside arrays. */
export function validatePatch(input: unknown, maxDepth = DEFAULT_MAX_DEPTH): SignalPatch {
  if (!Number.isInteger(maxDepth) || maxDepth < 1) throw new Error('Invalid patch depth limit');
  const seen = new Set<object>();
  function visit(value: unknown, depth: number): void {
    if (depth > maxDepth) throw new Error('Signal patch depth limit exceeded');
    if (value === null || typeof value !== 'object') {
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value))
        throw new Error('Expected JSON patch values');
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('Expected finite JSON number');
      return;
    }
    if (seen.has(value)) throw new Error('Cyclic signal patch');
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new Error('Expected plain JSON object');
    seen.add(value);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (blocked.has(key)) throw new Error('Unsafe signal key');
      if (!('value' in descriptor)) throw new Error('Expected JSON data properties');
      if (Array.isArray(value) && key === 'length') continue;
      visit(descriptor.value, depth + 1);
    }
    seen.delete(value);
  }
  if (!isObject(input)) throw new Error('Expected a JSON object signal patch');
  visit(input, 0);
  return Object.fromEntries(Object.entries(input));
}

function merge(target: Record<string, unknown>, patch: SignalPatch, onlyIfMissing: boolean): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      if (!onlyIfMissing) delete target[key];
    } else if (isObject(value)) {
      if (onlyIfMissing && Object.hasOwn(target, key) && !isObject(target[key])) continue;
      if (!isObject(target[key])) target[key] = {};
      merge(target[key] as Record<string, unknown>, value, onlyIfMissing);
    } else if (!onlyIfMissing || !Object.hasOwn(target, key)) target[key] = structuredClone(value);
  }
}

export interface SharedState<T extends Record<string, unknown>> {
  readonly state: T;
  update(recipe: (draft: T) => void): void;
  patch(input: unknown, onlyIfMissing?: boolean): void;
  dispose(): void;
}
/** The decoder validates the complete candidate; its output becomes stored state. */
export function createSharedState<T extends Record<string, unknown>>(
  initial: T,
  decode: (input: unknown) => T,
): SharedState<T> {
  const decoded = (input: unknown): T => {
    validatePatch(input);
    const value = decode(input);
    validatePatch(value);
    return structuredClone(value);
  };
  const accepted = decoded(initial);
  let disposed = false;
  let disposeRoot: () => void = () => {};
  const parent = getOwner();
  const [state, setState] = createRoot((dispose) => {
    disposeRoot = dispose;
    return createStore<T>(accepted as T extends Function ? never : T);
  });
  const assertActive = () => {
    if (disposed) throw new Error('Shared state is disposed');
  };
  const shared: SharedState<T> = {
    state,
    update(recipe) {
      assertActive();
      setState((draft) => {
        const candidate = structuredClone(snapshot(draft));
        recipe(candidate);
        reconcile(decoded(candidate))(draft);
      });
    },
    patch(input, onlyIfMissing = false) {
      assertActive();
      const patch = validatePatch(input);
      setState((draft) => {
        const candidate = structuredClone(snapshot(draft));
        merge(candidate, patch, onlyIfMissing);
        reconcile(decoded(candidate))(draft);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeRoot();
    },
  };
  if (parent) onCleanup(shared.dispose);
  return shared;
}
