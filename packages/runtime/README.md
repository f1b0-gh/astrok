# @astrokjs/runtime

Native Solid 2 shared state, request ownership, and bounded patch transport. Version 0.1.0-beta.1
accepts `solid-js` and `@solidjs/web` ^2.0.0; the workspace example pins and tests both at 2.0.0.

```ts
import { createSharedState, createLatestRequest, readPatches } from '@astrokjs/runtime';
import { z } from 'zod';

// If using Zod under strict CSP, configure it before constructing schemas.
z.config({ jitless: true });
const schema = z.looseObject({ selected: z.string(), count: z.number() });
const shared = createSharedState({ selected: '', count: 0 }, schema.parse);
shared.update((draft) => {
  draft.selected = 'item-1';
});
shared.patch({ count: 1 });
// Solid commits writes at the next microtask; use Solid's flush() in synchronous tests.
const request = createLatestRequest({
  request: (input: string, signal) => fetch(input, { signal }),
  decode: z.object({ count: z.number() }).parse,
  publish: (result) => {
    if (result.status === 'success') shared.patch(result.data);
  },
});
await request.run('/fixtures/count.json');
request.dispose();
shared.dispose();
```

Initialize caller state to `idle`; constructing a request does not publish or write reactive state,
so it is safe inside a Solid component's owned scope. Requests publish `idle`, `pending`, `success`
with `data`, or `error` with an `error` string. `run(input)` clones the input snapshot; inputs must
support `structuredClone`. A new run aborts its predecessor and obsolete responses cannot publish,
even when transport ignores abort. `cancel()` publishes `idle`; `dispose()` aborts silently and
prevents new runs.

State patches merge nested objects, replace arrays, delete `null` properties, and support
`patch(input, true)` to preserve existing values while adding missing nested properties. They accept
JSON objects and reject unsafe prototype keys, cycles, non-JSON values, and nesting deeper than 64
before mutation. The required decoder validates initial state and the complete candidate for every
update or patch before any write. Its output becomes stored state, including any schema transforms.
Invalid changes leave the state unchanged; deleting a required field fails validation. Use optional
fields for deletable properties, and an open record decoder for deliberately dynamic state. The
decoder need not use Zod.

`createSharedState` validates, clones and reconciles the complete state on every write. Keep it for
cross-field invariants. Number inputs produce numbers or `null` when cleared; use a nullable decoder
if clearing is allowed. Invalid input or rejected state is reported through `onError` and leaves
accepted state unchanged.

For independent fields next to a large dataset, opt into `createFieldState`:

```ts
import { createFieldState } from '@astrokjs/runtime';

const fields = createFieldState(
  { note: '', rows: [] as string[] },
  {
    note: z.string().max(200).parse,
    rows: z.array(z.string()).parse,
  },
);
fields.updateField('note', (note) => note + '!');
// <input data-bind="note"> also uses this field-only path when mounted with fields.
```

Each root field has its own decoder; all declared fields must be present and unknown fields are
rejected. Decoder definitions are snapshotted at creation. There is no cross-field validation in
this API. Use `createSharedState` when one field's validity depends on another.

`updateField(key, recipe)` receives an isolated copy of the current field, including pending writes,
and must synchronously return its new value. The candidate and decoded output are checked before
replacing that branch. A rejected write leaves all fields unchanged. Other root fields are neither
copied nor decoded, so editing `note` does not visit `rows`. Nested bindings such as
`data-bind="form.note"` copy and validate the containing `form` branch. Put large independent
datasets in separate root fields or stores.

Full `update`/`patch` and hypermedia event/effect handlers still validate the whole candidate
atomically. Merge-patch `null` deletes a field and therefore cannot remove a required root field;
`updateField` can store `null` if its decoder accepts it. Field updates cost time proportional to
the selected branch and its decoder, not total state size. Unmount and disposal retain the same
ownership rules.

`readPatches(response, signal, { signals, elements? }, options?)` handles JSON, trusted HTML, and
the Datastar `datastar-patch-signals` / `datastar-patch-elements` SSE subset. `signals` receives
`(patch, onlyIfMissing)`. Options are `maxEventBytes` (default 1 MiB, also bounds JSON/HTML bodies)
and `maxDepth` (default 64). UTF-8 and LF/CRLF can split at any byte. Every event byte counts,
including comments, multiple data lines, delimiters, and unfinished input. Readers cancel and
release their locks on abort/error/completion. Incomplete frames fail; automatic reconnect/replay is
outside this API.

The root import does not import hypermedia or morphdom. The optional `@astrokjs/runtime/hypermedia`
subpath uses `morphdom` 2.7.8 and registered callbacks:

```ts
import { createHypermedia } from '@astrokjs/runtime/hypermedia';
const html = createHypermedia(shared, {
  allowedPaths: ['/fixtures/'],
  protectedRoots: [solidMount],
  onError: console.error,
  handlers: {
    increment: {
      run: (state) => {
        state.count++;
      },
    },
    count: { run: (state) => state.count },
    load: {
      run: (_state, actions) => {
        void actions.get('/fixtures/count.json');
      },
    },
    logCount: {
      watch: ['count'],
      run: (state) => {
        console.log(state.count);
      },
    },
  },
});
const unmount = html.mount(serverRegion);
// Later: unmount(); html.dispose();
```

```html
<button data-on:click="increment">Increment</button>
<span data-text="count"></span>
<button data-on:click="load">Load</button>
<div data-effect="logCount"></div>
<input type="number" data-bind="count" />
```

`data-signals`, `data-text`, `data-show`, `data-on`, `data-effect`, `data-class` and `data-attr`
values name entries in `handlers`. `data-bind` still takes a state path. Names start with a letter
and contain letters, digits, `_`, `-` or `.`; `constructor`, `prototype` and `__proto__` are
reserved. Names are case sensitive and surrounding whitespace is ignored. Each instance snapshots
its registry and watch arrays at creation. Attribute changes resolve a new handler; unknown names
fail without an expression fallback. Initial mount errors throw; later observer and event errors go
to `onError`.

Callbacks receive `(state, actions, element, event?)`, with state types inferred from the shared
store. Value callbacks return the value to render and must be read-only. `data-signals` returns a
merge patch (or a value for `data-signals:path`); `__ifmissing` preserves existing values. Event and
effect callbacks receive a draft and must mutate it synchronously. Their return values are ignored.
Use `actions.get(url)` for bounded JSON/HTML/SSE patches and `actions.peek(fn)` for an untracked
read. Handle other asynchronous work outside the draft, then call `shared.update` or `shared.patch`
with the result.

Effects require an explicit `watch` array of root state keys. Nested changes to those keys trigger
the effect; unrelated keys do not. An empty array runs on attachment and element-patch revisions
only. Watched effects also run on those revisions; avoid writing to their own watched keys.
Render-only mutations do not rescan the region; binding attributes and element insertion or removal
still do.

### Migrating executable attributes

Replace `data-on:click="$count++"` with `data-on:click="increment"` and register the callback above.
Replace `data-text="$count"` with `data-text="count"`. Move `@get(...)` and `@peek(...)` calls into
callbacks using `actions`. `compileAttribute` and the expression types have been removed. HTML
received over fetch or SSE must use names registered by the receiving page as well.

No binding uses `eval`, `new Function` or a runtime expression parser. Bundle callbacks into an
external script permitted by your policy; hypermedia works with `script-src 'self'` without
`unsafe-eval` or `unsafe-inline`. Other site features and caller-supplied decoders may need their
own CSP configuration (the Zod example above disables its optional JIT). Native inline HTML handlers
remain subject to CSP and will not run under that policy.

HTML patches are **not sanitized**: native handlers, embedded documents, URLs and nested templates
are preserved. Registered names are not a sandbox or an authorization boundary. Only pass trusted
application-authored HTML, never user content. `baseURL` is an optional absolute same-origin URL;
allowed paths match a complete pathname or a pathname segment prefix.

Only mounted server regions accept element patches. Supply every Solid mount as a protected root.
Patches targeting those roots, descendants, or ancestors are rejected; registered region boundaries
retain their tag and id. The policy conservatively rejects ancestor morphs even if incoming markup
appears to retain the Solid child. Mounting twice does not duplicate handlers. Unmount/disposal
removes bindings, effects, observers and outstanding requests. Factories created inside a Solid
owner also register owner cleanup; explicit cleanup remains useful for application navigation.

This package is self-contained; historical source attribution is in [NOTICE](NOTICE). See
[Building and testing](../../BUILDING.md) for the verification commands.

Build with `npm run build --workspace=@astrokjs/runtime`. Declarations and executable ESM are
emitted to `dist/`; the maintained assets are `src/`, tests and manifests. Browser ownership, focus
and remount qualification belongs to the consuming example's browser suite.

This imported runtime package retains its [MIT license](LICENSE).
