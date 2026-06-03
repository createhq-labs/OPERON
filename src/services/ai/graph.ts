export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  sourceId: string;
  targetId: string;
  relation: string;
}

export function linkEntities(entities: Array<{ type: string; value: string }>) {
  return {
    nodes: [] as KnowledgeGraphNode[],
    edges: [] as KnowledgeGraphEdge[],
  };
}
