---
name: okf-knowledge
description:
  Create, edit, validate, link, and enrich OKF Markdown knowledge bundles. Use when working in
  knowledge/, frontmatter, index.md/log.md, concept IDs, or bundle conformance.
---

# OKF knowledge workflow

1. Read the current specification at https://okf.md/spec/ before making schema assumptions.
2. Treat `knowledge/` as the canonical source of truth.
3. Preserve unknown frontmatter fields and unknown `type` values.
4. Remember that `index.md` and `log.md` are reserved files; follow their current special formats.
5. Keep frontmatter YAML out of the rendered body, but do not delete metadata from the source.
6. Use standard relative Markdown links for concept-to-concept references.
7. Report broken links as diagnostics; do not confuse them with the spec's minimum conformance
   requirements.
8. Never invent semantic relationships. If proposing inferred relations, label them as inferred and
   include evidence/provenance.
9. After edits, run `npm run validate:okf` and update or add tests if validation behavior changed.
10. When generating indexes, preserve stable paths and deterministic ordering.

## Output expectations

Summarize changed files, validation results, broken links, and any unresolved ambiguity in the OKF
spec.
