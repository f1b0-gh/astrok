# Changelog

## Unreleased

- Reuse compiled hypermedia event expressions, avoid rescans for rendered
  attributes/text, and handle empty or rejected number input without uncaught
  listener errors. Fix expressions ending in a line comment.
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
