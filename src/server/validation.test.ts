import { describe, expect, it } from "vitest";

import { createEdgeSchema, createGoalSchema, updateGoalSchema } from "./validation";

describe("validation schemas", () => {
  it("accepts valid create goal payload", () => {
    const parsed = createGoalSchema.safeParse({
      title: "Prepare CV",
      priority: 2,
      type: "TASK",
      x: 10,
      y: 20,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid create goal payload", () => {
    const parsed = createGoalSchema.safeParse({
      title: "",
      priority: 9,
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps leading and trailing spaces in title (no zod trim)", () => {
    const parsed = createGoalSchema.safeParse({
      title: "  важный пробел  ",
      type: "TASK",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("  важный пробел  ");
    }
  });

  it("rejects whitespace-only title", () => {
    const parsed = createGoalSchema.safeParse({ title: " \t " });
    expect(parsed.success).toBe(false);
  });

  it("accepts update status", () => {
    const parsed = updateGoalSchema.safeParse({
      status: "DONE",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid edge payload", () => {
    const parsed = createEdgeSchema.safeParse({
      sourceId: "",
      targetId: "g2",
    });
    expect(parsed.success).toBe(false);
  });
});
