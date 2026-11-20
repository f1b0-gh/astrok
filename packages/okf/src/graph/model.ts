export type Family = 'reference' | 'near' | 'leads_to' | 'contains' | 'expresses';
export type GraphKind = 'event' | 'thing' | 'concept';
export const GRAPH_MODEL = 'gamma34/0.1';
export function semanticIdentity(metadata: Record<string, unknown>): { graphModel: string | null; graphKind: GraphKind | null } {
  const graphModel = typeof metadata.graph_model === 'string' ? metadata.graph_model : null;
  const value = metadata.graph_kind;
  return { graphModel, graphKind: graphModel === GRAPH_MODEL && (value === 'event' || value === 'thing' || value === 'concept') ? value : null };
}
export type Origin = 'structural' | 'explicit' | 'inferred';
export interface GraphNode {
  /** Optional canonical publication routes; absent in source-only graphs. */
  url?: string | null; sourceUrl?: string | null;
  graphModel: string | null; graphKind: GraphKind | null;
  id: string; kind: 'concept' | 'index' | 'log' | 'directory'; title: string;
  description: string; type: string | null; body: string;
  metadata: Record<string, unknown>; sourcePath: string | null;
}
export interface Relation { id: string; name: string; inverse: string; family: Family; stType: number | null }
export interface GraphEdge {
  id: string; source: string; target: string; relation: string; origin: Origin;
  weight: number; confidence: number | null; contexts: string[];
}
export interface Evidence {
  id: string; edgeId: string; sourcePath: string; sourceFragment: string | null;
  sourceLine: number | null; sourceColumn: number | null; targetFragment: string | null;
  kind: 'markdown_link' | 'directory_membership' | 'graph_relation' | 'metadata_path'; detail: string | null;
}
export interface Graph {
  sources: { path: string; hash: string }[]; nodes: GraphNode[]; relations: Relation[];
  edges: GraphEdge[]; evidence: Evidence[]; diagnostics: string[];
}
export interface BundleDocument {
  id: string; path: string; kind: 'concept' | 'index' | 'log'; title: string;
  description: string; type: string | null; metadata: Record<string, unknown>;
  body: string; source: string; headings: string[];
  links: { target?: string; sourceFragment?: string | null; fragment?: string | null; line?: number; column?: number }[];
}
export interface Bundle { documents: BundleDocument[]; assets: Map<string, Uint8Array>; errors: string[]; warnings: string[] }
export const ST_TYPES: Record<Family, number | null> = { reference: null, near: 0, leads_to: 1, contains: 2, expresses: 3 };
