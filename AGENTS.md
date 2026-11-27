# Working on Astrok

Astrok combines Astro pages, Solid 2 interactions and OKF sources. The workspace example is the
default; Starlight, hypermedia and graph/SQLite output are optional.

## Source and implementation

- Edit canonical `knowledge/` trees, never generated pages. Preserve unknown OKF metadata/types,
  source paths and concept IDs; resolve links to canonical pages and keep frontmatter out of
  rendered bodies. Distinguish [OKF requirements](https://okf.md/spec/) from project policies.
- Keep graph output deterministic with source provenance. Label inferred edges.
- Use public package exports across package boundaries. Keep modules focused, explain new
  dependencies, and update `ARCHITECTURE.md` when contracts change.
- Hypermedia accepts trusted application code only; it is not a sanitizer.
- Preserve local work and irreplaceable inputs. Do not commit secrets, generated output or
  dependencies. Keep internal paths relative and builds independent of sibling checkouts.

## Technical references

Read the applicable repository guide before specialized changes:

- TypeScript APIs/exports/validation: `skills/typescript-contracts/SKILL.md`.
- Vite/Solid compilation/assets: `skills/vite-rolldown/SKILL.md`.
- Astro rendering: `.agents/skills/docs-site/SKILL.md` and installed Astro types.
- OKF content: `.agents/skills/okf-knowledge/SKILL.md`.
- Graph compiler/SQLite: `.agents/skills/sqlite-knowledge-graph/SKILL.md`.
- Solid: after installing dependencies, consult `node_modules/solid-js/skills/solid-2.0/SKILL.md`
  and `node_modules/solid-js/CHEATSHEET.md`. Use Solid 2 APIs, not Solid 1 patterns.

## Verification

Follow `BUILDING.md`; run checks covering the change and add regression tests for parser, graph,
route or runtime behavior. Run `npm run validate:okf` after knowledge or validator changes.
`npm run verify` runs the full suite. Record commands and outcomes in ignored `harness/build-log.md`
(create the directory if needed), and state explicitly which required checks could not run.

## Shared skills

Use [skills-dev](https://github.com/f1b0-gh/skills-dev) for relevant work:
`skills/rust-discipline/SKILL.md` for Rust policy, `skills/rust-skills/` for
selected Rust references, and `skills/clickhouse-sql/SKILL.md` for ClickHouse.
Read these in the shared repository or an installed copy; project contracts,
dependency constraints and validation commands take precedence over examples.
Keep maintained instructions and documentation in English.
