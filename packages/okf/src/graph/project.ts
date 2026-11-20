import { createHash } from 'node:crypto';
import path from 'node:path';
import { metadataPaths } from '../okf/metadata.mjs';
import { resolvePathField, resolveLink } from '../okf/links.mjs';
import type { Bundle, Evidence, Graph, GraphEdge, GraphNode, Origin, Relation, Family } from './model.ts';
import { ST_TYPES, GRAPH_MODEL, semanticIdentity } from './model.ts';

export const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const directoryId = (dir: string) => '@directory/' + (dir === '.' ? '' : dir + '/');
const sorted = <T extends { id: string }>(values: Iterable<T>): T[] => [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function projectGraph(bundle: Bundle): Graph {
  if (bundle.errors.length) throw new Error(bundle.errors.join('\n'));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const evidence = new Map<string, Evidence>();
  const relations = new Map<string, Relation>([
    ['structural:references', { id: 'structural:references', name: 'references', inverse: 'referenced_by', family: 'reference', stType: null }],
    ['structural:contains', { id: 'structural:contains', name: 'contains', inverse: 'part_of', family: 'contains', stType: 2 }],
  ]);
  const diagnostics = [...bundle.warnings];
  const byPath = new Map(bundle.documents.map(document => [document.path, document]));
  const addEdge = (input: Omit<GraphEdge, 'id'>, proof: Omit<Evidence, 'id' | 'edgeId'>) => {
    const id = hash(JSON.stringify(input));
    edges.set(id, { id, ...input });
    const evidenceId = hash(JSON.stringify([id, proof]));
    evidence.set(evidenceId, { id: evidenceId, edgeId: id, ...proof });
  };
  const structural = (source: string, target: string, relation: string) => ({ source, target, relation, origin: 'structural' as const, weight: 1, confidence: null, contexts: [] });
  function addDirectory(dir: string) {
    const id = directoryId(dir);
    if (!nodes.has(id)) nodes.set(id, { id, graphModel: null, graphKind: null, kind: 'directory', title: dir === '.' ? 'Knowledge bundle' : path.posix.basename(dir), description: '', type: null, body: '', metadata: {}, sourcePath: null });
  }
  addDirectory('.');
  for (const document of bundle.documents) {
    const model = document.metadata.graph_model;
    if (model !== undefined && (typeof model !== 'string' || !model.trim())) throw new Error(`${document.path}: graph_model must be a non-empty string`);
    if (model === undefined && document.metadata.graph_kind !== undefined) throw new Error(`${document.path}: graph_kind requires graph_model`);
    if (model === GRAPH_MODEL && document.kind === 'concept' && !semanticIdentity(document.metadata).graphKind) throw new Error(`${document.path}: graph_kind must be event, thing, or concept for ${GRAPH_MODEL}`);
    if (model !== undefined && model !== GRAPH_MODEL) diagnostics.push(`${document.path}: unsupported graph_model ${model}; semantic extension preserved without interpretation`);
    nodes.set(document.id, { ...semanticIdentity(document.metadata), id: document.id, kind: document.kind, title: document.title, description: document.description, type: document.type, metadata: document.metadata, body: document.body, sourcePath: document.path });
  }
  for (const document of bundle.documents) {
    const proof = { sourcePath: document.path, sourceFragment: null, sourceLine: null, sourceColumn: null, targetFragment: null, kind: 'directory_membership' as const, detail: 'Canonical source path hierarchy' };
    let dir = path.posix.dirname(document.path);
    addDirectory(dir);
    addEdge(structural(directoryId(dir), document.id, 'structural:contains'), proof);
    while (dir !== '.') {
      const parent = path.posix.dirname(dir);
      addDirectory(parent);
      addEdge(structural(directoryId(parent), directoryId(dir), 'structural:contains'), proof);
      dir = parent;
    }
    for (const link of document.links) {
      if (!link.target || !nodes.has(link.target)) continue;
      addEdge(structural(document.id, link.target, 'structural:references'), { sourcePath: document.path,
        sourceFragment: link.sourceFragment ?? null, sourceLine: link.line ?? null, sourceColumn: link.column ?? null, targetFragment: link.fragment ?? null, kind: 'markdown_link', detail: null });
    }
    if (document.kind === 'concept') for (const { field, href } of metadataPaths(document.metadata)) {
      const resolved = resolvePathField(href, document.path, byPath, bundle.assets, byPath.get('index.md')?.metadata.okf_version);
      if (resolved.warning) diagnostics.push(`${document.path}: ${field}: ${resolved.warning}`);
      // Indexes, logs and assets are navigable, but are not concept targets.
      if (!resolved.target || nodes.get(resolved.target)?.kind !== 'concept') continue;
      addEdge(structural(document.id, resolved.target, 'structural:references'), {
        sourcePath: document.path, sourceFragment: null, sourceLine: null, sourceColumn: null,
        targetFragment: resolved.fragment ?? null, kind: 'metadata_path', detail: field });
    }
    if (document.metadata.graph_model !== undefined && document.metadata.graph_model !== GRAPH_MODEL) continue;
    const extensions = document.metadata.graph_relations;
    if (extensions === undefined) continue;
    const fail = (message: string): never => { throw new Error(`${document.path}: graph_relations ${message}`); };
    if (!Array.isArray(extensions)) fail('must be a list');
    for (const [position, raw] of (extensions as unknown[]).entries()) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`[${position}] must be a mapping`);
      const relation = raw as Record<string, unknown>;
      const text = (name: string) => typeof relation[name] === 'string' && (relation[name] as string).trim() ? relation[name] as string : fail(`[${position}].${name} must be a non-empty string`);
      const targetHref = text('target');
      const name = text('relation');
      const inputFamily = text('family');
      const family = (inputFamily === 'similar' ? 'near' : inputFamily) as Family;
      if (!Object.hasOwn(ST_TYPES, family) || family === 'reference') fail(`[${position}].family must be similar (or near), leads_to, contains, or expresses`);
      const inverse = relation.inverse === undefined ? (family === 'near' ? name : `inverse:${name}`) : text('inverse');
      if (family === 'near' && inverse !== name) fail('similarity must use the same relation name in both directions');
      const origin: Origin = relation.origin === undefined ? 'explicit' : relation.origin === 'explicit' || relation.origin === 'inferred' ? relation.origin : fail('origin must be explicit or inferred');
      const confidence = relation.confidence === undefined ? null : relation.confidence;
      if (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) fail('confidence must be a number between 0 and 1');
      if (origin === 'inferred' && (confidence === null || !relation.evidence)) fail('inferred relations require confidence and evidence');
      const detail = relation.evidence === undefined ? `graph_relations[${position}]` : text('evidence');
      const weight = relation.weight === undefined ? 1 : relation.weight;
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) fail('weight must be a finite non-negative number');
      const contextsValue = relation.contexts ?? [];
      if (!Array.isArray(contextsValue) || !contextsValue.every(value => typeof value === 'string' && value.trim())) fail('contexts must be a list of non-empty strings');
      const contexts = [...new Set(contextsValue as string[])].sort();
      const resolved = resolveLink(targetHref, document.path, byPath, bundle.assets);
      if (resolved.external || !resolved.targetPath || !resolved.targetPath.endsWith('.md')) fail('target must be a Markdown path inside the bundle');
      const id = `semantic:${name}`;
      const definition: Relation = { id, name, inverse, family, stType: ST_TYPES[family] };
      if (relations.has(id) && JSON.stringify(relations.get(id)) !== JSON.stringify(definition)) fail(`conflicting definitions for relation ${name}`);
      relations.set(id, definition);
      if (resolved.warning) diagnostics.push(`${document.path}: graph_relations[${position}]: ${resolved.warning}`);
      if (!('target' in resolved) || !resolved.target) continue;
      addEdge({ source: document.id, target: resolved.target, relation: id, origin, contexts, weight: weight as number, confidence: confidence as number | null },
        { sourcePath: document.path, sourceFragment: null, sourceLine: null, sourceColumn: null, targetFragment: resolved.fragment ?? null, kind: 'graph_relation', detail });
    }
  }
  return { sources: bundle.documents.map(d => ({ path: d.path, hash: hash(d.source) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    nodes: sorted(nodes.values()), relations: sorted(relations.values()), edges: sorted(edges.values()), evidence: [...evidence.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath, 'en') || (a.sourceLine ?? 0) - (b.sourceLine ?? 0) || a.id.localeCompare(b.id, 'en')), diagnostics: [...new Set(diagnostics)].sort() };
}
