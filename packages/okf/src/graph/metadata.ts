import { hash } from './project.ts';
import { OKF_SPEC } from './version.ts';
import { GRAPH_MODEL } from './model.ts';
import type { Graph } from './model.ts';
export const COMPILER_VERSION = '2';
export function graphMetadata(graph: Graph): Record<string, string> {
  return {
    compiler_version: COMPILER_VERSION,
    source_hash: hash(JSON.stringify(graph.sources)),
    graph_model: GRAPH_MODEL,
    okf_spec_version: OKF_SPEC.version,
    okf_spec_revision: OKF_SPEC.revision,
    okf_spec_url: OKF_SPEC.url,
    okf_spec_checked_on: OKF_SPEC.checkedOn,
    bundle_declared_okf_version: JSON.stringify(
      graph.nodes.find((node) => node.id === 'index')?.metadata.okf_version ?? null,
    ),
  };
}
