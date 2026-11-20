import type { Graph } from './model.ts';
import { semanticIdentity } from './model.ts';
export const JSON_SCHEMA_VERSION = 2;
export interface GraphSnapshot extends Graph {
  format: 'okf-graph'; schemaVersion: number; metadata: Record<string, string>;
}

/** Validate downloaded snapshots before traversal; preserve opaque OKF metadata. */
export function readSnapshot(input: unknown): GraphSnapshot {
  const fail = (message: string): never => { throw new Error(`Invalid graph JSON: ${message}`); };
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected object');
    return value as Record<string, unknown>;
  };
  const string = (value: unknown): value is string => typeof value === 'string';
  const nullableString = (value: unknown) => value === null || string(value);
  const list = (value: unknown): unknown[] => Array.isArray(value) ? value : fail('expected array');
  const unique = (items: unknown[], key: string): Map<string, Record<string, unknown>> => {
    const map = new Map<string, Record<string, unknown>>();
    for (const value of items) {
      const item = object(value), id = item[key];
      if (!string(id) || !id || map.has(id)) fail(`missing or duplicate ${key}`);
      map.set(id as string, item);
    }
    return map;
  };
  const data = object(input);
  if (data.format !== 'okf-graph' || ![1, JSON_SCHEMA_VERSION].includes(data.schemaVersion as number)) fail('unsupported format or schema version');
  if (!Object.values(object(data.metadata)).every(string)) fail('metadata must contain strings');
  const sources = unique(list(data.sources), 'path');
  for (const source of sources.values()) if (!string(source.hash)) fail('source hash');
  const nodes = unique(list(data.nodes), 'id');
  for (const node of nodes.values()) {
    if (!['concept', 'index', 'log', 'directory'].includes(node.kind as string) || !['title', 'description', 'body'].every(k => string(node[k])) || !nullableString(node.type)) fail('node fields');
    for (const key of ['url', 'sourceUrl']) if (node[key] !== undefined) {
      const route = node[key];
      if (!nullableString(route) || (typeof route === 'string' && (!route.startsWith('/') || route.startsWith('//') || /[\\\x00-\x20]/.test(route)))) fail('node publication URL');
    }
    const metadata = object(node.metadata), identity = semanticIdentity(metadata);
    if (node.graphModel !== identity.graphModel || node.graphKind !== identity.graphKind) fail('node semantic identity disagrees with metadata');
    if (node.kind === 'directory' ? node.sourcePath !== null : !sources.has(node.sourcePath as string)) fail('node source');
  }
  const relations = unique(list(data.relations), 'id');
  const types: Record<string, number | null> = { reference: null, near: 0, leads_to: 1, contains: 2, expresses: 3 };
  for (const relation of relations.values()) {
    if (!string(relation.name) || !string(relation.inverse) || !Object.hasOwn(types, relation.family as string) || relation.stType !== types[relation.family as string]) fail('relation fields');
    if (relation.family === 'near' && relation.inverse !== relation.name) fail('asymmetric similarity');
  }
  const edges = unique(list(data.edges), 'id');
  for (const edge of edges.values()) {
    if (!nodes.has(edge.source as string) || !nodes.has(edge.target as string) || !relations.has(edge.relation as string)) fail('dangling edge source, target or relation');
    if (!['structural', 'explicit', 'inferred'].includes(edge.origin as string)) fail('edge origin');
    if (typeof edge.weight !== 'number' || !Number.isFinite(edge.weight) || edge.weight < 0) fail('edge weight');
    if (edge.confidence !== null && (typeof edge.confidence !== 'number' || !Number.isFinite(edge.confidence) || edge.confidence < 0 || edge.confidence > 1)) fail('edge confidence');
    if (edge.origin === 'inferred' && edge.confidence === null) fail('inferred edge confidence');
    if (!list(edge.contexts).every(v => string(v) && v.length)) fail('edge contexts');
  }
  const evidence = unique(list(data.evidence), 'id');
  const supported = new Set<string>();
  for (const item of evidence.values()) {
    if (!edges.has(item.edgeId as string) || !sources.has(item.sourcePath as string)) fail('dangling evidence');
    if (!['markdown_link', 'directory_membership', 'graph_relation', 'metadata_path'].includes(item.kind as string)) fail('evidence kind');
    if (!['sourceFragment', 'targetFragment', 'detail'].every(k => nullableString(item[k]))) fail('evidence fields');
    if (!['sourceLine', 'sourceColumn'].every(k => item[k] === null || (Number.isInteger(item[k]) && Number(item[k]) > 0))) fail('evidence position');
    if (edges.get(item.edgeId as string)!.origin === 'inferred' && (typeof item.detail !== 'string' || !item.detail.trim())) fail('inferred evidence');
    supported.add(item.edgeId as string);
  }
  if ([...edges.keys()].some(id => !supported.has(id))) fail('edge has no evidence');
  if (!list(data.diagnostics).every(string)) fail('diagnostics');
  return structuredClone(data) as unknown as GraphSnapshot;
}
