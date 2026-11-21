import { createEffect, createSignal, onCleanup } from 'solid-js';
import { render, For, Show } from '@solidjs/web';
import { createSharedState, createLatestRequest, readPatches, type RequestState } from '@astrokjs/runtime';
import { createHypermedia } from '@astrokjs/runtime/hypermedia';
import { z } from 'zod';

// Application-owned decoders must also avoid JIT compilation under strict CSP.
z.config({ jitless: true });

const rowsSchema = z.looseObject({
  selection: z.enum(['alpha', 'beta']),
  rows: z.array(z.looseObject({ id: z.string().regex(/^\d+$/), label: z.string() })).max(1000),
});
type Rows = z.infer<typeof rowsSchema>;
const stateSchema = z.looseObject({ selected: z.string(), summary: z.string(), clicks: z.number(), note: z.string() });
type State = z.infer<typeof stateSchema>;
type Shared = ReturnType<typeof createSharedState<State>>;

let generation = 0;
let cleanups: (() => void)[] = [];
export function dispose() {
  generation++;
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
}

function Panel(props: { shared: Shared; service: string; name: string; staticDemo: boolean; hypermedia: ReturnType<typeof createHypermedia> }) {
  const [result, setResult] = createSignal<RequestState<Rows>>({ status: 'idle' });
  const [error, setError] = createSignal('');
  const [limit, setLimit] = createSignal(100);
  const streams = new Set<AbortController>();
  const request = createLatestRequest<Rows, { selected: string; fail: boolean }>({
    request: (snapshot, signal) => fetch(`${props.service}rows?selection=${encodeURIComponent(snapshot.selected)}&fail=${snapshot.fail}`, { signal }),
    decode: input => rowsSchema.parse(input),
    publish: setResult,
  });
  const cancelStreams = () => { for (const stream of streams) stream.abort(); streams.clear(); };
  createEffect(() => props.shared.state.selected, () => {
    request.cancel(); cancelStreams(); setError(''); setLimit(100);
  });
  onCleanup(() => { request.dispose(); cancelStreams(); });
  const data = () => { const value = result(); return value.status === 'success' ? value.data : undefined; };
  const message = () => { const value = result(); return error() || (value.status === 'error' ? value.error : ''); };
  async function streamSummary() {
    cancelStreams();
    const controller = new AbortController(); streams.add(controller); setError('');
    try {
      const response = await fetch(`${props.service}stream?region=${encodeURIComponent(props.name)}`, { signal: controller.signal });
      await readPatches(response, controller.signal, {
        signals: (patch, missing) => props.shared.patch(patch, missing),
        elements: patch => props.hypermedia.applyElements(patch),
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { streams.delete(controller); }
  }
  function protectedPatch() {
    try { props.hypermedia.applyElements({ selector: `#solid-${props.name}`, mode: 'inner', elements: '<p>Invalid replacement</p>' }); }
    catch (cause) { setError(`Update blocked: interactive controls are protected. ${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  return <>
    <Show when={props.staticDemo}><p data-service-notice id={`${props.name}-service-notice`}>Rows, streaming and failure examples need the local preview server. Run <code>npm run build &amp;&amp; npm run preview</code> in the checkout to try them.</p></Show>
    <div class="actions">
      <button type="button" onClick={() => props.shared.update(draft => { draft.selected = draft.selected === 'alpha' ? 'beta' : 'alpha'; })}>Toggle selection</button>
      <button type="button" disabled={props.staticDemo} aria-describedby={props.staticDemo ? `${props.name}-service-notice` : undefined} onClick={() => { setError(''); void request.run({ selected: props.shared.state.selected, fail: false }); }}>Load rows</button>
      <button type="button" disabled={props.staticDemo} aria-describedby={props.staticDemo ? `${props.name}-service-notice` : undefined} onClick={() => void streamSummary()}>Stream summary</button>
      <button type="button" disabled={props.staticDemo} aria-describedby={props.staticDemo ? `${props.name}-service-notice` : undefined} onClick={() => { setError(''); void request.run({ selected: props.shared.state.selected, fail: true }); }}>Request failure</button>
      <button type="button" onClick={protectedPatch}>Test update protection</button>
    </div>
    <Show when={message()}><p role="alert">{message()}</p></Show>
    <p role="status">{result().status === 'pending' ? 'Loading rows…' : data() ? `${data()!.rows.length} matching rows · ${Math.min(limit(), data()!.rows.length)} shown` : props.staticDemo ? 'Try changing the selection or counting clicks; each panel keeps its own state.' : 'Choose a selection and load rows.'}</p>
    <Show when={data()}>{value => <>
      <div class="table-scroll" tabindex="0" role="region" aria-label={`${props.name} results`}>
        <table><thead><tr><th scope="col">Exact ID</th><th scope="col">Item</th></tr></thead>
          <tbody><For each={value().rows.slice(0, limit())}>{row => <tr><td>{row.id}</td><td>{row.label}</td></tr>}</For></tbody>
        </table>
      </div>
      <Show when={limit() < value().rows.length}><button type="button" onClick={() => setLimit(count => count + 100)}>Show next 100 rows</button></Show>
    </>}</Show>
  </>;
}

export async function initialize() {
  dispose();
  const current = generation;
  const remount = document.getElementById('remount');
  const repeat = () => { void initialize(); };
  remount?.addEventListener('click', repeat);
  cleanups.push(() => remount?.removeEventListener('click', repeat));
  for (const element of document.querySelectorAll<HTMLElement>('[data-workspace]')) {
    const name = element.dataset.workspace!;
    const service = element.dataset.service!;
    const staticDemo = element.dataset.staticDemo === 'true';
    const root = element.querySelector<HTMLElement>('[data-hypermedia]')!;
    const solid = element.querySelector<HTMLElement>('[data-solid]')!;
    const shared = createSharedState<State>({ selected: 'alpha', summary: 'Preparing…', clicks: 0, note: '' }, stateSchema.parse);
    const controller = new AbortController();
    cleanups.push(() => { controller.abort(); shared.dispose(); });
    // Exercise an event received before either view is mounted.
    await readPatches(new Response('event: datastar-patch-signals\ndata: signals {"summary":"Before mount"}\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    }), controller.signal, { signals: (patch, missing) => shared.patch(patch, missing) });
    if (current !== generation) return;
    if (staticDemo) shared.patch({ summary: 'Ready for local interactions' });
    const hypermedia = createHypermedia(shared, {
      allowedPaths: [service], protectedRoots: [solid],
      handlers: {
        selectBeta: { run: (state) => { state.selected = 'beta'; } },
        increment: { run: (state) => { state.clicks++; } },
        selected: { run: (state) => state.selected },
        clicks: { run: (state) => state.clicks },
        summary: { run: (state) => state.summary },
      },
    });
    hypermedia.mount(root);
    solid.replaceChildren();
    const unmount = render(() => <Panel shared={shared} service={service} name={name} staticDemo={staticDemo} hypermedia={hypermedia} />, solid);
    cleanups.push(() => { hypermedia.dispose(); unmount(); });
  }
}

if (import.meta.hot) import.meta.hot.dispose(dispose);
