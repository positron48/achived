import type { ApiEdge } from "@/lib/graph-types";

export function createsCycle(
  sourceId: string,
  targetId: string,
  requiresEdges: Array<Pick<ApiEdge, "sourceId" | "targetId">>,
): boolean {
  const adjacency = new Map<string, string[]>();

  for (const edge of requiresEdges) {
    const current = adjacency.get(edge.sourceId) ?? [];
    current.push(edge.targetId);
    adjacency.set(edge.sourceId, current);
  }

  const stack = [targetId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    if (current === sourceId) {
      return true;
    }

    visited.add(current);
    const next = adjacency.get(current) ?? [];
    for (const nodeId of next) {
      if (!visited.has(nodeId)) {
        stack.push(nodeId);
      }
    }
  }

  return false;
}
