import { describe, expect, it } from "vitest";

import { boardRoleSatisfies } from "@/server/board-access";

describe("boardRoleSatisfies", () => {
  it("allows owner for editor requirement", () => {
    expect(boardRoleSatisfies("OWNER", "EDITOR")).toBe(true);
  });

  it("blocks viewer for editor requirement", () => {
    expect(boardRoleSatisfies("VIEWER", "EDITOR")).toBe(false);
  });
});
