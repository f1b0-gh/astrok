# Repository instructions

## Mission
Build Astrok: Astro pages, independently compiled Solid 2 interactions, optional trusted hypermedia and agent-friendly OKF. The generic workspace is the default example; Starlight is an optional documentation consumer and SQLite is an optional derived graph store.

## Source-of-truth rules
- `knowledge/` and each example’s `knowledge/` tree are canonical for their respective sites. Never hand-edit generated documentation output.
- Follow the current specification at https://okf.md/spec/ and distinguish normative requirements from project conventions.
- Preserve unknown OKF frontmatter fields and unknown `type` values. Do not silently reject valid future metadata.
- Do not render YAML frontmatter in the human-facing page body.
- Preserve source paths and stable concept IDs. Links in generated output must resolve to canonical pages.
- Generated graph edges must carry provenance (source file and, where feasible, heading/fragment).

## Engineering rules
- Prefer small, testable modules and explicit interfaces.
- No PostgreSQL runtime dependency.
- Do not assume PostgreSQL-specific types/operators/functions exist in SQLite. Audit every query before porting it.
- SQLite graph schema should use normalized nodes and edges, foreign keys, indexes, and migrations.
- Keep the graph compiler deterministic. Rebuilding the same sources should produce semantically identical output.
- Do not invent semantic edges with an LLM as if they were facts. Label inferred edges and retain confidence/provenance.
- Avoid adding dependencies without explaining why.
- Do not commit secrets, generated databases, build output, or `node_modules`.

## Verification
- Run `npm run validate:okf` after changing the knowledge bundle or validator.
- Add tests for each new parser, graph transformation, or route.
- Record commands and outcomes in the ignored `harness/build-log.md`; create its parent directory when needed.
- If a command cannot be run, state that explicitly rather than claiming it passed.

## Codex workflow
- Read the relevant skill's `SKILL.md` before a specialized task.
- For TypeScript APIs, package exports and runtime validation (including optional
  Zod), read `skills/typescript-contracts/SKILL.md`. Repository-owned skills in
  `skills/` complement the existing `.agents/skills/` catalog; follow these
  relative paths even when they are not listed automatically by the harness.
- For Vite 8/Rolldown, Solid compilation, chunk graphs and deployment asset paths,
  read `skills/vite-rolldown/SKILL.md`.
- For Solid 2 changes, after `npm ci`, read
  `node_modules/solid-js/skills/solid-2.0/SKILL.md` and consult the bundled
  `solid-2.0-cheatsheet` for exact APIs. Do not substitute Solid 1 patterns.
- For Astro rendering, also follow `.agents/skills/docs-site/SKILL.md` and the
  installed Astro renderer/integration types; the site skill alone does not
  specify the native renderer contract.
- Keep changes within the user-requested scope; do not expand it silently.
- Update architecture decisions when implementation evidence changes an assumption.

## Experiment retention and portability

Code is the primary retained asset. Apply this rule to existing experiments as
well as new work: preserve maintained source, unique local changes, manifests,
lockfiles and irreplaceable inputs. Integrate or retain code that exists only
in a temporary experiment before proposing removal of that experiment tree.

Generated outputs, caches, intermediate files and raw results may be proposed
for cleanup when the code and necessary inputs, a usable reproduction recipe,
and a PDF report survive outside the proposed deletion. The recipe identifies
commands, toolchain, dependency versions, configuration and inputs. The PDF
records findings and limitations and points to the retained code and recipe.
At handoff, identify all three by path and state which reproduction checks ran.
Missing prerequisites require a concrete follow-up, not indefinite retention
of every output. A PDF alone does not establish reproducibility.

Keep raw material only when it is irreplaceable, cannot be reproduced, or is
required by an explicit project obligation; identify the exception and reason.
This does not waive required evidence for current validation or release claims.
Routine build caches need retained source and rebuild inputs, not a separate PDF.
Eligibility does not authorize deletion: preserve active work and use the
user's cleanup selection and applicable deletion checks.

Keep these instructions self-contained in this repository. Before independent
distribution, replace dependencies on absolute local paths or implicit sibling
checkouts with explicit, versioned dependency acquisition or packaging. Use
repository-relative paths for internal files. Record existing cross-project
path dependencies for that portability work; do not silently replace dependency
sources or claim an independent checkout has been verified when it has not.
