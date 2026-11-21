---
type: Reference
title: Gamma graph reference
description: Metadata, relation rules and query behavior for the gamma34/0.1 extension.
---

# Γ(3,4) in OKF: project extension gamma34/0.1

This is a project convention using OKF's extension mechanism. It is not part of OKF v0.3 and does
not promise compatibility with SSTorytime's database or N4L. Sources:
[OKF specification](https://github.com/open-knowledge-format/open-knowledge-format/blob/527e81aff55992be21507e97004286789126f88c/SPEC.md),
[Mark Burgess on Γ(3,4)](https://mark-burgess-oslo-mb.medium.com/designing-nodes-and-arrows-in-knowledge-graphs-with-semantic-spacetime-0992b9cae595),
and
[SSTorytime relation encoding](https://github.com/markburgess/SSTorytime/blob/5d965315bd5c4fb9f6c2b401963e114e4e91dd86/pkg/SSTorytime/STtype.go).

## Node declarations

```yaml
type: Software Component
graph_model: gamma34/0.1
graph_kind: thing
```

`graph_model` is a nonempty string identifying the semantic extension version. For `gamma34/0.1`,
each ordinary concept document must declare `graph_kind` as `event`, `thing`, or `concept`. This
categorizes what the document describes; it does not replace the open OKF `type` or the compiler's
document/directory kind. An event describes a transition or occurrence, a thing a relatively
persistent entity, and a concept an abstraction or characteristic. Categories are authored, not
inferred from filenames or prose. No category is imposed on ordinary OKF.

Declarations are local to the document. No inherited bundle declaration is assumed. `graph_kind`
without `graph_model` fails graph compilation. An unknown future model stays opaque: metadata and
original source are preserved, graphModel retains its declared value, graphKind is null, structural
links remain, and a diagnostic reports that its semantic extension was not interpreted. Unsupported
future relation syntax is not parsed under the current model.

Known malformed extension declarations fail graph compilation, not core OKF conformance. Unknown OKF
fields/types always remain preserved. Historical `graph_relations` without a model declaration
remain supported as the pre-versioned project convention, with unclassified nodes.

## Relation declarations

```yaml
graph_relations:
  - target: token-store.md#storage
    relation: contains
    family: contains
    inverse: part_of
    contexts: [example-sdk]
    weight: 1
    origin: explicit
    evidence: This modeled component contains the token store.
```

Each entry requires `target`, `relation` and `family`. Targets resolve as OKF Markdown paths,
relative to the source document or bundle root when starting with `/`. Targets must name a Markdown
document in the bundle. Missing files and headings produce diagnostics; missing targets do not
become fabricated nodes.

| Family         | ST type | Interpretation                                                    |
| -------------- | ------- | ----------------------------------------------------------------- |
| similar / near | 0       | Contextual similarity; symmetric, not necessarily transitive      |
| leads_to       | 1       | Transition, ordering or influence; not automatically causal proof |
| contains       | 2       | Composition or containment                                        |
| expresses      | 3       | A property or characteristic                                      |

`similar` normalizes to the existing `near` storage family. Source frontmatter retains the original
spelling. APIs accept either spelling. Graph JSON and SQLite both store `near`. A relation name is
global within a bundle and must have one consistent family and inverse. Semantic IDs are
`semantic:<relation>`.

`inverse` defaults to the same name for similarity or `inverse:<relation>` for other families.
Similarity cannot declare a different inverse. Querying either endpoint follows a similarity edge
even with direction out/in; returned direction still reflects the authored source/target
orientation. Other incoming traversals use the inverse name and negate the ST type. No duplicate
reverse assertion is created. Self-links are returned once. Walks report routes, not inferred causal
or transitive facts. The compiler imposes no rigid source/target category matrix.

`contexts` is a list of nonempty strings, deduplicated and sorted. Queries match an exact context
label. `weight` is a finite nonnegative number (default 1), not a probability. Path queries minimize
hops, not weights.

`origin` is explicit by default. Author-supplied hypotheses set origin inferred, confidence between
0 and 1, and nonempty evidence. No model invents these values. Optional evidence for explicit edges
records explanatory text. In its absence, provenance identifies the source file and
`graph_relations` entry index. Markdown link provenance additionally retains heading, line and
column positions.

Ordinary Markdown references stay `structural:references` with no ST type. Directory grouping uses
structural containment. These implementation edges must not be mistaken for authored domain
assertions or semantic node classification.

## Projection and versioning

OKF navigation and all authored relations feed `projectGraph` once per published bundle. Nodes,
relations, contexts, edges and evidence form an in-memory graph. JSON and SQLite are generated from
this identical graph, with matching source hashes; site output and graph output share the already
parsed bundle.

- OKF contract: v0.3 with pinned normative revision.
- Semantic extension: gamma34/0.1.
- SQL-free JSON envelope: format okf-graph, schemaVersion 2 (reader also accepts 1).
- SQLite schema: 3; semantic fields are retained in nodes.metadata JSON.
- Compiler: 2.

The JSON reader validates schema, fields, references, evidence and category consistency before
traversal. Unsupported JSON schemas fail explicitly; this is separate from preserving unknown
metadata inside a supported envelope.

Memory and SQLite queries share bounded traversal and provenance contracts. Search algorithms
differ: memory uses word-frequency weighting, SQLite uses FTS5/BM25. Ranking is intentionally not
guaranteed identical. Neither is natural language reasoning; an external agent selects queries and
interprets evidence.
