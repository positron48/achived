import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goal: {
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

describe("PATCH /api/goals/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates goal", async () => {
    mockPrisma.goal.update.mockResolvedValueOnce({
      id: "g1",
      title: "Updated",
      priority: 1,
      status: "ACTIVE",
    });

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/goals/g1", {
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
    mockPrisma.goal.update.mockRejectedValueOnce({ code: "P2025" });

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/goals/g1", {
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
    const request = new Request("http://localhost/api/goals/g1", {
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
    mockPrisma.goal.delete.mockResolvedValueOnce({ id: "g1" });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/goals/g1"), {
      params: Promise.resolve({ id: "g1" }),
    });

    expect(response.status).toBe(204);
  });

  it("returns 404 when deleting absent goal", async () => {
    mockPrisma.goal.delete.mockRejectedValueOnce({ code: "P2025" });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/goals/g1"), {
      params: Promise.resolve({ id: "g1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Goal not found");
  });
});
