import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goalEdge: {
    deleteMany: vi.fn(),
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

describe("DELETE /api/edges/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes edge", async () => {
    mockPrisma.goalEdge.deleteMany.mockResolvedValueOnce({ count: 1 });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/edges/e1?boardId=b1"), {
      params: Promise.resolve({ id: "e1" }),
    });

    expect(response.status).toBe(204);
  });

  it("returns 404 when edge not found", async () => {
    mockPrisma.goalEdge.deleteMany.mockResolvedValueOnce({ count: 0 });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/edges/e1?boardId=b1"), {
      params: Promise.resolve({ id: "e1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Edge not found");
  });
});
