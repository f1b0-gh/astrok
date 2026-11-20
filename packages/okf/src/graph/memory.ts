import type { Bundle, Graph, GraphEdge, GraphNode, Evidence, Relation } from './model.ts';
import { GraphQueries, bounded, indexedNode, citation, searchTerms, normalizeFamily, validateFilters } from './query-core.ts';
import type { Filters, Neighbor } from './query-core.ts';
import { readSnapshot, JSON_SCHEMA_VERSION } from './snapshot.ts';
import type { GraphSnapshot } from './snapshot.ts';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const compareEdges = (a: GraphEdge, b: GraphEdge) => {
  for (const key of ['source', 'target', 'relation', 'id'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
};

/** SQL-free graph queries; only open/fromBundle dynamically load Node build tools. */
export class KnowledgeGraph extends GraphQueries {
  private graph: GraphSnapshot;
  private nodes: Map<string, GraphNode>;
  private sourceNodes: Map<string, GraphNode>;
  private relations: Map<string, Relation>;
  private adjacent = new Map<string, GraphEdge[]>();
  private evidence = new Map<string, Evidence[]>();
  private constructor(snapshot: GraphSnapshot) {
    super();
    this.graph = snapshot;
    this.nodes = new Map(snapshot.nodes.map(n => [n.id, n]));
    this.sourceNodes = new Map(snapshot.nodes.flatMap(node => node.sourcePath === null ? [] : [[node.sourcePath, node] as const]));
    this.relations = new Map(snapshot.relations.map(r => [r.id, r]));
    for (const edge of [...snapshot.edges].sort(compareEdges)) {
      for (const id of new Set([edge.source, edge.target])) {
        const values = this.adjacent.get(id) ?? [];
        values.push(edge); this.adjacent.set(id, values);
      }
    }
    for (const item of [...snapshot.evidence].sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : (a.sourceLine ?? 0) - (b.sourceLine ?? 0) || (a.id < b.id ? -1 : 1))) {
      const values = this.evidence.get(item.edgeId) ?? [];
      values.push(item); this.evidence.set(item.edgeId, values);
    }
  }
  static fromGraph(graph: Graph, metadata: Record<string, string> = {}): KnowledgeGraph {
    return this.fromJSON({ ...graph, format: 'okf-graph', schemaVersion: JSON_SCHEMA_VERSION, metadata });
  }
  static fromJSON(value: unknown): KnowledgeGraph { return new KnowledgeGraph(readSnapshot(value)); }
  static async fromBundle(bundle: Bundle): Promise<KnowledgeGraph> {
    const { projectGraph } = await import('./project.ts');
    const { graphMetadata } = await import('./metadata.ts');
    const graph = projectGraph(bundle);
    return this.fromGraph(graph, graphMetadata(graph));
  }
  static async open(root = 'knowledge'): Promise<KnowledgeGraph> {
    const { readBundle } = await import('../okf/bundle.mjs');
    return this.fromBundle(await readBundle(root) as Bundle);
  }
  get runtime() { return { engine: 'okf-memory', wasm: false }; }
  close(): void { /* No external resources; same lifecycle as the optional SQL adapter. */ }
  getNode(id: string) {
    const node = this.nodes.get(id);
    return node ? indexedNode(structuredClone(node)) : null;
  }
  search(text: string, { limit = 20 }: { limit?: number } = {}) {
    bounded(limit, 20, 100, 'limit');
    const terms = searchTerms(text).map(normalize);
    if (!terms.length) return [];
    const matches = [];
    for (const node of this.nodes.values()) {
      if (node.kind === 'directory') continue;
      const fields = [node.title, node.description, node.body].map((value): string[] => normalize(value).match(/[\p{L}\p{N}]+/gu) ?? []);
      if (!terms.every(term => fields.some(words => words.includes(term)))) continue;
      const score = -terms.reduce((sum, term) => sum + fields.reduce((n, words, i) => n + words.filter(word => word === term).length * [5, 2, 1][i]!, 0), 0);
      matches.push({ node: indexedNode(structuredClone(node)), score, excerpt: node.body.slice(0, 240) });
    }
    return matches.sort((a, b) => a.score - b.score || (a.node.id < b.node.id ? -1 : 1)).slice(0, limit);
  }
  neighbors(id: string, options: Filters & { limit?: number } = {}): { items: Neighbor[]; truncated: boolean } {
    this.requireNode(id); validateFilters(options);
    const direction = options.direction ?? 'out';
    const family = normalizeFamily(options.family);
    const limit = bounded(options.limit, 100, 5000, 'limit');
    const matches: Neighbor[] = [];
    for (const edge of this.adjacent.get(id) ?? []) {
      const relation = this.relations.get(edge.relation)!;
      if (family !== undefined && relation.family !== family || options.relation !== undefined && edge.relation !== options.relation || options.origin !== undefined && edge.origin !== options.origin || options.context !== undefined && !edge.contexts.includes(options.context)) continue;
      if (relation.family !== 'near' && (direction === 'out' && edge.source !== id || direction === 'in' && edge.target !== id)) continue;
      const outgoing = edge.source === id && (direction !== 'in' || relation.family === 'near');
      matches.push({ edge: structuredClone(edge), node: this.requireNode(outgoing ? edge.target : edge.source), direction: outgoing ? 'out' : 'in',
        label: outgoing ? relation.name : relation.inverse, stType: relation.stType === null ? null : relation.stType === 0 ? 0 : relation.stType * (outgoing ? 1 : -1),
        evidence: (this.evidence.get(edge.id) ?? []).map(e => {
          const source = this.sourceNodes.get(e.sourcePath);
          return citation(structuredClone(e), source ? indexedNode(source) : undefined);
        }) });
      if (matches.length > limit) break;
    }
    return { items: matches.slice(0, limit), truncated: matches.length > limit };
  }
  integrity() { return { ok: true }; } // Construction validates all references and evidence.
  export(): GraphSnapshot {
    return { ...structuredClone(this.graph), nodes: this.graph.nodes.map(n => indexedNode(structuredClone(n))) };
  }
}
