import { normalizeEdgeWaypointsArray } from "@/lib/graph-types";

export type WireGoal = {
  id: string;
  position: { x: number; y: number };
  data: {
    title: string;
    description: string;
    status: string;
    priority: number;
    type: string;
    computedState?: string;
    startsOn?: string | null;
  };
};

export type WireEdge = {
  id: string;
  source: string;
  target: string;
  linkType?: string;
  data?: { waypoints?: unknown };
};

export type WirePayload = { v: number; nodes: WireGoal[]; edges: WireEdge[] };

export function parseGraphSnapshotWire(raw: string): WirePayload | null {
  try {
    const p = JSON.parse(raw) as WirePayload;
    if (p.v !== 1 || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) return null;
    return p;
  } catch {
    return null;
  }
}

function nearlyEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-5;
}

function waypointsEqualJson(a: unknown, b: unknown): boolean {
  const wa = normalizeEdgeWaypointsArray(a);
  const wb = normalizeEdgeWaypointsArray(b);
  if (wa.length !== wb.length) return false;
  for (let i = 0; i < wa.length; i++) {
    if (!nearlyEq(wa[i]!.x, wb[i]!.x) || !nearlyEq(wa[i]!.y, wb[i]!.y)) return false;
  }
  return true;
}

export function diffGoalFields(before: WireGoal, after: WireGoal): string[] {
  const out: string[] = [];
  const a = before.data;
  const b = after.data;
  if (a.title !== b.title) out.push(`title: ${JSON.stringify(a.title)} → ${JSON.stringify(b.title)}`);
  if (a.description !== b.description) {
    out.push(`description: ${JSON.stringify(a.description)} → ${JSON.stringify(b.description)}`);
  }
  if (a.status !== b.status) out.push(`status: ${a.status} → ${b.status}`);
  if (a.priority !== b.priority) out.push(`priority: ${a.priority} → ${b.priority}`);
  if (a.type !== b.type) out.push(`type: ${a.type} → ${b.type}`);
  if ((a.startsOn ?? null) !== (b.startsOn ?? null)) {
    out.push(`startsOn: ${String(a.startsOn)} → ${String(b.startsOn)}`);
  }
  if (!nearlyEq(before.position.x, after.position.x) || !nearlyEq(before.position.y, after.position.y)) {
    out.push(`position: (${before.position.x}, ${before.position.y}) → (${after.position.x}, ${after.position.y})`);
  }
  if (a.computedState !== b.computedState && (a.computedState !== undefined || b.computedState !== undefined)) {
    out.push(`computedState: ${String(a.computedState)} → ${String(b.computedState)}`);
  }
  return out;
}

function linkOf(e: WireEdge): string {
  return e.linkType ?? "REQUIRES";
}

export function diffEdgeFields(before: WireEdge, after: WireEdge): string[] {
  const out: string[] = [];
  if (before.source !== after.source) out.push(`source: ${before.source} → ${after.source}`);
  if (before.target !== after.target) out.push(`target: ${before.target} → ${after.target}`);
  if (linkOf(before) !== linkOf(after)) out.push(`linkType: ${linkOf(before)} → ${linkOf(after)}`);
  const wa = before.data?.waypoints;
  const wb = after.data?.waypoints;
  if (!waypointsEqualJson(wa, wb)) {
    out.push(`waypoints: ${JSON.stringify(normalizeEdgeWaypointsArray(wa))} → ${JSON.stringify(normalizeEdgeWaypointsArray(wb))}`);
  }
  return out;
}

/** Снимки считаются одинаковыми по смыслу (цели, связи, поля), порядок в JSON не важен. */
export function snapshotsSemanticallyEqual(a: string, b: string): boolean {
  const from = parseGraphSnapshotWire(a);
  const to = parseGraphSnapshotWire(b);
  if (!from || !to) return false;

  const fromGoals = new Map(from.nodes.map((n) => [n.id, n]));
  const toGoals = new Map(to.nodes.map((n) => [n.id, n]));
  const fromEdges = new Map(from.edges.map((e) => [e.id, e]));
  const toEdges = new Map(to.edges.map((e) => [e.id, e]));

  const removedGoalIds = [...fromGoals.keys()].filter((id) => !toGoals.has(id));
  const addedGoalIds = [...toGoals.keys()].filter((id) => !fromGoals.has(id));
  const keptGoalIds = [...fromGoals.keys()].filter((id) => toGoals.has(id));

  const removedEdgeIds = [...fromEdges.keys()].filter((id) => !toEdges.has(id));
  const addedEdgeIds = [...toEdges.keys()].filter((id) => !fromEdges.has(id));
  const keptEdgeIds = [...fromEdges.keys()].filter((id) => toEdges.has(id));

  if (removedGoalIds.length > 0 || addedGoalIds.length > 0) return false;
  if (removedEdgeIds.length > 0 || addedEdgeIds.length > 0) return false;

  for (const id of keptGoalIds) {
    if (diffGoalFields(fromGoals.get(id)!, toGoals.get(id)!).length > 0) return false;
  }
  for (const id of keptEdgeIds) {
    if (diffEdgeFields(fromEdges.get(id)!, toEdges.get(id)!).length > 0) return false;
  }

  return true;
}
