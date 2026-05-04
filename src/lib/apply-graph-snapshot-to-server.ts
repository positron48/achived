import type { Edge, Node } from "@xyflow/react";

import { deserializeGraphSnapshot } from "@/lib/graph-history";
import type { EdgeWaypoint, GoalStatus, GoalType } from "@/lib/graph-types";
import { normalizeEdgeWaypointsArray } from "@/lib/graph-types";

type GoalWire = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
  x: number;
  y: number;
  startsOn: string | null;
};

type EdgeWire = {
  id: string;
  source: string;
  target: string;
  linkType: "REQUIRES" | "RELATED";
  waypoints: EdgeWaypoint[];
};

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return;
  const payload = await response.json().catch(() => ({}));
  throw new Error((payload as { error?: string }).error ?? `HTTP ${response.status}`);
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

function goalFromNode(node: Node): GoalWire {
  const d = node.data as {
    title: string;
    description: string;
    status: GoalStatus;
    priority: number;
    type: GoalType;
    startsOn?: string | null;
  };
  return {
    id: node.id,
    title: d.title,
    description: d.description ?? "",
    status: d.status,
    priority: d.priority,
    type: d.type,
    x: node.position.x,
    y: node.position.y,
    startsOn: d.startsOn ?? null,
  };
}

function edgeFromEdge(edge: Edge): EdgeWire {
  const d = (edge.data ?? {}) as { waypoints?: unknown; linkType?: "REQUIRES" | "RELATED" };
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    linkType: d.linkType ?? "REQUIRES",
    waypoints: normalizeEdgeWaypointsArray(d.waypoints),
  };
}

function goalsEqual(a: GoalWire, b: GoalWire): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.type === b.type &&
    Math.abs(a.x - b.x) < 1e-6 &&
    Math.abs(a.y - b.y) < 1e-6 &&
    (a.startsOn ?? null) === (b.startsOn ?? null)
  );
}

function waypointsEqual(a: EdgeWaypoint[], b: EdgeWaypoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6) return false;
  }
  return true;
}

/**
 * Приводит данные на сервере к целевому снимку графа: удаление/создание целей и рёбер,
 * PATCH полей и waypoints. Используется при откате/повторе истории.
 */
export async function applyGraphSnapshotToServer(params: {
  targetSnapshotJson: string;
  currentNodes: Node[];
  currentEdges: Edge[];
  withBoard: (path: string) => string;
}): Promise<void> {
  const targetParsed = deserializeGraphSnapshot(params.targetSnapshotJson, true);
  if (!targetParsed) {
    throw new Error("Некорректный снимок графа");
  }

  const currentGoalMap = new Map(params.currentNodes.map((n) => [n.id, goalFromNode(n)]));
  const targetGoalMap = new Map(targetParsed.nodes.map((n) => [n.id, goalFromNode(n)]));

  const currentEdgeMap = new Map(params.currentEdges.map((e) => [e.id, edgeFromEdge(e)]));
  const targetEdgeMap = new Map(targetParsed.edges.map((e) => [e.id, edgeFromEdge(e)]));

  const { withBoard } = params;

  const edgeIdsToRemove = [...currentEdgeMap.keys()].filter((id) => !targetEdgeMap.has(id));
  for (const id of edgeIdsToRemove) {
    const response = await fetch(withBoard(`/api/edges/${id}`), { method: "DELETE" });
    await ensureOk(response);
  }

  const goalIdsToRemove = [...currentGoalMap.keys()].filter((id) => !targetGoalMap.has(id));
  for (const id of goalIdsToRemove) {
    const response = await fetch(withBoard(`/api/goals/${id}`), { method: "DELETE" });
    await ensureOk(response);
  }

  const goalIdsToCreate = [...targetGoalMap.keys()].filter((id) => !currentGoalMap.has(id));
  for (const id of goalIdsToCreate) {
    const g = targetGoalMap.get(id)!;
    const response = await fetch(withBoard("/api/goals"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: g.id,
        title: g.title,
        description: g.description,
        type: g.type,
        priority: g.priority,
        x: g.x,
        y: g.y,
        startsOn: g.startsOn,
      }),
    });
    await parseJson<unknown>(response);
  }

  const goalIdsBoth = [...targetGoalMap.keys()].filter((id) => currentGoalMap.has(id));
  for (const id of goalIdsBoth) {
    const cur = currentGoalMap.get(id)!;
    const next = targetGoalMap.get(id)!;
    if (goalsEqual(cur, next)) continue;
    const response = await fetch(withBoard(`/api/goals/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: next.title,
        description: next.description,
        status: next.status,
        priority: next.priority,
        type: next.type,
        x: next.x,
        y: next.y,
        startsOn: next.startsOn,
      }),
    });
    await parseJson<unknown>(response);
  }

  const edgeIdsBoth = [...targetEdgeMap.keys()].filter((id) => currentEdgeMap.has(id));
  for (const id of edgeIdsBoth) {
    const cur = currentEdgeMap.get(id)!;
    const next = targetEdgeMap.get(id)!;
    if (cur.linkType === next.linkType) continue;
    const del = await fetch(withBoard(`/api/edges/${id}`), { method: "DELETE" });
    await ensureOk(del);
    const create = await fetch(withBoard("/api/edges"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: next.id,
        sourceId: next.source,
        targetId: next.target,
        type: next.linkType,
        waypoints: next.waypoints.length > 0 ? next.waypoints : null,
      }),
    });
    await parseJson<unknown>(create);
  }

  const edgeIdsToCreate = [...targetEdgeMap.keys()].filter((id) => !currentEdgeMap.has(id));
  for (const id of edgeIdsToCreate) {
    const e = targetEdgeMap.get(id)!;
    const response = await fetch(withBoard("/api/edges"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: e.id,
        sourceId: e.source,
        targetId: e.target,
        type: e.linkType,
        waypoints: e.waypoints.length > 0 ? e.waypoints : null,
      }),
    });
    await parseJson<unknown>(response);
  }

  for (const id of edgeIdsBoth) {
    const cur = currentEdgeMap.get(id)!;
    const next = targetEdgeMap.get(id)!;
    if (cur.linkType !== next.linkType) continue;
    if (waypointsEqual(cur.waypoints, next.waypoints)) continue;
    const response = await fetch(withBoard(`/api/edges/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        waypoints: next.waypoints.length > 0 ? next.waypoints : null,
      }),
    });
    await parseJson<unknown>(response);
  }
}
