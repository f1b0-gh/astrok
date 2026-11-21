# @astrok/okf

Read OKF 0.3 bundles, publish their Markdown sources and build an optional graph.
Unknown types and nested metadata are preserved. Markdown without a non-empty
`type` is skipped with a warning; root indexes and logs remain separate document
kinds. Malformed YAML is an error.

The root exports `readBundle`, `parseSource` (`parseDocument` is an alias),
`readMetadata`, URL helpers and Markdown inspection. `parseSource` returns
`{ document, errors, warnings }`; `document` is null for skipped Markdown.

`readMetadata(metadata, { now })` accepts singleton list fields and derives
`trustTier`, `freshness`, `status` and `current` without changing the input.
Only verification events at or after `generated.at` count. Unparseable deadlines
return `freshness: 'malformed'`. It does not execute computations or attest values.

`@astrok/okf/site` exports `loadSite({ root, base })`, returning
`{ bundle, documents, manifest, pages, raw }`. Documents contain source IDs,
metadata, transformed Markdown bodies without frontmatter, page URLs and raw
source URLs. A plain Astro route can render those bodies using its Markdown
renderer. `generateSite` also accepts `docsDir`, `publicDir` and
`presentation: 'plain' | 'starlight'` and publishes raw sources and the manifest;
plain mode skips generated Starlight content. URL prefixes do not change disk
paths: `/portal/okf/topic.md` is still published at `publicDir/okf/topic.md`.

Outputs claim absent or empty directories with `.astrok-owned.json`; subsequent
runs can prune those directories. Existing directories without the marker,
canonical source ancestors/descendants and symbolic links are refused. Use fresh,
dedicated generated output paths; do not add caller-authored files to them.

`@astrok/okf/graph` exports the SQL-free graph and Node publication helpers.
`@astrok/okf/sqlite` explicitly loads the optional SQLite WASM dependency.
`publishIndex({ sqlite: false })` avoids importing that engine. These are Node
build/query entry points and must remain off browser import graphs. Low-level
publication writes known filenames, so supply a dedicated generated public tree.

The graph includes concept references from OKF path fields, with the field name
in each evidence record. Relative paths start at the containing file; unversioned
and <=0.2 bundles may fall back to the bundle root. SQLite schema 3 migrates the
previous evidence table; JSON snapshots use schema 2 and readers still accept
schema 1. Index/log navigation nodes are not concepts.

Build with Node 24 and `npm run build --workspace=@astrok/okf` before packing.
The package contains executable ESM plus generated declarations, including an
explicit declaration-specifier rewrite after TypeScript compilation. Parser/site
JavaScript remains maintained JavaScript; graph TypeScript is not duplicated.

The graph entry point also exports `OKF_SPEC` and the Node filesystem helpers
`atomicWrite`, `assertOutside` and `physicalPath` used by the repository CLI.
The SQLite entry point exports `migrate` and `SCHEMA_VERSION` for migration
verification. Repository scripts and tests consume these emitted package exports.
