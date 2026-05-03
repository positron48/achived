import { describe, expect, it } from "vitest";

import { createsCycle } from "./graph";

describe("createsCycle", () => {
  it("detects cycle when target reaches source", () => {
    const edges = [
      { sourceId: "b", targetId: "a" },
      { sourceId: "c", targetId: "b" },
    ];

    expect(createsCycle("a", "c", edges)).toBe(true);
  });

  it("returns false for acyclic graph", () => {
    const edges = [
      { sourceId: "a", targetId: "b" },
      { sourceId: "b", targetId: "c" },
    ];

    expect(createsCycle("c", "d", edges)).toBe(false);
  });
});
