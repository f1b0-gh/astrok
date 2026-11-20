import { readFile } from 'node:fs/promises';
import { atomicWrite, assertOutside } from './files.ts';
export { atomicWrite } from './files.ts';
import { graphMetadata } from './metadata.ts';
export { COMPILER_VERSION } from './metadata.ts';
import { readBundle } from '../okf/bundle.mjs';
import { WasmDatabase } from './wasm.ts';
import { projectGraph } from './project.ts';
import { migrate, SCHEMA_VERSION } from './schema.ts';
import type { Bundle, Graph } from './model.ts';

export function storeGraph(db: WasmDatabase, graph: Graph): void {
  migrate(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM edge_contexts; DELETE FROM evidence; DELETE FROM edges; DELETE FROM contexts; DELETE FROM relations; DELETE FROM nodes; DELETE FROM sources; DELETE FROM diagnostics; DELETE FROM graph_meta;');
    const source = db.prepare('INSERT INTO sources VALUES (?, ?)');
    for (const item of graph.sources) source.run(item.path, item.hash);
    const node = db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const item of graph.nodes) node.run(item.id, item.kind, item.title, item.description, item.type, item.body, JSON.stringify(item.metadata), item.sourcePath);
    const relation = db.prepare('INSERT INTO relations VALUES (?, ?, ?, ?, ?)');
    for (const item of graph.relations) relation.run(item.id, item.name, item.inverse, item.family, item.stType);
    const edge = db.prepare('INSERT INTO edges VALUES (?, ?, ?, ?, ?, ?, ?)');
    const context = db.prepare('INSERT OR IGNORE INTO contexts VALUES (?)');
    const edgeContext = db.prepare('INSERT INTO edge_contexts VALUES (?, ?)');
    for (const item of graph.edges) {
      edge.run(item.id, item.source, item.target, item.relation, item.origin, item.weight, item.confidence);
      for (const value of item.contexts) { context.run(value); edgeContext.run(item.id, value); }
    }
    const evidence = db.prepare('INSERT INTO evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const item of graph.evidence) evidence.run(item.id, item.edgeId, item.sourcePath, item.sourceFragment, item.sourceLine, item.sourceColumn, item.targetFragment, item.kind, item.detail);
    for (const message of graph.diagnostics) db.prepare('INSERT INTO diagnostics VALUES (?)').run(message);
    for (const [key, value] of Object.entries({ ...graphMetadata(graph), schema_version: String(SCHEMA_VERSION), runtime: 'sqlite-wasm' })) db.prepare('INSERT INTO graph_meta VALUES (?, ?)').run(key, value);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Graph foreign key validation failed');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export async function compileIndex({ root = 'knowledge', database = '.generated/public/graph/knowledge.sqlite' } = {}): Promise<{ graph: Graph; database: string }> {
  await assertOutside(root, database);
  const graph = projectGraph(await readBundle(root) as Bundle);
  const previous = await readFile(database).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined; });
  await atomicWrite(database, await serializeGraph(graph, previous));
  return { graph, database };
}

/** Materialize an already projected graph; never reread canonical documents. */
export async function serializeGraph(graph: Graph, previous?: Uint8Array): Promise<Uint8Array> {
  const db = await WasmDatabase.open(previous);
  try {
    storeGraph(db, graph);
    return db.serialize();
  } finally { db.close(); }
}
