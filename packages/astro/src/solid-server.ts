import { createComponent } from 'solid-js';
import type { Component } from 'solid-js';
import { renderToStream, generateHydrationScript, ssr } from '@solidjs/web';

type Props = Record<string, unknown>;
interface RenderContext {
  result: { request?: Request };
}
interface Metadata {
  hydrate?: string;
}
const sequences = new WeakMap<object, number>();
const attribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

async function renderToStaticMarkup(
  this: RenderContext,
  component: unknown,
  props: Props,
  slots: Record<string, string>,
  metadata?: Metadata,
): Promise<{ html: string; attrs: Record<string, string> }> {
  if (typeof component !== 'function') throw new TypeError('Expected a Solid component function');
  const sequence = sequences.get(this.result) ?? 0;
  sequences.set(this.result, sequence + 1);
  const renderId = `astrok-${sequence}-`;
  const hydratable = Boolean(metadata?.hydrate);
  const tag = hydratable ? 'astro-slot' : 'astro-static-slot';
  const children: Props = {};
  for (const [name, html] of Object.entries(slots)) {
    children[name === 'default' ? 'children' : name] = ssr(
      `<${tag}${name === 'default' ? '' : ` name="${attribute(name)}"`}>${html}</${tag}>`,
    );
  }
  let failure: unknown;
  let hasFailure = false;
  const html = await renderToStream(
    () => createComponent(component as Component<Props>, { ...props, ...children }),
    {
      renderId,
      noScripts: !hydratable,
      ...(this.result.request ? { signal: this.result.request.signal } : {}),
      onError(error, context) {
        if (context.handling !== 'fallback') {
          hasFailure = true;
          failure = error;
        }
      },
    },
  );
  if (hasFailure) throw failure;
  return { html, attrs: hydratable ? { 'data-astrok-solid-id': renderId } : {} };
}

export default {
  // This integration's native compiler owns JSX in the consuming Astro project.
  check: async (component: unknown): Promise<boolean> =>
    typeof component === 'function' &&
    Reflect.get(component, Symbol.for('astro:renderer')) === '@astrokjs/solid',
  renderToStaticMarkup,
  supportsAstroStaticSlot: true,
  renderHydrationScript: (): string => generateHydrationScript(),
};
