import { z } from "zod";

/** Без `.trim()`: иначе при PATCH теряются пробелы в конце/начале, пока пользователь печатает. */
const goalTitleValue = z
  .string()
  .min(1)
  .max(120)
  .refine((s) => s.trim().length > 0, { message: "empty title" });

const calendarDayString = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.null(),
]);

/** Явный id (напр. при восстановлении из истории графа); должен быть свободен в таблице Goal. */
export const optionalClientCuid = z.string().min(4).max(64).optional();

export const createGoalSchema = z.object({
  id: optionalClientCuid,
  title: goalTitleValue,
  description: z.string().max(5000).optional(),
  type: z.enum(["EPIC", "MILESTONE", "TASK", "HABIT"]).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  startsOn: calendarDayString.optional(),
});

export const updateGoalSchema = createGoalSchema
  .omit({ id: true })
  .partial()
  .extend({
    status: z.enum(["TODO", "ACTIVE", "DONE", "BLOCKED", "DROPPED"]).optional(),
  });

const edgeWaypointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const createEdgeSchema = z.object({
  id: optionalClientCuid,
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.enum(["REQUIRES", "RELATED"]).optional(),
  waypoints: z.union([z.array(edgeWaypointSchema).max(64), z.null()]).optional(),
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

export const updateUserSettingsSchema = z
  .object({
    graphGridSnapEnabled: z.boolean().optional(),
    graphLeftSidebarOpen: z.boolean().optional(),
    graphRightSidebarOpen: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "empty patch" });
