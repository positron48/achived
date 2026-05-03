import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goal: {
    count: vi.fn(),
  },
  goalEdge: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

describe("POST /api/edges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates edge for existing goals", async () => {
    mockPrisma.goal.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([]);
    mockPrisma.goalEdge.create.mockResolvedValueOnce({
      id: "e1",
      sourceId: "a",
      targetId: "b",
      type: "REQUIRES",
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "a", targetId: "b" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toBe("e1");
  });

  it("rejects self-edge", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "a", targetId: "a" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when one of goals does not exist", async () => {
    mockPrisma.goal.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "a", targetId: "b" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Source or target goal does not exist");
  });

  it("returns 409 for duplicate edge", async () => {
    mockPrisma.goal.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([]);
    mockPrisma.goalEdge.create.mockRejectedValueOnce({ code: "P2002" });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "a", targetId: "b" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Duplicate edge");
  });

  it("returns 400 when new dependency creates cycle", async () => {
    mockPrisma.goal.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mockPrisma.goalEdge.findMany.mockResolvedValueOnce([
      { sourceId: "b", targetId: "a" },
      { sourceId: "c", targetId: "b" },
    ]);

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "a", targetId: "c", type: "REQUIRES" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Cycle detected. Dependency cannot be created");
    expect(mockPrisma.goalEdge.create).not.toHaveBeenCalled();
  });
});
