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

describe("GET /api/next", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active and available goals in sorted order", async () => {
    mockPrisma.goal.findMany.mockResolvedValueOnce([
      {
        id: "a",
        title: "Done prerequisite",
        description: "",
        status: "DONE",
        priority: 5,
        type: "TASK",
        x: 0,
        y: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "b",
        title: "Available",
        description: "",
        status: "TODO",
        priority: 2,
        type: "TASK",
        x: 0,
        y: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "c",
        title: "Active",
        description: "",
        status: "ACTIVE",
        priority: 3,
        type: "TASK",
        x: 0,
        y: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-04T00:00:00.000Z",
      },
    ]);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([
      { id: "e1", sourceId: "a", targetId: "b", type: "REQUIRES" },
    ]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/next?boardId=b1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(2);
    expect(payload[0].id).toBe("c");
    expect(payload[1].id).toBe("b");
  });
});
