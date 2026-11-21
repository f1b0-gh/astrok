/** Adapted from soc-proto/apps/web/src/hypermedia.ts. Trusted expressions require CSP unsafe-eval. */
import {
  createEffect,
  createMemo,
  createSignal,
  createRoot,
  runWithOwner,
  untrack,
  getOwner,
  onCleanup,
} from 'solid-js';
import { tokenizer } from 'acorn';
import morphdomImport from 'morphdom';
// morphdom 2 ships a CJS runtime with ESM-shaped declarations; normalize its callable boundary.
interface MorphOptions {
  onBeforeNodeDiscarded?(node: Node): boolean;
  onBeforeElUpdated?(oldEl: HTMLElement, newEl: HTMLElement): boolean;
}
const morphdom = morphdomImport as unknown as (from: Node, to: Node, options: MorphOptions) => Node;
import { readPatches } from './sse.js';
import type { ElementPatch } from './sse.js';
import type { SharedState } from './state.js';

export interface HypermediaOptions {
  allowedPaths: readonly string[];
  protectedRoots?: readonly Element[];
  onError?: (error: Error) => void;
  fetch?: typeof globalThis.fetch;
  baseURL?: string;
}
export interface Hypermedia {
  mount(root: HTMLElement): () => void;
  applyElements(patch: ElementPatch): void;
  dispose(): void;
}

export type AttributeActions = {
  get: (url: string) => Promise<void>;
  peek: (fn: () => unknown) => unknown;
};
export interface AttributeExpression {
  readonly refs: readonly string[];
  run(state: Record<string, unknown>, actions: AttributeActions, el: Element, evt?: Event): unknown;
}
type Actions = AttributeActions;
const blocked = new Set(['__proto__', 'prototype', 'constructor']);
const key = (value: string) => value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
function pathParts(path: string) {
  const parts = path.split('.').map(key);
  if (parts.some((p) => !p || blocked.has(p))) throw new Error('Invalid signal path');
  return parts;
}
function readPath(state: Record<string, unknown>, path: string): unknown {
  return pathParts(path).reduce<unknown>(
    (value, k) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[k] : undefined,
    state,
  );
}
function writePath(state: Record<string, unknown>, path: string, value: unknown) {
  const parts = pathParts(path);
  let node = state;
  for (const p of parts.slice(0, -1)) {
    if (!node[p] || typeof node[p] !== 'object') node[p] = {};
    node = node[p] as Record<string, unknown>;
  }
  node[parts.at(-1)!] = value;
}

/** Expressions are trusted application code, like Datastar attributes, not a
 * sandbox. Acorn token positions let us rewrite @actions without altering text
 * in strings, templates, regexes or comments. $names resolve to the shared store. */
export function compileAttribute(source: string, statement = false): AttributeExpression {
  const masked = source.replaceAll('@', '_');
  const tokens = tokenizer(masked, { ecmaVersion: 'latest' });
  const refs = new Set<string>();
  const replacements: { start: number; end: number; value: string }[] = [];
  for (const token of tokens) {
    if (token.type.label !== 'name') continue;
    const text = source.slice(token.start, token.end);
    if (text.startsWith('@'))
      replacements.push({
        start: token.start,
        end: token.end,
        value: '__actions.' + text.slice(1),
      });
    if (text.startsWith('$') && text.length > 1) refs.add(text.slice(1));
  }
  let body = source;
  for (const replacement of replacements.reverse())
    body = body.slice(0, replacement.start) + replacement.value + body.slice(replacement.end);
  const fn = new Function(
    '__scope',
    '__actions',
    'evt',
    'el',
    `with(__scope){
${
  statement
    ? body
    : `return (
${body}
);`
}
}`,
  );
  return {
    refs: [...refs],
    run: (state: Record<string, unknown>, actions: Actions, el: Element, evt?: Event) =>
      fn(
        new Proxy(
          {},
          {
            has: (_, name) => typeof name === 'string' && name.startsWith('$'),
            get: (_, name) => {
              if (typeof name !== 'string') return undefined;
              const k = name.slice(1);
              if (blocked.has(k)) throw new Error('Invalid signal name');
              return state[k];
            },
            set: (_, name, value) => {
              const k = String(name).slice(1);
              if (blocked.has(k)) throw new Error('Invalid signal name');
              state[k] = value;
              return true;
            },
          },
        ),
        actions,
        evt,
        el,
      ),
  };
}

function inputValue(input: HTMLInputElement): string | boolean | number | null {
  if (input.type === 'checkbox') return input.checked;
  if (input.type !== 'number') return input.value;
  if (input.validity.badInput) throw new Error('Invalid number input');
  if (input.value === '') return null;
  const value = input.valueAsNumber;
  if (!Number.isFinite(value)) throw new Error('Invalid number input');
  return value;
}

export function createHypermedia<T extends Record<string, unknown>>(
  shared: SharedState<T>,
  options: HypermediaOptions,
): Hypermedia {
  let disposed = false;
  const protectedRoots = options.protectedRoots ?? [];
  const protectedNode = (node: Node) =>
    protectedRoots.some((root) => root === node || root.contains(node));
  const touchesProtected = (node: Node) =>
    protectedRoots.some((root) => root === node || root.contains(node) || node.contains(root));
  const assertActive = () => {
    if (disposed) throw new Error('Hypermedia is disposed');
  };
  const regions = new Set<HTMLElement>();
  const [revision, setRevision] = createSignal(0);
  const bindings = new Map<
    Element,
    { signature: string; attributes: Map<string, string>; dispose: () => void }
  >();
  const requests = new Map<Element, AbortController>();
  const observers = new Map<Element, MutationObserver>();
  const supported = (name: string) =>
    /^data-(signals|text|show|bind|on|effect|class|attr)(:|__|$)/.test(name);
  const inside = (node: Node) => [...regions].some((root) => root === node || root.contains(node));
  const report = (error: unknown) =>
    (options.onError ?? console.error)(error instanceof Error ? error : new Error(String(error)));
  const actions = (el: Element): Actions => ({
    get: (url) => request(el, url),
    peek: (fn) => untrack(fn),
  });
  const run = (expression: AttributeExpression, el: Element, evt?: Event) => {
    shared.update((draft) => {
      expression.run(draft, actions(el), el, evt);
    });
  };
  function bind(el: Element, attributes: Attr[], previous?: Map<string, string>) {
    // Initialize outside reactive owners; subsequent writes run in event/effect apply phases.
    for (const attr of attributes) {
      const [head = '', ...mods] = attr.name.slice(5).split('__');
      const [kind, ...parts] = head.split(':');
      const name = parts.join(':');
      if (kind === 'signals') {
        if (previous?.get(attr.name) === attr.value) continue;
        const expression = compileAttribute(attr.value);
        if (name)
          shared.update((s) => {
            if (!mods.includes('ifmissing') || readPath(s, name) === undefined)
              writePath(s, name, expression.run(s, actions(el), el));
          });
        else
          shared.patch(expression.run(shared.state, actions(el), el), mods.includes('ifmissing'));
      }
      if (kind === 'bind') {
        const path = name || attr.value;
        const input = el as HTMLInputElement;
        if (readPath(shared.state, path) === undefined)
          shared.update((s) => {
            if (readPath(s, path) === undefined) writePath(s, path, inputValue(input));
          });
      }
    }
    return runWithOwner(null, () =>
      createRoot((dispose) => {
        const cleanups: (() => void)[] = [];
        onCleanup(() => {
          requests.get(el)?.abort();
          requests.delete(el);
          for (const cleanup of cleanups) cleanup();
        });
        try {
          for (const attr of attributes) {
            const [head = '', ...mods] = attr.name.slice(5).split('__');
            const [kind, ...parts] = head.split(':');
            const name = parts.join(':');
            if (kind === 'signals') continue;
            if (kind === 'on') {
              if (!name || mods.some((m) => !['prevent', 'stop', 'once'].includes(m)))
                throw new Error(`Unsupported event attribute: ${attr.name}`);
              const expression = compileAttribute(attr.value, true);
              const listener = (evt: Event) => {
                try {
                  if (mods.includes('prevent')) evt.preventDefault();
                  if (mods.includes('stop')) evt.stopPropagation();
                  run(expression, el, evt);
                } catch (e) {
                  report(e);
                }
              };
              el.addEventListener(name, listener, { once: mods.includes('once') });
              cleanups.push(() => el.removeEventListener(name, listener));
            } else if (kind === 'bind') {
              const path = name || attr.value;
              const input = el as HTMLInputElement;
              const update = () => {
                try {
                  const value = inputValue(input);
                  shared.update((s) => writePath(s, path, value));
                } catch (error) {
                  report(error);
                }
              };
              input.addEventListener('input', update);
              input.addEventListener('change', update);
              cleanups.push(() => {
                input.removeEventListener('input', update);
                input.removeEventListener('change', update);
              });
              createEffect(
                () => {
                  revision();
                  return readPath(shared.state, path);
                },
                (value) => {
                  if (input.type === 'checkbox') input.checked = !!value;
                  else if (input.value !== String(value ?? '')) input.value = String(value ?? '');
                },
              );
            } else if (kind === 'effect') {
              const expression = compileAttribute(attr.value, true);
              const deps = createMemo(
                () =>
                  revision() +
                  '|' +
                  expression.refs.map((k) => JSON.stringify(shared.state[k])).join('\0'),
              );
              createEffect(deps, () => {
                try {
                  shared.update((s) => {
                    expression.run(s, actions(el), el);
                  });
                } catch (e) {
                  report(e);
                }
              });
            } else {
              const expression = compileAttribute(attr.value);
              createEffect(
                () => {
                  revision();
                  return expression.run(shared.state, actions(el), el);
                },
                (value) => {
                  if (kind === 'text') {
                    if (touchesProtected(el))
                      throw new Error('Binding touches a Solid-owned subtree');
                    el.textContent = String(value ?? '');
                  } else if (kind === 'show')
                    (el as HTMLElement).style.display = value ? '' : 'none';
                  else if (kind === 'class' && name) el.classList.toggle(name, !!value);
                  else if (kind === 'attr' && name) {
                    if (value === null || value === undefined) el.removeAttribute(name);
                    else el.setAttribute(name, String(value));
                  } else throw new Error(`Unsupported binding: ${attr.name}`);
                },
              );
            }
          }
        } catch (error) {
          dispose();
          throw error;
        }
        return dispose;
      }),
    );
  }
  function scan() {
    for (const [el, entry] of bindings)
      if (!inside(el) || !el.isConnected || el.closest('[data-ignore]') || protectedNode(el)) {
        entry.dispose();
        bindings.delete(el);
      }
    for (const root of regions)
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (el.closest('[data-ignore]') || protectedNode(el)) continue;
        const attrs = Array.from(el.attributes).filter((a) => supported(a.name));
        const signature = attrs.map((a) => a.name + '=' + a.value).join('\0');
        if (bindings.get(el)?.signature === signature) continue;
        const previous = bindings.get(el);
        previous?.dispose();
        bindings.delete(el);
        if (attrs.length)
          bindings.set(el, {
            signature,
            attributes: new Map(attrs.map((a) => [a.name, a.value])),
            dispose: bind(el, attrs, previous?.attributes),
          });
      }
  }
  function mount(root: HTMLElement) {
    assertActive();
    if (protectedNode(root))
      throw new Error('Cannot mount hypermedia inside a Solid-owned subtree');
    if (regions.has(root)) return () => {};
    regions.add(root);
    try {
      scan();
    } catch (error) {
      regions.delete(root);
      for (const [el, entry] of bindings)
        if (root === el || root.contains(el)) {
          entry.dispose();
          bindings.delete(el);
        }
      throw error;
    }
    // attributeFilter cannot express data-on:* or other dynamic binding names.
    // Ignore render outputs; text-only child changes cannot introduce bindings.
    const observer = new MutationObserver((records) => {
      const relevant = records.some((record) =>
        record.type === 'attributes'
          ? record.attributeName === 'data-ignore' || supported(record.attributeName ?? '')
          : [...record.addedNodes, ...record.removedNodes].some(
              (node) => node.nodeType === Node.ELEMENT_NODE,
            ),
      );
      if (relevant)
        try {
          scan();
        } catch (e) {
          report(e);
        }
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    observers.set(root, observer);
    // Cleanup belongs to this mount, even if the same root has since remounted.
    return () => {
      if (observers.get(root) !== observer) return;
      observer.disconnect();
      observers.delete(root);
      regions.delete(root);
      for (const [el, entry] of bindings)
        if (root === el || root.contains(el)) {
          entry.dispose();
          bindings.delete(el);
        }
    };
  }
  function applyElements({ elements, selector, mode = 'outer' }: ElementPatch) {
    assertActive();
    if (
      !['outer', 'inner', 'replace', 'prepend', 'append', 'before', 'after', 'remove'].includes(
        mode,
      )
    )
      throw new Error('Unsupported morph mode');
    const template = document.createElement('template');
    template.innerHTML = elements;
    // Intentionally no sanitizer: fragments and data-* expressions are trusted
    // application code. Native handlers, URLs and nested templates are preserved.
    const nodes = selector
      ? Array.from(document.querySelectorAll(selector))
      : [...template.content.children]
          .map((el) => document.getElementById(el.id))
          .filter((el): el is HTMLElement => !!el);
    if (!nodes.length) throw new Error('HTML patch target was not found');
    if (nodes.some((node) => !inside(node)))
      throw new Error('HTML patch is outside a server-owned region');
    if (nodes.some(touchesProtected))
      throw new Error('HTML patch touches a Solid-owned subtree or ancestor');
    if (nodes.some((node) => [...regions].some((root) => root !== node && node.contains(root))))
      throw new Error('HTML patch touches a nested region boundary');
    if (
      nodes.some((node) => regions.has(node as HTMLElement) && !['inner', 'outer'].includes(mode))
    )
      throw new Error('Cannot remove or replace a region boundary');
    for (const target of nodes) {
      if (regions.has(target as HTMLElement) && !['inner', 'outer'].includes(mode))
        throw new Error('Cannot remove or replace a region boundary');
      const focused = document.activeElement;
      const focusValue =
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLSelectElement
          ? focused.value
          : undefined;
      const selection =
        focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
          ? ([focused.selectionStart, focused.selectionEnd, focused.selectionDirection] as const)
          : undefined;
      const content = template.content.cloneNode(true) as DocumentFragment;
      if (mode === 'remove') {
        target.remove();
        continue;
      }
      if (mode === 'inner' || mode === 'outer') {
        const incoming =
          mode === 'inner'
            ? (target.cloneNode(false) as Element)
            : selector
              ? content.firstElementChild
              : content.querySelector('#' + CSS.escape(target.id));
        if (!incoming) throw new Error('Outer morph requires an element');
        if (mode === 'inner') incoming.append(content);
        if (
          regions.has(target as HTMLElement) &&
          (incoming.tagName !== target.tagName || incoming.id !== target.id)
        )
          throw new Error('Region morph must preserve its tag and id');
        morphdom(target, incoming, {
          onBeforeNodeDiscarded: (node) => {
            if (touchesProtected(node)) throw new Error('Cannot discard Solid-owned subtree');
            return true;
          },
          onBeforeElUpdated: (oldEl, newEl) => {
            if (oldEl.hasAttribute('data-ignore-morph')) return false;
            if (
              oldEl === document.activeElement &&
              oldEl instanceof HTMLInputElement &&
              newEl instanceof HTMLInputElement
            ) {
              newEl.value = oldEl.value;
              newEl.checked = oldEl.checked;
            }
            if (
              oldEl === document.activeElement &&
              oldEl instanceof HTMLSelectElement &&
              newEl instanceof HTMLSelectElement
            )
              newEl.value = oldEl.value;
            if (
              oldEl === document.activeElement &&
              oldEl instanceof HTMLTextAreaElement &&
              newEl instanceof HTMLTextAreaElement
            )
              newEl.value = oldEl.value;
            return true;
          },
        });
      } else if (mode === 'replace') target.replaceWith(content);
      else if (mode === 'append') target.append(content);
      else if (mode === 'prepend') target.prepend(content);
      else if (mode === 'before') target.before(content);
      else if (mode === 'after') target.after(content);
      if (
        focused?.isConnected &&
        focusValue !== undefined &&
        (focused instanceof HTMLInputElement ||
          focused instanceof HTMLTextAreaElement ||
          focused instanceof HTMLSelectElement)
      ) {
        focused.value = focusValue;
        if (
          selection &&
          selection[0] !== null &&
          selection[1] !== null &&
          (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)
        )
          focused.setSelectionRange(selection[0], selection[1], selection[2] ?? undefined);
      }
    }
    scan();
    setRevision((n) => n + 1);
  }
  async function request(el: Element, url: string) {
    requests.get(el)?.abort();
    const controller = new AbortController();
    requests.set(el, controller);
    try {
      const base = new URL(options.baseURL ?? document.baseURI);
      const endpoint = new URL(url, base);
      if (
        base.origin !== new URL(document.baseURI).origin ||
        endpoint.origin !== base.origin ||
        !options.allowedPaths.some(
          (path) =>
            path.startsWith('/') &&
            (endpoint.pathname === path ||
              endpoint.pathname.startsWith(path.endsWith('/') ? path : path + '/')),
        )
      )
        throw new Error('Hypermedia request URL is outside allowed paths');
      const response = await (options.fetch ?? globalThis.fetch)(endpoint, {
        signal: controller.signal,
        headers: {
          Accept: 'text/event-stream, text/html, application/json',
          'Datastar-Request': 'true',
        },
      });
      if (requests.get(el) !== controller || controller.signal.aborted) {
        await response.body?.cancel().catch(() => {});
        return;
      }
      await readPatches(response, controller.signal, {
        signals: shared.patch,
        elements: applyElements,
      });
    } catch (error) {
      if (!controller.signal.aborted) report(error);
    } finally {
      if (requests.get(el) === controller) requests.delete(el);
    }
  }
  function abortAll() {
    for (const controller of requests.values()) controller.abort();
    requests.clear();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    abortAll();
    for (const observer of observers.values()) observer.disconnect();
    for (const entry of bindings.values()) entry.dispose();
    bindings.clear();
    observers.clear();
    regions.clear();
  }
  if (getOwner()) onCleanup(dispose);
  return { mount, applyElements, dispose };
}
