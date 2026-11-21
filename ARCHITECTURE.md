# Architecture

Astrok publishes Markdown as Astro pages and raw sources. Solid 2 adds
interactive components; a graph index is optional.

| Package | Responsibility |
| --- | --- |
| [`@astrokjs/okf`](packages/okf/README.md) | Read OKF bundles, resolve links, publish sources and build graph indexes |
| [`@astrokjs/astro`](packages/astro/README.md) | Astro integration and native Solid 2 rendering |
| [`@astrokjs/runtime`](packages/runtime/README.md) | Shared state, requests and optional hypermedia interactions |
| [`@astrokjs/theme`](packages/theme/README.md) | Styles, fonts, tokens and logos |

Each site owns its Markdown bundle. `knowledge/` contains the Astrok user guide;
`examples/workspace/knowledge/` belongs to the workspace demo. The build derives
pages, raw Markdown, a discovery manifest and, when enabled, JSON/SQLite graphs.
Generated files are disposable; edits belong in the source bundle. Ownership
markers stay beside generated sources but are removed from the resolved Astro
client output in `astro:build:generated`; only Astrok's own marker copies in
`okf/` and the enabled `graph/` publication are removed.
The persisted ownership signature retains `@astrok/okf` as its format identifier
so existing generated directories remain usable after the npm scope changes to
`@astrokjs`. It is not a package import.

Site publication supports `strictLinks: true` to reject resolved-link diagnostics
before touching generated output. The Astro integration enables it by default;
`strictLinks: false` restores warning-only behavior. Development errors preserve
the previous output and recovery reloads the page. Low-level helpers default to warnings;
strictness is a publishing policy, not a change to OKF conformance. Unrelated
metadata warnings remain advisory, and external URLs are not fetched.

Astro builds Solid components for the server and browser. Components render to
HTML on the server; `client:*` directives opt into browser hydration. The
workspace's hypermedia demo uses a separate Solid client build. Both paths are
shown in [the workspace example](examples/workspace/README.md).

Graph indexes retain source references and authored relationships. They can be
rebuilt from the Markdown; they do not generate claims or execute its contents.
The [graph example](examples/graph/README.md) demonstrates typed relationships.

## Review decisions (2026-11-21)

The optional hypermedia entry point executes trusted application code. It does
not sanitize HTML; native handlers, URLs and nested templates remain intact.
Same-origin request policy and protected Solid roots constrain ownership, not
trust. Bindings name callbacks in a per-instance `handlers` registry. Application
bundlers compile those callbacks as ordinary JavaScript; the browser never
compiles attribute strings. The registry and effect watch lists are snapshotted
at creation. Unknown names fail, including in HTML received over SSE or fetch;
fragment producers must use the receiving application's registered names.

Value handlers read reactive state. Event/effect handlers mutate validated drafts
synchronously; effects explicitly declare root state keys to watch. `data-bind`
retains state-path syntax. This replaces executable attributes and removes the
Acorn dependency and `compileAttribute` export. Runtime transport validation
uses ordinary checks instead of Zod's optional JIT; applications configure their
own decoders for CSP. Both initial and fetched bindings
are tested with an enforced `script-src 'self'` policy, without `unsafe-eval` or
`unsafe-inline`. CSP configuration for other Astro features remains the site's
responsibility. Render-only mutations do not rescan the region.

HTML patches are not atomic: a later target may fail after earlier mutations.
Binding cleanup and refresh therefore run even when patching throws. Refreshes
are local to affected elements; unrelated regions keep their existing reactive
subscriptions. Normal state changes still notify all bindings that depend on
the changed values.

`createSharedState` validates the complete candidate and decoder output before
committing, including cross-field invariants and schema transformations. This
remains proportional to total state size. `createFieldState` is an explicit
alternative for a fixed set of independently validated root fields; it cannot
enforce cross-field invariants. Its `updateField` copies, validates and replaces
only the selected branch. Hypermedia `data-bind` uses that capability when
available, so a small form edit does not traverse an unrelated large dataset.
Nested bindings pay for their containing root field. Full `update`/`patch` and
event/effect handlers retain whole-state atomic validation. Both APIs preserve
pending-write ordering, decoder-output isolation and owner cleanup.

Package exports are the integration boundary for repository scripts and tests.
There are no forwarding trees or legacy output-adoption layer. Adapted runtime
code and its MIT attribution remain in this repository; those source-history
references do not require sibling checkouts.

Graph and SQLite generation are explicit opt-ins. The documentation example
chooses a JSON graph; the workspace demo also enables JSON discovery, with SQLite disabled. SQLite is an
optional dependency and can be omitted at installation. Strict internal-link
validation is an Astro publishing default and repository CI policy, distinct from minimum OKF
conformance and forward-compatible metadata handling.

Theme fonts are self-hosted WOFF2 assets compiled from pinned Fontsource build
dependencies. The theme tarball includes the selected weights, Unicode ranges
and original OFL notices; consumers need no font package or third-party font
service. Astro/Vite owns the final hashed, base-aware asset URLs.
