import { createSignal, onSettled } from 'solid-js';
import type { JSX } from '@solidjs/web';

interface CounterProps { name: string; initial?: number; children?: JSX.Element; title?: JSX.Element }
export default function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(() => props.initial ?? 0);
  onSettled(() => {
    // An example of component-owned setup, cleaned up on Astro navigation.
    const notify = () => document.dispatchEvent(new CustomEvent('astrok:counter-disposed'));
    return notify;
  });
  return <section data-counter={props.name}>
    <h2>{props.title ?? props.name}</h2>
    <button type="button" onClick={() => setCount(value => value + 1)}>Count {props.name}</button>
    <output aria-live="polite">{count()}</output>
    {props.children}
  </section>;
}
