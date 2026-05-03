import type { ApiEdge, ApiGoal, ComputedState, GoalStatus, NextGoalItem } from "@/lib/graph-types";

export function getGoalComputedState(
  goal: Pick<ApiGoal, "id" | "status">,
  goals: Array<Pick<ApiGoal, "id" | "status">>,
  edges: ApiEdge[],
): ComputedState {
  if (goal.status === "DONE") return "DONE";
  if (goal.status === "DROPPED") return "DROPPED";
  if (goal.status === "BLOCKED") return "BLOCKED";

  const blockerIds = edges
    .filter((edge) => edge.type === "REQUIRES" && edge.targetId === goal.id)
    .map((edge) => edge.sourceId);

  const blockerGoals = blockerIds
    .map((id) => goals.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is { id: string; status: GoalStatus } => Boolean(candidate));

  if (blockerGoals.some((blocker) => blocker.status !== "DONE")) {
    return "LOCKED";
  }

  if (goal.status === "ACTIVE") return "ACTIVE";
  return "AVAILABLE";
}

export function getBlockedBy(
  goalId: string,
  goals: Array<Pick<ApiGoal, "id" | "title" | "status">>,
  edges: ApiEdge[],
) {
  const blockerIds = edges
    .filter((edge) => edge.type === "REQUIRES" && edge.targetId === goalId)
    .map((edge) => edge.sourceId);

  return blockerIds
    .map((id) => goals.find((goal) => goal.id === id))
    .filter((goal): goal is { id: string; title: string; status: GoalStatus } => Boolean(goal))
    .filter((goal) => goal.status !== "DONE");
}

export function getUnlocks(
  goalId: string,
  goals: Array<Pick<ApiGoal, "id" | "title" | "status">>,
  edges: ApiEdge[],
) {
  const unlockedIds = edges
    .filter((edge) => edge.type === "REQUIRES" && edge.sourceId === goalId)
    .map((edge) => edge.targetId);

  return unlockedIds
    .map((id) => goals.find((goal) => goal.id === id))
    .filter((goal): goal is { id: string; title: string; status: GoalStatus } => Boolean(goal));
}

export function getNextGoals(goals: ApiGoal[], edges: ApiEdge[]): NextGoalItem[] {
  const withComputed = goals.map((goal) => {
    const computedState = getGoalComputedState(goal, goals, edges);
    return {
      id: goal.id,
      title: goal.title,
      priority: goal.priority,
      type: goal.type,
      status: goal.status,
      computedState,
      blockedBy: getBlockedBy(goal.id, goals, edges),
      updatedAt: goal.updatedAt,
    };
  });

  return withComputed
    .filter((goal) => goal.computedState === "ACTIVE" || goal.computedState === "AVAILABLE")
    .sort((a, b) => {
      const stateRank = (value: ComputedState) => (value === "ACTIVE" ? 0 : 1);
      const byState = stateRank(a.computedState) - stateRank(b.computedState);
      if (byState !== 0) return byState;

      const byPriority = a.priority - b.priority;
      if (byPriority !== 0) return byPriority;

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}
