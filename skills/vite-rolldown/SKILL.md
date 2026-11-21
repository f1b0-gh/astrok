---
name: vite-rolldown
description:
  Use when configuring or debugging Astrok Vite 8 builds, Rolldown options, Solid island
  compilation, shared chunks, production asset paths, HMR, or package bundling.
---

# Vite and Rolldown

Vite 8 is the selected build tool. It already uses Rolldown; do not introduce `rolldown-vite`, a
second bundler CLI, or an Astro upgrade merely to obtain it. Read the actual lockfile, installed
plugin types and resolved build configuration. Astro and a separately compiled island can have
different Vite versions.

## Choose the artifact boundary

| Artifact                      | Dependency and asset handling                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Published ESM library         | Externalize declared peers and their subpaths; emit declarations separately                       |
| Final browser asset graph     | Bundle peers once or provide an explicit import map; no unresolved bare imports                   |
| Astro-processed client script | Astro can bundle compiled ESM and resolve final base-aware assets                                 |
| Independently served island   | Build an asset manifest, copy the entire chunk/CSS graph and resolve URLs against deployment base |

Choose and document one final asset owner. A library's externalized ESM cannot be copied directly to
`public/` and assumed browser-ready. A module script with `is:inline` bypasses Astro's normal
bundling. Keep client code off documentation routes that do not use it. Static HTML output alone
does not mean zero JavaScript.

## Solid and plugin compatibility

Inspect the active compiler, not just a familiar dependency name. The inspected Solid plugin can use
native `@solidjs/compiler` or Babel; pin/record the selected compiler alongside `solid-js`,
`@solidjs/web` and the Vite plugin. Requalify changes in browsers. Do not substitute the Solid 1
plugin or assume Astro's Solid adapter supports the pinned Solid 2 combination.

Use one multi-entry browser build/shared runtime graph for collaborating islands, or compile
externalized libraries for one final application build. Declare peers and dedupe as appropriate, but
verify resolved modules: `resolve.dedupe` cannot unify runtime code already embedded in separate
bundles. Pass an instance-owned store explicitly; avoid accidental module-global session caches.

For Vite 8, use typed `build.rolldownOptions` and `optimizeDeps.rolldownOptions` where needed. They
configure different phases. Check hook and transform support before porting Rollup/esbuild plugins;
aliases and similar option names do not establish identical semantics. Keep framework JSX
transformation with its qualified compiler.

## Verification and pitfalls

- Run TypeScript checks and declaration emit separately; Vite transpilation is not a type check.
  Validate package exports after packing.
- Preserve CSS and dynamic imports in manifests/receipts. Hash all relevant outputs, not just the
  entry JS. Never mark effectful startup/CSS as universally side-effect-free without checking tree
  shaking.
- Exercise `/` and a non-root base. Vite does not rewrite arbitrary `fetch()` strings. Pass service
  URLs explicitly; preserve the application's origin/path policy. Mutable HTML/manifests and hashed
  assets need different cache policies.
- Test dev/HMR and production preview: shared state, one request owner, mount/dispose/remount,
  navigation cleanup, CSS/chunk loads and no-JS reading.
- Test actual packed consumers without sibling checkouts or source aliases. Measure initial JS and
  request count before proposing chunk optimizations.

## References

- [Vite 8 migration and option changes](https://vite.dev/guide/migration)
- [Vite TypeScript handling](https://vite.dev/guide/features#typescript)
- [Vite backend integration and manifests](https://vite.dev/guide/backend-integration)
- [Rolldown entry guide](https://rolldown.rs/guide/getting-started)

Use documentation matching resolved versions. Installed Solid plugin declarations and lockfiles
determine its compiler options; do not copy options from memory.
