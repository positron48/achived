import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goal: {
    updateMany: vi.fn(),
    findFirst: vi.fn(),
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

describe("PATCH /api/goals/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates goal", async () => {
    mockPrisma.goal.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.goal.findFirst.mockResolvedValueOnce({
      id: "g1",
      title: "Updated",
      priority: 1,
      status: "ACTIVE",
    });

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/goals/g1?boardId=b1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated", priority: 1, status: "ACTIVE" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "g1" }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.title).toBe("Updated");
  });

  it("returns 404 when goal not found", async () => {
    mockPrisma.goal.updateMany.mockResolvedValueOnce({ count: 0 });

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/goals/g1?boardId=b1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "g1" }) });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Goal not found");
  });

  it("returns 400 for empty patch", async () => {
    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/goals/g1?boardId=b1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "g1" }) });
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/goals/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes goal", async () => {
    mockPrisma.goal.deleteMany.mockResolvedValueOnce({ count: 1 });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/goals/g1?boardId=b1"), {
      params: Promise.resolve({ id: "g1" }),
    });

    expect(response.status).toBe(204);
  });

  it("returns 404 when deleting absent goal", async () => {
    mockPrisma.goal.deleteMany.mockResolvedValueOnce({ count: 0 });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/goals/g1?boardId=b1"), {
      params: Promise.resolve({ id: "g1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Goal not found");
  });
});
