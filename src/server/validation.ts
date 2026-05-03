import { z } from "zod";

export const createGoalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional(),
  type: z.enum(["EPIC", "MILESTONE", "TASK", "HABIT"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const updateGoalSchema = createGoalSchema.partial().extend({
  status: z.enum(["TODO", "ACTIVE", "DONE", "BLOCKED", "DROPPED"]).optional(),
});

export const createEdgeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.enum(["REQUIRES", "RELATED"]).optional(),
});
