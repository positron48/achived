export type GoalStatus = "TODO" | "ACTIVE" | "DONE" | "BLOCKED" | "DROPPED";
export type GoalType = "EPIC" | "MILESTONE" | "TASK" | "HABIT";
export type ComputedState = "DONE" | "DROPPED" | "BLOCKED" | "LOCKED" | "ACTIVE" | "AVAILABLE";

export type ApiGoal = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
  x: number;
  y: number;
  /** YYYY-MM-DD или null — не раньше этого дня смысловая готовность к работе. */
  startsOn: string | null;
  createdAt?: string | Date;
  updatedAt: string | Date;
};

export type EdgeWaypoint = { x: number; y: number };

export type ApiEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "REQUIRES" | "RELATED";
  waypoints?: EdgeWaypoint[] | null;
};

/** Парсинг JSON-поля waypoints из Prisma в массив точек (для клиента и типизации). */
export function normalizeEdgeWaypointsArray(raw: unknown): EdgeWaypoint[] {
  if (!Array.isArray(raw)) return [];
  const out: EdgeWaypoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = (item as { x?: unknown }).x;
    const y = (item as { y?: unknown }).y;
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
      out.push({ x, y });
    }
  }
  return out;
}

export function dbEdgeRowToApiEdge(row: {
  id: string;
  sourceId: string;
  targetId: string;
  type: ApiEdge["type"];
  waypoints?: unknown | null;
}): ApiEdge {
  const waypoints = normalizeEdgeWaypointsArray(row.waypoints);
  return {
    id: row.id,
    sourceId: row.sourceId,
    targetId: row.targetId,
    type: row.type,
    ...(waypoints.length > 0 ? { waypoints } : {}),
  };
}

export type GraphResponse = {
  goals: ApiGoal[];
  edges: ApiEdge[];
};

/** Строка YYYY-MM-DD для полей даты из Prisma `Date` / ISO из JSON. */
export function normalizeGoalStartsOn(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    return value.length >= 10 ? value.slice(0, 10) : null;
  }
  return value.toISOString().slice(0, 10);
}

export type BoardRole = "OWNER" | "EDITOR" | "VIEWER";

export type BoardSummary = {
  id: string;
  title: string;
  role: BoardRole;
  isPublicReadOnly: boolean;
  publicShareToken: string | null;
};

export type BoardMemberItem = {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: "EDITOR" | "VIEWER";
};

export type GoalBlocker = {
  id: string;
  title: string;
  status: GoalStatus;
};

export type NextGoalItem = {
  id: string;
  title: string;
  priority: number;
  type: GoalType;
  status: GoalStatus;
  computedState: ComputedState;
  blockedBy: GoalBlocker[];
  updatedAt: string | Date;
};
