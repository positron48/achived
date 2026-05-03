import { describe, expect, it } from "vitest";

import type { ApiEdge, ApiGoal } from "@/lib/graph-types";

import { getGoalComputedState, getNextGoals } from "./domain";

const goals: ApiGoal[] = [
  {
    id: "a",
    title: "A",
    description: "",
    status: "DONE",
    priority: 3,
    type: "TASK",
    x: 0,
    y: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "b",
    title: "B",
    description: "",
    status: "TODO",
    priority: 1,
    type: "TASK",
    x: 0,
    y: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "c",
    title: "C",
    description: "",
    status: "ACTIVE",
    priority: 2,
    type: "TASK",
    x: 0,
    y: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];

const edges: ApiEdge[] = [
  {
    id: "e1",
    sourceId: "a",
    targetId: "b",
    type: "REQUIRES",
  },
];

describe("domain logic", () => {
  it("calculates computed state with prerequisites", () => {
    expect(getGoalComputedState(goals[1], goals, edges)).toBe("AVAILABLE");
    expect(getGoalComputedState(goals[2], goals, edges)).toBe("ACTIVE");
  });

  it("returns sorted next goals", () => {
    const next = getNextGoals(goals, edges);
    expect(next.map((goal) => goal.id)).toEqual(["c", "b"]);
    expect(next[0].computedState).toBe("ACTIVE");
    expect(next[1].computedState).toBe("AVAILABLE");
  });
});
