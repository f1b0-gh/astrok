import { OKF_SPEC } from './version.ts';
import { GRAPH_MODEL } from './model.ts';

/** Compact entry point. Detailed query mechanics are fetched only when needed. */
export function queryGuide({ sqlite = false } = {}): string {
  return `# OKF Knowledge Docs

> Content is OKF ${OKF_SPEC.version}: canonical Markdown with YAML frontmatter.
> Graph semantics use the project extension ${GRAPH_MODEL}, independently versioned from OKF.

Start with the source index; use the manifest if an index is absent. Read relevant
sections, then follow Markdown links and graph_relations targets. Resolve relative
targets against their source file; a leading / means the bundle root at /okf/.
Direct navigation requires only HTTP access, not SQL or code execution.

The extension describes events, things and concepts, with similar, leads_to,
contains and expresses relations. Consult the query reference for their precise
meaning. Preserve unfamiliar metadata and do not assume future versions behave
the same way.

Cite supporting source pages and sections. Keep inferred hypotheses distinct from
authored assertions; a reference alone is not proof. Report missing evidence.
Compare source_hash when combining indexes from different downloads.

## Start here

- [Source index](/okf/index.md): Browse canonical documents.
- [Source manifest](/okf/manifest.json): Find document URLs, metadata and links.
- [Graph query reference](/graph/query-guide.md): Relation semantics, versions, TypeScript/CLI examples, limits and citations.

## Optional

- [JSON graph](/graph/graph.json): Query nodes, relations and evidence without SQL.
${sqlite ? '- [SQLite index](/graph/knowledge.sqlite): Automatically derived from the same OKF graph; query with SQLite WASM.\n- [SQL query reference](/graph/sqlite-query.txt): Loading instructions and SQL examples.\n' : ''}- [Reviewed OKF specification](${OKF_SPEC.url}): Pinned normative format revision.
`;
}
