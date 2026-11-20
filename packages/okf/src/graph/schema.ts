import type { WasmDatabase } from './wasm.ts';
export const SCHEMA_VERSION = 3;
export const APPLICATION_ID = 0x4f4b4647;
const migrations = [
  `CREATE TABLE sources (path TEXT PRIMARY KEY, hash TEXT NOT NULL) STRICT;
   CREATE TABLE nodes (
     id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('concept','index','log','directory')),
     title TEXT NOT NULL, description TEXT NOT NULL, type TEXT, body TEXT NOT NULL,
     metadata TEXT NOT NULL CHECK(json_valid(metadata)), source_path TEXT REFERENCES sources(path),
     CHECK((kind = 'directory' AND source_path IS NULL) OR (kind <> 'directory' AND source_path IS NOT NULL))
   ) STRICT;
   CREATE INDEX nodes_source ON nodes(source_path);
   CREATE TABLE relations (id TEXT PRIMARY KEY, name TEXT NOT NULL, inverse TEXT NOT NULL,
     family TEXT NOT NULL CHECK(family IN ('reference','near','leads_to','contains','expresses')),
     st_type INTEGER CHECK(st_type BETWEEN 0 AND 3),
     CHECK((family='reference' AND st_type IS NULL) OR (family='near' AND st_type=0) OR
       (family='leads_to' AND st_type=1) OR (family='contains' AND st_type=2) OR (family='expresses' AND st_type=3))
   ) STRICT;
   CREATE TABLE edges (id TEXT PRIMARY KEY, source TEXT NOT NULL REFERENCES nodes(id),
     target TEXT NOT NULL REFERENCES nodes(id), relation TEXT NOT NULL REFERENCES relations(id),
     origin TEXT NOT NULL CHECK(origin IN ('structural','explicit','inferred')),
     weight REAL NOT NULL CHECK(weight >= 0), confidence REAL CHECK(confidence BETWEEN 0 AND 1),
     CHECK(origin <> 'inferred' OR confidence IS NOT NULL)
   ) STRICT;
   CREATE INDEX edges_outgoing ON edges(source, relation, origin, id);
   CREATE INDEX edges_incoming ON edges(target, relation, origin, id);
   CREATE TABLE evidence (id TEXT PRIMARY KEY, edge_id TEXT NOT NULL REFERENCES edges(id) ON DELETE CASCADE,
     source_path TEXT NOT NULL REFERENCES sources(path), source_fragment TEXT, source_line INTEGER CHECK(source_line > 0), source_column INTEGER CHECK(source_column > 0),
     target_fragment TEXT, kind TEXT NOT NULL CHECK(kind IN ('markdown_link','directory_membership','graph_relation')), detail TEXT
   ) STRICT;
   CREATE INDEX evidence_edge ON evidence(edge_id, source_path, source_line);
   CREATE TABLE contexts (name TEXT PRIMARY KEY) STRICT;
   CREATE TABLE edge_contexts (edge_id TEXT NOT NULL REFERENCES edges(id) ON DELETE CASCADE,
     context TEXT NOT NULL REFERENCES contexts(name), PRIMARY KEY(edge_id, context)) STRICT;
   CREATE INDEX contexts_edges ON edge_contexts(context, edge_id);
   CREATE TABLE graph_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
   CREATE TABLE diagnostics (message TEXT PRIMARY KEY) STRICT;
   CREATE TABLE migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT;`,
  `CREATE VIRTUAL TABLE node_search USING fts5(title, description, body, content='nodes', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
   CREATE TRIGGER nodes_insert AFTER INSERT ON nodes BEGIN
     INSERT INTO node_search(rowid, title, description, body) VALUES(new.rowid, new.title, new.description, new.body); END;
   CREATE TRIGGER nodes_delete AFTER DELETE ON nodes BEGIN
     INSERT INTO node_search(node_search, rowid, title, description, body) VALUES('delete', old.rowid, old.title, old.description, old.body); END;
   CREATE TRIGGER nodes_update AFTER UPDATE ON nodes BEGIN
     INSERT INTO node_search(node_search, rowid, title, description, body) VALUES('delete', old.rowid, old.title, old.description, old.body);
     INSERT INTO node_search(rowid, title, description, body) VALUES(new.rowid, new.title, new.description, new.body); END;
   INSERT INTO node_search(node_search) VALUES('rebuild');`,
  `CREATE TABLE evidence_v3 (id TEXT PRIMARY KEY, edge_id TEXT NOT NULL REFERENCES edges(id) ON DELETE CASCADE,
     source_path TEXT NOT NULL REFERENCES sources(path), source_fragment TEXT, source_line INTEGER CHECK(source_line > 0), source_column INTEGER CHECK(source_column > 0),
     target_fragment TEXT, kind TEXT NOT NULL CHECK(kind IN ('markdown_link','directory_membership','graph_relation','metadata_path')), detail TEXT
   ) STRICT;
   INSERT INTO evidence_v3 SELECT * FROM evidence;
   DROP TABLE evidence;
   ALTER TABLE evidence_v3 RENAME TO evidence;
   CREATE INDEX evidence_edge ON evidence(edge_id, source_path, source_line);`,
];

export function assertSchema(db: WasmDatabase): void {
  if (db.prepare('PRAGMA application_id').get()!.application_id !== APPLICATION_ID) throw new Error('Not an OKF graph index');
  const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
  if (version !== SCHEMA_VERSION) throw new Error(`Unsupported graph schema ${version}; rebuild with this compiler (schema ${SCHEMA_VERSION})`);
}
export function migrate(db: WasmDatabase, target = SCHEMA_VERSION): void {
  const version = Number(db.prepare('PRAGMA user_version').get()!.user_version);
  const application = Number(db.prepare('PRAGMA application_id').get()!.application_id);
  if (version > SCHEMA_VERSION) throw new Error('Database schema is newer than this compiler');
  if (target < version || target > SCHEMA_VERSION || target < 1) throw new Error('Invalid migration target');
  if (application !== APPLICATION_ID && (application !== 0 || db.prepare("SELECT name FROM sqlite_master WHERE type='table'").get())) throw new Error('Refusing to overwrite a non-OKF database');
  db.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE');
  try {
    for (let next = version + 1; next <= target; next++) {
      db.exec(migrations[next - 1]!);
      db.prepare('INSERT INTO migrations VALUES (?, ?)').run(next, next === 1 ? 'normalized_graph' : next === 2 ? 'full_text_search' : 'okf_metadata_paths');
      db.exec(`PRAGMA user_version = ${next}`);
    }
    db.exec(`PRAGMA application_id = ${APPLICATION_ID}; COMMIT`);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
