# Changelog

## Unreleased

- Move public packages and examples to the `@astrokjs` npm scope. Update imports,
  workspace dependencies and tarball installation instructions together. Add
  repository metadata and explicit public access for future npm releases.

- Introduce Astrok on the demo homepage with installation and source discovery.
  Enable the demo's JSON graph and `llms.txt`, with deployment-aware agent prompts.
- Explain hosted service limits and Solid loading modes, simplify navigation and
  use English throughout the design preview.
- Bundle licensed font assets in the theme, replacing Google Fonts requests.

- Remove Astrok ownership marker copies from deployed Astro output while
  retaining generated-source markers for repeat builds. Complete the plain-mode
  README quickstart with a Markdown renderer, page route and Git ignore guidance.

- **Breaking:** Astro integration setup/build now rejects invalid internal links
  by default, reporting source paths and lines before changing generated output.
  Set `strictLinks: false` for the previous warning-only behavior. Low-level
  `loadSite`/`generateSite` helpers support opt-in strict checking. Development
  source errors preserve valid output and recover after repairs.

- Add opt-in `createFieldState` with independently validated root fields.
  `updateField` and its `data-bind` path copy and validate only the changed
  branch, avoiding work on unrelated large datasets. The existing whole-state
  API retains cross-field validation and atomic updates.

- **Breaking:** replace executable hypermedia attributes with typed, registered
  JavaScript handlers. Effects declare their watched state keys. Remove
  `compileAttribute`, its expression types and the runtime Acorn/Zod dependencies;
  no `unsafe-eval` is required. Initial and fetched bindings are tested under
  strict CSP. See the runtime README for migration instructions.
- Avoid rescans for rendered attributes/text and handle empty or rejected number
  input without uncaught listener errors.
- Remove the incomplete HTML filter. Hypermedia fragments are trusted application
  code and are not sanitized; native handlers and nested templates are preserved.
- Default graph and SQLite generation to opt-in. The documentation example
  explicitly enables its JSON graph. Enable SQLite with `sqlite: true`,
  `--sqlite`, or `OKF_SQLITE=1` in the documented entry points.
- Add strict internal-link checks for all maintained knowledge bundles in CI.
- Consume built package exports from root tools/tests; remove forwarding folders
  and legacy generated-output adoption. Rename `ressources/` to `resources/`.
- Align runtime description and Node 24 engines, preserving its MIT attribution.
  Add runtime formatting checks and broader parser/browser regressions.
- Update Solid 2.0.0 documentation and add the release procedure.

## 0.1.0 — development baseline

Local workspace packages for OKF parsing/publication, Astro and Solid 2 rendering,
shared runtime and theme. Includes the plain workspace and optional Starlight
consumer, deterministic graph compilation and packed-consumer verification.
This entry records the development baseline, not an npm publication.
