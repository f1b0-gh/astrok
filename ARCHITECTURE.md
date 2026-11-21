# Architecture

Astrok publishes Markdown as Astro pages and raw sources. Solid 2 adds
interactive components; a graph index is optional.

| Package | Responsibility |
| --- | --- |
| [`@astrok/okf`](packages/okf/README.md) | Read OKF bundles, resolve links, publish sources and build graph indexes |
| [`@astrok/astro`](packages/astro/README.md) | Astro integration and native Solid 2 rendering |
| [`@astrok/runtime`](packages/runtime/README.md) | Shared state, requests and optional hypermedia interactions |
| [`@astrok/theme`](packages/theme/README.md) | Styles, fonts, tokens and logos |

Each site owns its Markdown bundle. `knowledge/` contains the Astrok user guide;
`examples/workspace/knowledge/` belongs to the workspace demo. The build derives
pages, raw Markdown, a discovery manifest and, when enabled, JSON/SQLite graphs.
Generated files are disposable; edits belong in the source bundle.

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

Shared-state updates validate the complete candidate and decoder output before
committing, including cross-field invariants and schema transformations. This
is proportional to total state size. Large independent data should use separate
stores. A future field-update API must specify validation scope and atomicity;
this review does not weaken the existing guarantee to optimize keystrokes.

Package exports are the integration boundary for repository scripts and tests.
There are no forwarding trees or legacy output-adoption layer. Adapted runtime
code and its MIT attribution remain in this repository; those source-history
references do not require sibling checkouts.

Graph and SQLite generation are explicit opt-ins. The documentation example
chooses a JSON graph; the generic workspace chooses neither. SQLite is an
optional dependency and can be omitted at installation. Strict internal-link
validation is a repository publishing policy, distinct from minimum OKF
conformance and forward-compatible metadata handling.
