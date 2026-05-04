import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goal: {
    findMany: vi.fn(),
  },
  goalEdge: {
    findMany: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/server/auth-session", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "u1", email: "u@example.com", name: null }),
}));

vi.mock("@/server/board-access", () => ({
  getBoardIdFromRequest: vi.fn().mockReturnValue("b1"),
  getUserBoardRole: vi.fn().mockResolvedValue("OWNER"),
  boardRoleSatisfies: vi.fn().mockReturnValue(true),
}));

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns goals and edges", async () => {
    mockPrisma.goal.findMany.mockResolvedValueOnce([{ id: "g1", title: "Goal" }]);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([
      { id: "e1", sourceId: "g1", targetId: "g2", type: "REQUIRES", waypoints: null },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/graph?boardId=b1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      goals: [{ id: "g1", title: "Goal" }],
      edges: [{ id: "e1", sourceId: "g1", targetId: "g2", type: "REQUIRES" }],
    });
    expect(mockPrisma.goal.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.goalEdge.findMany).toHaveBeenCalledTimes(1);
  });
});
