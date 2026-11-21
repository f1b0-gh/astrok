# Astrok workspace example

The `knowledge/` directory is canonical for this example. Plain Astro renders
its pages and publishes raw Markdown plus an agent manifest. The workspace uses
two separate state instances. Within each, HTML controls and a Solid component
share native Solid state; a synthetic service supplies exact-ID rows, SSE signal
patches and trusted HTML fragments. The table reveals at most 100 more rows per
click. This is not a virtualization or production authentication example.

From the repository root, using Node 24:

```sh
npm ci
npm run build:packages
npm run build --workspace @astrok/example-workspace
npm run preview --workspace @astrok/example-workspace
```

The synthetic preview binds loopback port 4338. Open `/workspace/` for shared controls, or `/solid/` for native SSR and hydration; documentation
and source downloads also work when JavaScript is disabled. The streaming service
is part of `fixture.mjs`, not the framework. Main and alternate workspace routes
use Astro client navigation; Home and Guide remain static documentation.

For development, `npm run dev --workspace @astrok/example-workspace` watches the
independent Solid build and runs Astro on loopback port 4341. It is a frontend
development server; use the fixture preview to exercise the synthetic data API.
Compiled-entry edits reload the development interface; persistent hot-edit state
is not promised. Production navigation explicitly disposes the previous workspace.

To exercise a deployment prefix, set `ASTROK_BASE=/portal/` for both build and
preview. Service URLs and raw/source links use that base. Astro owns the final
hashed assets: the intermediate `.client/` directory contains externalized ESM
for Astro to bundle, and is not a standalone browser distribution.

The native `/solid/` example imports `.tsx` directly into Astro and exercises
its client directives. `/solid-static/` renders the same component without
JavaScript. The older workspace keeps its separate compilation path to test
shared state and hypermedia ownership.

The optional hypermedia layer uses names of registered JavaScript handlers in
attributes. It does not require CSP `unsafe-eval`; HTML patches must still be
trusted application-authored content. See the [runtime contract](../../packages/runtime/README.md)
for registration and migration examples. Core Solid/state/SSE usage does not
require the hypermedia entry point. Application authorization, private caches and session
state belong in the consuming application, outside public OKF artifacts.

See [Building and testing](../../BUILDING.md) for package-consumer verification
and browser prerequisites. Dependency versions are recorded in `package-lock.json`
at the repository root.

## GitHub Pages

The sample is deployed at <https://f1b0-gh.github.io/astrok/>. CI builds and tests
both the complete local example and a static-hosting version before deployment.
The static version supports shared controls, native Solid counters and the design
system. Rows and streaming need the local preview server; those buttons are
disabled on Pages.

To reproduce the static build from the repository root:

```sh
ASTROK_BASE=/astrok/ ASTROK_SITE=https://f1b0-gh.github.io ASTROK_STATIC_DEMO=1 npm run build
ASTROK_BASE=/astrok/ npm run test:pages
```

The workflow gets the origin and prefix from GitHub Pages settings. A custom
domain can be configured later and picked up on the next deployment. Only
`examples/workspace/dist/` is uploaded; generated files are not committed.
