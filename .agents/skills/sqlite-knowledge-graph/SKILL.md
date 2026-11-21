---
name: sqlite-knowledge-graph
description:
  Design or implement the SQLite-backed graph compiler, schema, provenance, graph traversal,
  exports, and agent query interface for the OKF documentation project.
---

# SQLite knowledge graph workflow

1. Read `ARCHITECTURE.md` and inspect the current SSTorytime source/API before claiming
   compatibility.
2. Keep the graph a deterministic projection of OKF sources, not a separately authored database.
3. Normalize nodes, edges, and source provenance. Use stable concept IDs.
4. Audit every PostgreSQL feature before porting: composite types, arrays, operators, custom
   functions, full-text search, transactions, and recursive queries.
5. Prefer portable SQLite SQL and recursive CTEs for bounded traversals. Do not require PostgreSQL
   or a graph extension.
6. Preserve edge provenance and origin (`explicit`, `structural`, `inferred`). Never present
   inferred edges as verified facts.
7. Add foreign keys, indexes, schema versioning, migration tests, and idempotent rebuild tests.
8. Keep a backend-neutral graph interface and consider static JSON export for client-side
   exploration.
9. Return source paths and fragments with graph query results.
10. Test cycles, dangling links, duplicate edges, deleted documents, and deterministic rebuilds.
