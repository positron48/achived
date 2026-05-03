export type GoalStatus = "TODO" | "ACTIVE" | "DONE" | "BLOCKED" | "DROPPED";
export type GoalType = "EPIC" | "MILESTONE" | "TASK" | "HABIT";

export type ApiGoal = {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
  x: number;
  y: number;
};

export type ApiEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "REQUIRES" | "RELATED";
};

export type GraphResponse = {
  goals: ApiGoal[];
  edges: ApiEdge[];
};
