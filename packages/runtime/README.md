# @astrok/runtime

Native Solid 2 shared state, request ownership, and bounded patch transport.
Version 0.1.0 requires `solid-js` and `@solidjs/web` 2.0.0-rc.21.

```ts
import { createSharedState, createLatestRequest, readPatches } from '@astrok/runtime';
import { z } from 'zod';

const schema = z.looseObject({ selected: z.string(), count: z.number() });
const shared = createSharedState({ selected: '', count: 0 }, schema.parse);
shared.update(draft => { draft.selected = 'item-1'; });
shared.patch({ count: 1 });
// Solid commits writes at the next microtask; use Solid's flush() in synchronous tests.
const request = createLatestRequest({
  request: (input: string, signal) => fetch(input, { signal }),
  decode: z.object({ count: z.number() }).parse,
  publish: result => { if (result.status === 'success') shared.patch(result.data); },
});
await request.run('/fixtures/count.json');
request.dispose();
shared.dispose();
```

Initialize caller state to `idle`; constructing a request does not publish or
write reactive state, so it is safe inside a Solid component's owned scope.
Requests publish `idle`, `pending`, `success` with `data`, or `error` with an
`error` string. `run(input)` clones the input snapshot; inputs must support
`structuredClone`. A new run aborts its predecessor and obsolete responses cannot
publish, even when transport ignores abort. `cancel()` publishes `idle`;
`dispose()` aborts silently and prevents new runs.

State patches merge nested objects, replace arrays, delete `null` properties,
and support `patch(input, true)` to preserve existing values while adding missing
nested properties. They accept JSON objects and reject unsafe prototype keys,
cycles, non-JSON values, and nesting deeper than 64 before mutation.
The required decoder validates initial state and the complete candidate for every
update or patch before any write. Its output becomes stored state, including any
schema transforms. Invalid changes leave the state unchanged; deleting a required
field fails validation. Use optional fields for deletable properties, and an open
record decoder for deliberately dynamic state. The decoder need not use Zod.

`readPatches(response, signal, { signals, elements? }, options?)` handles JSON,
trusted HTML, and the Datastar `datastar-patch-signals` / `datastar-patch-elements`
SSE subset. `signals` receives `(patch, onlyIfMissing)`. Options are
`maxEventBytes` (default 1 MiB, also bounds JSON/HTML bodies) and `maxDepth`
(default 64). UTF-8 and LF/CRLF can split at any byte. Every event byte counts,
including comments, multiple data lines, delimiters, and unfinished input.
Readers cancel and release their locks on abort/error/completion. Incomplete
frames fail; automatic reconnect/replay is outside this API.

The root import does not import the expression evaluator, Acorn or morphdom.

```ts
import { createHypermedia } from '@astrok/runtime/hypermedia';
const html = createHypermedia(shared, {
  allowedPaths: ['/fixtures/'],
  protectedRoots: [solidMount],
  onError: console.error,
});
const unmount = html.mount(serverRegion);
// Later: unmount(); html.dispose();
```

The optional subpath requires optional dependencies `morphdom` 2.7.8 and Acorn
8.19.0. It supports trusted `data-signals`, `data-text`, `data-show`, `data-bind`,
`data-on`, `data-effect`, `data-class` and `data-attr` attributes. Expressions use
`$state` names and `@get` / `@peek` actions. They execute application-authored code
using `new Function` and require CSP `unsafe-eval`; filtering HTML does not make
this an untrusted-markup sandbox. `baseURL` is an optional absolute same-origin
URL; allowed paths match a complete pathname or a pathname segment prefix.

Only mounted server regions accept element patches. Supply every Solid mount
as a protected root. Patches targeting those roots, descendants, or ancestors
are rejected; registered region boundaries retain their tag and id. The policy
conservatively rejects ancestor morphs even if incoming markup appears to retain
the Solid child. Mounting twice does not duplicate handlers. Unmount/disposal
removes bindings, effects, observers and outstanding requests. Factories created
inside a Solid owner also register owner cleanup; explicit cleanup remains useful
for application navigation.

Source attribution: state/SSE and hypermedia derive from soc-proto's
`apps/web/src/shared-signals.ts` and `apps/web/src/hypermedia.ts`; request generation
ownership derives from ECSpect's `site/analytics/src/selection.mjs`. No sibling
repository is needed to build or use this package. See [Building and testing](../../BUILDING.md) for the current verification commands.

Build with `npm run build --workspace=@astrok/runtime`. Declarations and executable
ESM are emitted to `dist/`; the maintained assets are `src/`, tests and manifests.
Browser ownership, focus and remount qualification belongs to the consuming
example's browser suite.

This imported runtime package retains its [MIT license](LICENSE).
