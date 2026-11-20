import { semanticIdentity } from './model.ts';
import type { GraphNode, GraphEdge, Evidence, Family, Origin } from './model.ts';
export interface IndexedNode extends GraphNode { url: string | null; sourceUrl: string | null }
export interface Citation extends Evidence { sourceUrl: string; pageUrl: string }
export interface Filters { direction?: 'out' | 'in' | 'both'; family?: Family | 'similar'; relation?: string; context?: string; origin?: Origin }
export interface Neighbor { edge: GraphEdge; node: IndexedNode; direction: 'out' | 'in'; label: string; stType: number | null; evidence: Citation[] }
export interface WalkOptions extends Filters { maxDepth?: number; maxNodes?: number; maxEdges?: number }
interface Visit { node: IndexedNode; depth: number; via: Neighbor | null; parent: string | null }
export function bounded(value: number | undefined, fallback: number, max: number, name: string, min = 1): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return result;
}
export function urlFor(file: string): string {
  const id = file.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
  return '/' + id.split('/').filter(Boolean).map(encodeURIComponent).join('/') + (id ? '/' : '');
}
export const rawUrl = (file: string) => '/okf/' + file.split('/').map(encodeURIComponent).join('/');

export function normalizeFamily(family: Filters['family']): Family | undefined {
  if (family === 'similar') return 'near';
  if (family !== undefined && !['reference', 'near', 'leads_to', 'contains', 'expresses'].includes(family)) throw new Error('Unknown semantic family');
  return family;
}
export function validateFilters(options: Filters): void {
  normalizeFamily(options.family);
  if (options.origin !== undefined && !['structural', 'explicit', 'inferred'].includes(options.origin)) throw new Error('Unknown origin');
  if (options.direction !== undefined && !['out', 'in', 'both'].includes(options.direction)) throw new Error('direction must be out, in or both');
}
export function searchTerms(text: string): string[] {
  if (text.length > 512) throw new Error('Search text is limited to 512 characters');
  const tokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length > 16) throw new Error('Search is limited to 16 terms');
  return tokens;
}
export function indexedNode(node: GraphNode): IndexedNode {
  return { ...node, ...semanticIdentity(node.metadata), url: node.url ?? (node.sourcePath ? urlFor(node.sourcePath) : null), sourceUrl: node.sourceUrl ?? (node.sourcePath ? rawUrl(node.sourcePath) : null) };
}
export function citation(e: Evidence, source?: IndexedNode): Citation {
  const fragment = e.sourceFragment ? '#' + encodeURIComponent(e.sourceFragment) : '';
  return { ...e, sourceUrl: (source?.sourceUrl ?? rawUrl(e.sourcePath)) + fragment, pageUrl: (source?.url ?? urlFor(e.sourcePath)) + fragment };
}
export abstract class GraphQueries {
  abstract getNode(id: string): IndexedNode | null;
  abstract neighbors(id: string, options?: Filters & { limit?: number }): { items: Neighbor[]; truncated: boolean };
  protected requireNode(id: string): IndexedNode {
    const node = this.getNode(id);
    if (!node) throw new Error(`Unknown node: ${id}`);
    return node;
  }
  traverse(start: string, options: WalkOptions = {}): { nodes: Visit[]; edges: Neighbor[]; truncated: boolean } {
    const maxDepth = bounded(options.maxDepth, 3, 8, 'maxDepth', 0);
    const maxNodes = bounded(options.maxNodes, 100, 500, 'maxNodes');
    const maxEdges = bounded(options.maxEdges, 500, 2000, 'maxEdges');
    const visits: Visit[] = [{ node: this.requireNode(start), depth: 0, via: null, parent: null }];
    const visited = new Set([start]);
    const edges = new Map<string, Neighbor>();
    let examined = 0;
    let truncated = false;
    for (let cursor = 0; cursor < visits.length; cursor++) {
      const visit = visits[cursor]!;
      if (examined >= maxEdges) { truncated = true; break; }
      const adjacent = this.neighbors(visit.node.id, { ...options, limit: maxEdges - examined });
      if (adjacent.truncated) truncated = true;
      for (const neighbor of adjacent.items) {
        examined++;
        const newNode = !visited.has(neighbor.node.id);
        if (newNode && (visit.depth >= maxDepth || visited.size >= maxNodes)) { truncated = true; continue; }
        if (visit.depth >= maxDepth) continue;
        edges.set(neighbor.edge.id, neighbor);
        if (newNode) {
          visited.add(neighbor.node.id);
          visits.push({ node: neighbor.node, depth: visit.depth + 1, via: neighbor, parent: visit.node.id });
        }
      }
    }
    return { nodes: visits, edges: [...edges.values()], truncated };
  }
  path(start: string, target: string, options: WalkOptions = {}) {
    this.requireNode(target);
    const walk = this.traverse(start, options);
    const visits = new Map(walk.nodes.map(visit => [visit.node.id, visit]));
    const nodes: IndexedNode[] = [];
    const steps: Neighbor[] = [];
    let current = visits.get(target);
    if (!current) return { found: false, nodes, steps, truncated: walk.truncated, reason: 'No path found within the requested filters and limits' };
    while (current) {
      nodes.unshift(current.node);
      if (current.via) steps.unshift(current.via);
      current = current.parent ? visits.get(current.parent) : undefined;
    }
    return { found: true, nodes, steps, truncated: walk.truncated };
  }
}
