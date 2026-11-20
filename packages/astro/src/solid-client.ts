import { createComponent, createStore } from 'solid-js';
import type { Component } from 'solid-js';
import { hydrate, render } from '@solidjs/web';

type Props = Record<string, unknown>;
interface Mounted { update: (props: Props) => void; dispose: () => void }
const mounted = new WeakMap<HTMLElement, Mounted>();

function slotProps(element: HTMLElement, slots: Record<string, string>, hydratable: boolean): Props {
  const existing = new Map<string, HTMLElement>();
  if (hydratable) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeName === 'ASTRO-ISLAND') return NodeFilter.FILTER_REJECT;
        return node.nodeName === 'ASTRO-SLOT' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const slot = node as HTMLElement;
      existing.set(slot.getAttribute('name') ?? 'default', slot);
    }
  }
  const props: Props = {};
  for (const [name, html] of Object.entries(slots)) {
    let slot = existing.get(name);
    if (!slot) {
      slot = document.createElement('astro-slot');
      if (name !== 'default') slot.setAttribute('name', name);
      slot.innerHTML = html; // Trusted slot markup already rendered by Astro.
    }
    props[name === 'default' ? 'children' : name] = slot;
  }
  return props;
}

export default (element: HTMLElement) => (component: Component<Props>, props: Props,
  slots: Record<string, string>, options: { client: string }): void => {
  const previous = mounted.get(element);
  if (!previous && !element.hasAttribute('ssr')) return;
  const hydratable = options.client !== 'only';
  const values = { ...props, ...slotProps(element, slots, hydratable) };
  if (previous) { previous.update(values); return; }
  const [state, setState] = createStore<Props>(values);
  const view = () => createComponent(component, state);
  if (!hydratable) element.replaceChildren();
  const dispose = hydratable
    ? hydrate(view, element, { renderId: element.dataset.astrokSolidId ?? '' })
    : render(view, element);
  const instance: Mounted = {
    dispose,
    update(next) { setState(draft => {
      for (const key of Object.keys(draft)) if (!Object.hasOwn(next, key)) delete draft[key];
      Object.assign(draft, next);
    }); },
  };
  mounted.set(element, instance);
  element.addEventListener('astro:unmount', () => {
    instance.dispose(); mounted.delete(element);
  }, { once: true });
};
