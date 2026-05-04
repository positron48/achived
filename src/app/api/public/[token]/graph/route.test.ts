import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  board: {
    findFirst: vi.fn(),
  },
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

describe("GET /api/public/:token/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns read-only graph for valid token", async () => {
    mockPrisma.board.findFirst.mockResolvedValueOnce({ id: "b1", title: "Shared board" });
    mockPrisma.goal.findMany.mockResolvedValueOnce([{ id: "g1" }]);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([{ id: "e1" }]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/public/token/graph"), {
      params: Promise.resolve({ token: "token" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.board.readOnly).toBe(true);
    expect(payload.goals).toEqual([{ id: "g1" }]);
    expect(payload.edges).toEqual([{ id: "e1" }]);
  });
});
