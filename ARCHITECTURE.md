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
