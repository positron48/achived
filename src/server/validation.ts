import { z } from "zod";

/** Без `.trim()`: иначе при PATCH теряются пробелы в конце/начале, пока пользователь печатает. */
const goalTitleValue = z
  .string()
  .min(1)
  .max(120)
  .refine((s) => s.trim().length > 0, { message: "empty title" });

export const createGoalSchema = z.object({
  title: goalTitleValue,
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

const edgeWaypointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const updateEdgeWaypointsSchema = z.object({
  waypoints: z.union([z.array(edgeWaypointSchema).max(64), z.null()]),
});

export const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const updateBoardSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const shareBoardWithUserSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["VIEWER", "EDITOR"]),
});

export const updateBoardMemberSchema = z.object({
  role: z.enum(["VIEWER", "EDITOR"]),
});

export const updateBoardPublicSchema = z.object({
  enabled: z.boolean(),
});
