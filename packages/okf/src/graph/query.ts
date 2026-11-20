import { WasmDatabase } from './wasm.ts';
import type { Binding, Row } from './wasm.ts';
import { assertSchema, SCHEMA_VERSION } from './schema.ts';
import type { GraphNode, GraphEdge, Evidence, Origin } from './model.ts';

import { GraphQueries, bounded, urlFor, rawUrl, searchTerms, normalizeFamily, validateFilters } from './query-core.ts';
import { semanticIdentity } from './model.ts';
import type { IndexedNode, Citation, Filters, Neighbor } from './query-core.ts';
export type { IndexedNode, Citation, Filters, Neighbor, WalkOptions } from './query-core.ts';
function nodeFrom(row: Row): IndexedNode {
  const sourcePath = row.source_path as string | null;
  return { ...semanticIdentity(JSON.parse(row.metadata as string)), id: row.id as string, kind: row.kind as GraphNode['kind'], title: row.title as string,
    description: row.description as string, type: row.type as string | null, body: row.body as string,
    metadata: JSON.parse(row.metadata as string), sourcePath, url: sourcePath ? urlFor(sourcePath) : null, sourceUrl: sourcePath ? rawUrl(sourcePath) : null };
}

/** Read-only, backend-neutral query surface backed by the SQLite WASM adapter. */
export class SqliteKnowledgeIndex extends GraphQueries {
  private db: WasmDatabase;
  private constructor(db: WasmDatabase) { super(); this.db = db; }
  static async fromBytes(bytes: Uint8Array): Promise<SqliteKnowledgeIndex> {
    const db = await WasmDatabase.open(bytes);
    try { assertSchema(db); db.exec('PRAGMA query_only = ON'); return new SqliteKnowledgeIndex(db); }
    catch (error) { db.close(); throw error; }
  }
  static async open(file: string): Promise<SqliteKnowledgeIndex> {
    const { readFile } = await import('node:fs/promises');
    return this.fromBytes(await readFile(file));
  }
  get runtime() { return this.db.runtime; }
  close(): void { this.db.close(); }
  getNode(id: string): IndexedNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id);
    return row ? nodeFrom(row) : null;
  }
  search(text: string, { limit = 20 }: { limit?: number } = {}) {
    bounded(limit, 20, 100, 'limit');
    const tokens = searchTerms(text);
    if (!tokens.length) return [];
    const match = tokens.map(token => `"${token}"`).join(' AND ');
    return this.db.prepare(`SELECT n.*, bm25(node_search, 5.0, 2.0, 1.0) AS score,
      snippet(node_search, 2, '', '', ' … ', 24) AS excerpt
      FROM node_search JOIN nodes n ON n.rowid = node_search.rowid
      WHERE node_search MATCH ? AND n.kind <> 'directory' ORDER BY score, n.id LIMIT ?`).all(match, limit)
      .map(row => ({ node: nodeFrom(row), score: Number(row.score), excerpt: row.excerpt as string }));
  }
  private edgeFrom(row: Row): GraphEdge {
    return { id: row.id as string, source: row.source as string, target: row.target as string,
      relation: row.relation as string, origin: row.origin as Origin, weight: Number(row.weight), confidence: row.confidence === null ? null : Number(row.confidence),
      contexts: this.db.prepare('SELECT context FROM edge_contexts WHERE edge_id = ? ORDER BY context').all(row.id as string).map(r => r.context as string) };
  }
  private evidenceFor(edgeId: string): Citation[] {
    return this.db.prepare('SELECT * FROM evidence WHERE edge_id = ? ORDER BY source_path, source_line, id').all(edgeId).map(row => {
      const file = row.source_path as string;
      const fragment = row.source_fragment as string | null;
      return { id: row.id as string, edgeId, sourcePath: file, sourceFragment: fragment, sourceLine: row.source_line as number | null, sourceColumn: row.source_column as number | null,
        targetFragment: row.target_fragment as string | null, kind: row.kind as Evidence['kind'], detail: row.detail as string | null,
        sourceUrl: rawUrl(file) + (fragment ? '#' + encodeURIComponent(fragment) : ''), pageUrl: urlFor(file) + (fragment ? '#' + encodeURIComponent(fragment) : '') };
    });
  }
  neighbors(id: string, options: Filters & { limit?: number } = {}): { items: Neighbor[]; truncated: boolean } {
    this.requireNode(id);
    validateFilters(options);
    const direction = options.direction ?? 'out';
    if (!['out', 'in', 'both'].includes(direction)) throw new Error('direction must be out, in or both');
    const limit = bounded(options.limit, 100, 5000, 'limit');
    const conditions = [direction === 'both' ? '(e.source = ? OR e.target = ?)' : direction === 'out' ? "(e.source = ? OR (r.family = 'near' AND e.target = ?))" : "(e.target = ? OR (r.family = 'near' AND e.source = ?))"];
    const bindings: Binding[] = [id, id];
    for (const [field, value] of [['r.family', normalizeFamily(options.family)], ['e.relation', options.relation], ['e.origin', options.origin]] as const) {
      if (value !== undefined) { conditions.push(`${field} = ?`); bindings.push(value); }
    }
    if (options.context !== undefined) { conditions.push('EXISTS(SELECT 1 FROM edge_contexts c WHERE c.edge_id=e.id AND c.context=?)'); bindings.push(options.context); }
    const rows = this.db.prepare(`SELECT e.*, r.name, r.inverse, r.st_type, r.family FROM edges e JOIN relations r ON r.id=e.relation
      WHERE ${conditions.join(' AND ')} ORDER BY e.source, e.target, e.relation, e.id LIMIT ?`).all(...bindings, limit + 1);
    return { truncated: rows.length > limit, items: rows.slice(0, limit).map(row => {
      const outgoing = row.source === id && (direction !== 'in' || row.family === 'near');
      return { edge: this.edgeFrom(row), node: this.requireNode((outgoing ? row.target : row.source) as string), direction: outgoing ? 'out' : 'in',
        label: (outgoing ? row.name : row.inverse) as string, stType: row.st_type === null ? null : Number(row.st_type) === 0 ? 0 : (outgoing ? 1 : -1) * Number(row.st_type), evidence: this.evidenceFor(row.id as string) };
    }) };
  }
  integrity() {
    const integrity = this.db.prepare('PRAGMA integrity_check').all();
    const foreignKeys = this.db.prepare('PRAGMA foreign_key_check').all();
    return { ok: integrity.every(row => row.integrity_check === 'ok') && !foreignKeys.length, integrity, foreignKeys };
  }
  export() {
    return {
      format: 'okf-sqlite-graph', schemaVersion: SCHEMA_VERSION,
      metadata: Object.fromEntries(this.db.prepare('SELECT * FROM graph_meta ORDER BY key').all().map(row => [row.key, row.value])),
      sources: this.db.prepare('SELECT * FROM sources ORDER BY path').all(),
      nodes: this.db.prepare('SELECT * FROM nodes ORDER BY id').all().map(nodeFrom),
      relations: this.db.prepare('SELECT * FROM relations ORDER BY id').all(),
      edges: this.db.prepare('SELECT * FROM edges ORDER BY id').all().map(row => ({ ...this.edgeFrom(row), evidence: this.evidenceFor(row.id as string) })),
      diagnostics: this.db.prepare('SELECT message FROM diagnostics ORDER BY message').all().map(row => row.message as string),
    };
  }
}
