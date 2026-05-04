import type { Edge, Node } from "@xyflow/react";

import type { ComputedState, EdgeWaypoint, GoalStatus, GoalType } from "@/lib/graph-types";
import { normalizeEdgeWaypointsArray } from "@/lib/graph-types";

/** Не меньше требуемого минимума (20); небольшой запас на «ветки» после undo. */
export const GRAPH_HISTORY_MAX_ENTRIES = 32;

const STORAGE_VERSION = 1 as const;

export type GraphHistoryWireData = {
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
  computedState: ComputedState;
  lockReason: "deps" | "schedule" | null;
  startsOn: string | null;
};

type GraphHistoryWireNode = {
  id: string;
  position: { x: number; y: number };
  data: GraphHistoryWireData;
};

type GraphHistoryWireEdge = {
  id: string;
  source: string;
  target: string;
  /** Для снимков до обновления может отсутствовать — тогда REQUIRES. */
  linkType?: "REQUIRES" | "RELATED";
  data: { waypoints?: EdgeWaypoint[] };
};

type GraphHistoryWirePayload = {
  v: typeof STORAGE_VERSION;
  nodes: GraphHistoryWireNode[];
  edges: GraphHistoryWireEdge[];
};

export type PersistedGraphHistory = {
  v: typeof STORAGE_VERSION;
  entries: string[];
  index: number;
};

export function graphHistoryStorageKey(boardId: string): string {
  return `goalgraph:graph-history:v${STORAGE_VERSION}:${boardId}`;
}

/** Снимок узлов и рёбер без лишних полей React Flow / выделения. */
export function serializeGraphSnapshot(nodes: Node[], edges: Edge[]): string {
  const wireNodes: GraphHistoryWireNode[] = nodes.map((node) => ({
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    data: {
      title: String((node.data as { title?: unknown }).title ?? ""),
      description: String((node.data as { description?: unknown }).description ?? ""),
      status: (node.data as { status: GoalStatus }).status,
      priority: Number((node.data as { priority?: unknown }).priority ?? 0),
      type: (node.data as { type: GoalType }).type,
      computedState: (node.data as { computedState: ComputedState }).computedState,
      lockReason:
        (node.data as { lockReason?: "deps" | "schedule" | null }).lockReason ?? null,
      startsOn: (node.data as { startsOn?: string | null }).startsOn ?? null,
    },
  }));

  wireNodes.sort((a, b) => a.id.localeCompare(b.id));

  const wireEdges: GraphHistoryWireEdge[] = edges.map((edge) => {
    const d = (edge.data ?? {}) as { waypoints?: unknown; linkType?: "REQUIRES" | "RELATED" };
    const rawWaypoints = d.waypoints;
    const waypoints = normalizeEdgeWaypointsArray(rawWaypoints);
    const linkType = d.linkType ?? "REQUIRES";
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      linkType,
      data: waypoints.length > 0 ? { waypoints } : {},
    };
  });

  wireEdges.sort((a, b) => a.id.localeCompare(b.id));

  const payload: GraphHistoryWirePayload = {
    v: STORAGE_VERSION,
    nodes: wireNodes,
    edges: wireEdges,
  };
  return JSON.stringify(payload);
}

export function deserializeGraphSnapshot(raw: string, isEditor: boolean): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const p = JSON.parse(raw) as GraphHistoryWirePayload;
    if (p.v !== STORAGE_VERSION || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) {
      return null;
    }

    const nodes: Node[] = p.nodes.map((n) => ({
      id: n.id,
      type: "goalNode",
      position: { x: n.position.x, y: n.position.y },
      data: {
        ...n.data,
        isConnecting: false,
      },
      draggable: true,
    }));

    const edges: Edge[] = p.edges.map((e) => {
      const wps = normalizeEdgeWaypointsArray(e.data?.waypoints);
      const linkType = e.linkType ?? "REQUIRES";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "boundaryStraight",
        data: {
          ...(wps.length > 0 ? { waypoints: wps } : {}),
          linkType,
        },
        selectable: isEditor,
      };
    });

    return { nodes, edges };
  } catch {
    return null;
  }
}

export function readPersistedGraphHistory(boardId: string): PersistedGraphHistory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(graphHistoryStorageKey(boardId));
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedGraphHistory;
    if (
      p.v !== STORAGE_VERSION ||
      !Array.isArray(p.entries) ||
      typeof p.index !== "number" ||
      p.index < 0 ||
      p.index >= p.entries.length
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function writePersistedGraphHistory(boardId: string, entries: string[], index: number): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedGraphHistory = { v: STORAGE_VERSION, entries, index };
    window.localStorage.setItem(graphHistoryStorageKey(boardId), JSON.stringify(payload));
  } catch {
    // квота или приватный режим — игнорируем
  }
}
