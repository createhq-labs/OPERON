export interface GraphNode {
  id: string;
  type: string;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  metadata?: Record<string, unknown>;
}

export interface GraphProvider {
  name: string;
  buildGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<void>;
  queryGraph(query: string): Promise<Array<GraphNode | GraphEdge>>;
}
