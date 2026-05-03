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

describe("GET /api/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns goals and edges", async () => {
    mockPrisma.goal.findMany.mockResolvedValueOnce([{ id: "g1", title: "Goal" }]);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([{ id: "e1", sourceId: "g1", targetId: "g2" }]);

    const { GET } = await import("./route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      goals: [{ id: "g1", title: "Goal" }],
      edges: [{ id: "e1", sourceId: "g1", targetId: "g2" }],
    });
    expect(mockPrisma.goal.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.goalEdge.findMany).toHaveBeenCalledTimes(1);
  });
});
