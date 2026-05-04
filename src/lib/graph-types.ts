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
  createdAt?: string | Date;
  updatedAt: string | Date;
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
