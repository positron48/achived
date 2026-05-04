import {
  diffEdgeFields,
  diffGoalFields,
  parseGraphSnapshotWire,
} from "@/lib/graph-snapshot-semantic";

/**
 * В dev режиме пишет в консоль разницу между двумя снимками графа (история назад/вперёд).
 */
export function logDevGraphHistoryDiff(
  fromSnapshotJson: string,
  toSnapshotJson: string,
  direction: "undo" | "redo",
): void {
  if (process.env.NODE_ENV !== "development") return;

  const from = parseGraphSnapshotWire(fromSnapshotJson);
  const to = parseGraphSnapshotWire(toSnapshotJson);
  if (!from || !to) {
    console.warn("[graph history] не удалось разобрать снимок для diff");
    return;
  }

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

  console.groupCollapsed(`[graph history] ${direction}: diff (${from.nodes.length}→${to.nodes.length} целей, ${from.edges.length}→${to.edges.length} связей)`);

  if (removedGoalIds.length > 0) {
    console.log("− цели (исчезнут)", removedGoalIds);
  }
  if (addedGoalIds.length > 0) {
    console.log("+ цели (появятся)", addedGoalIds);
  }

  for (const id of keptGoalIds) {
    const d = diffGoalFields(fromGoals.get(id)!, toGoals.get(id)!);
    if (d.length > 0) {
      console.log(`Δ цель ${id}`, d);
    }
  }

  if (removedEdgeIds.length > 0) {
    console.log("− связи (исчезнут)", removedEdgeIds);
  }
  if (addedEdgeIds.length > 0) {
    console.log("+ связи (появятся)", addedEdgeIds);
  }

  for (const id of keptEdgeIds) {
    const d = diffEdgeFields(fromEdges.get(id)!, toEdges.get(id)!);
    if (d.length > 0) {
      console.log(`Δ связь ${id}`, d);
    }
  }

  console.groupEnd();
}
