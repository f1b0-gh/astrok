declare const WebAssembly: { Memory: abstract new (...args: never[]) => object };

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Database, Sqlite3Static, SqlValue } from '@sqlite.org/sqlite-wasm';

let engine: Promise<Sqlite3Static> | undefined;
export type Row = Record<string, SqlValue>;
export type Binding = string | number | null;

/** SQLite executes exclusively in WebAssembly. Filesystem persistence is outside this adapter. */
export class WasmDatabase {
  private database: Database;
  private sqlite: Sqlite3Static;
  private constructor(sqlite: Sqlite3Static, database: Database) { this.sqlite = sqlite; this.database = database; }
  static async open(bytes?: Uint8Array): Promise<WasmDatabase> {
    const sqlite = await (engine ??= sqlite3InitModule());
    const db = new sqlite.oo1.DB(':memory:');
    try {
      if (bytes) {
        if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') throw new Error('Not a SQLite database snapshot');
        // Node's Buffer subclasses Uint8Array, but the WASM helper dispatches on
        // the constructor; normalize filesystem buffers to a plain typed array.
        const ptr = sqlite.wasm.allocFromTypedArray(new Uint8Array(bytes));
        const result = sqlite.capi.sqlite3_deserialize(db.pointer!, 'main', ptr, bytes.length, bytes.length,
          sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE);
        // With FREEONCLOSE, SQLite also releases the buffer on deserialize failure.
        if (result !== 0) throw new Error(`SQLite WASM deserialize failed (${result})`);
      }
      db.exec('PRAGMA foreign_keys = ON');
      return new WasmDatabase(sqlite, db);
    } catch (error) { db.close(); throw error; }
  }
  exec(sql: string): void { this.database.exec(sql); }
  prepare(sql: string) {
    return {
      all: (...bind: Binding[]): Row[] => this.database.selectObjects(sql, bind),
      get: (...bind: Binding[]): Row | undefined => this.database.selectObjects(sql, bind)[0],
      run: (...bind: Binding[]): void => { this.database.exec({ sql, bind }); },
    };
  }
  serialize(): Uint8Array { return this.sqlite.capi.sqlite3_js_db_export(this.database.pointer!); }
  get runtime() { return { engine: 'sqlite-wasm', version: this.sqlite.version.libVersion, wasm: 'memory' in this.sqlite.wasm && this.sqlite.wasm.memory instanceof WebAssembly.Memory }; }
  close(): void { this.database.close(); }
}
