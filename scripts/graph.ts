#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { KnowledgeGraph } from '../backend/graph/memory.ts';
import { publishIndex } from '../backend/graph/publish.ts';
import { atomicWrite, assertOutside, physicalPath } from '../backend/graph/files.ts';
import type { Filters } from '../backend/graph/query-core.ts';
import type { SqliteKnowledgeIndex } from '../backend/graph/query.ts';

const usage = `Usage: npm run graph -- <command> [arguments] [options]
Commands:
  build                    Publish JSON, derived SQLite and OKF navigation guide
  info                     Show versions, counts, runtime and integrity
  get <concept-id>          Look up a node and its canonical source
  search <text>            Search document titles/descriptions/bodies
  neighbors <concept-id>   Return adjacent nodes and evidence
  traverse <concept-id>    Bounded breadth-first graph walk
  path <from-id> <to-id>    Find a shortest path within filters and limits
  export                   Export deterministic JSON
Options:
  --root <directory>       Canonical OKF bundle (default knowledge)
  --json <file>            Query a published JSON snapshot instead
  --db <file>              Explicitly build/query a SQLite WASM snapshot
  --sqlite                 Publish SQLite (default; build only)
  --no-sqlite              Publish OKF/JSON only, without loading WASM (build only)
  --public-dir <directory> Publication destination (build only)
  --output <file>          JSON destination (export only; otherwise stdout)
  --direction out|in|both --family reference|similar|near|leads_to|contains|expresses
  --relation <id> --context <name> --origin structural|explicit|inferred
  --limit <n> --depth <n> --max-nodes <n> --max-edges <n>
Default queries require no SQL engine. Builds also derive SQLite unless --no-sqlite.
`;
try {
  const names = ['root', 'json', 'db', 'public-dir', 'output', 'direction', 'family', 'relation', 'context', 'origin', 'limit', 'depth', 'max-nodes', 'max-edges'];
  const { values, positionals } = parseArgs({ options: { ...Object.fromEntries(names.map(name => [name, { type: 'string' as const }])), sqlite: { type: 'boolean' }, 'no-sqlite': { type: 'boolean' }, help: { type: 'boolean' } }, allowPositionals: true, strict: true });
  if (values.help || !positionals.length) console.log(usage);
  else {
    const [command, ...args] = positionals;
    const expected: Record<string, number> = { build: 0, info: 0, get: 1, search: 1, neighbors: 1, traverse: 1, path: 2, export: 0 };
    if (!Object.hasOwn(expected, command!)) throw new Error(`Unknown command ${command}`);
    if (command === 'search' && args.length > 1) args.splice(0, args.length, args.join(' '));
    if (args.length !== expected[command!]) throw new Error(`${command} expects ${expected[command!]} argument(s)`);
    const flags = values as Record<string, string | boolean | undefined>;
    const string = (key: string): string | undefined => typeof flags[key] === 'string' ? flags[key] : undefined;
    const integer = (key: string) => { const value = string(key); if (value === undefined) return undefined; if (!/^\d+$/.test(value)) throw new Error(`${key} must be an integer`); return Number(value); };
    if (values.sqlite && values['no-sqlite']) throw new Error('Choose --sqlite or --no-sqlite');
    const root = string('root') ?? 'knowledge';
    const database = string('db'), jsonFile = string('json');
    if (database && jsonFile) throw new Error('Choose --db or --json');
    if (command !== 'build' && (values.sqlite || values['no-sqlite'] || string('public-dir'))) throw new Error('--sqlite/--public-dir are build-only options');
    if (command === 'build' && jsonFile) throw new Error('--json selects input for queries, not build');
    if (database && (values.sqlite || values['no-sqlite'] || string('public-dir'))) throw new Error('--db selects a single database; omit it for publication');
    if (string('root') && (jsonFile || database && command !== 'build')) throw new Error('--root cannot be combined with snapshot queries');
    if (string('output') && command !== 'export') throw new Error('--output is only supported by export');
    let index: KnowledgeGraph | SqliteKnowledgeIndex;
    if (command === 'build' && !database) {
      const result = await publishIndex({ root, publicDir: string('public-dir'), sqlite: values.sqlite === true || !values['no-sqlite'] && process.env.OKF_SQLITE !== '0' });
      index = KnowledgeGraph.fromJSON(result.graph);
    } else if (database) {
      if (command === 'build') {
        const { compileIndex } = await import('../backend/graph/compiler.ts');
        await compileIndex({ root, database });
      }
      const { SqliteKnowledgeIndex } = await import('../backend/graph/query.ts');
      index = await SqliteKnowledgeIndex.open(database);
    } else if (jsonFile) index = KnowledgeGraph.fromJSON(JSON.parse(await readFile(jsonFile, 'utf8')));
    else index = await KnowledgeGraph.open(root);
    try {
      const filters: Filters = { direction: string('direction') as Filters['direction'], family: string('family') as Filters['family'], relation: string('relation'), context: string('context'), origin: string('origin') as Filters['origin'] };
      const walk = { ...filters, maxDepth: integer('depth'), maxNodes: integer('max-nodes'), maxEdges: integer('max-edges') };
      let result: unknown;
      switch (command) {
        case 'build': case 'info': {
          const exported = index.export();
          result = { source: database ?? jsonFile ?? root, runtime: index.runtime, metadata: exported.metadata, counts: { nodes: exported.nodes.length, edges: exported.edges.length, sources: exported.sources.length }, diagnostics: exported.diagnostics, integrity: index.integrity() };
          break;
        }
        case 'get': result = index.getNode(args[0]!); if (!result) throw new Error(`Unknown node: ${args[0]}`); break;
        case 'search': result = index.search(args[0]!, { limit: integer('limit') }); break;
        case 'neighbors': result = index.neighbors(args[0]!, { ...filters, limit: integer('limit') }); break;
        case 'traverse': result = index.traverse(args[0]!, walk); break;
        case 'path': result = index.path(args[0]!, args[1]!, walk); break;
        case 'export': result = index.export(); break;
      }
      const json = JSON.stringify(result, null, 2) + '\n';
      const output = string('output');
      if (output) {
        const input = database ?? jsonFile;
        if (input && await physicalPath(output) === await physicalPath(input)) throw new Error('JSON output cannot overwrite the input snapshot');
        await assertOutside(root, output);
        await atomicWrite(output, json);
      } else process.stdout.write(json);
    } finally { index.close(); }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
