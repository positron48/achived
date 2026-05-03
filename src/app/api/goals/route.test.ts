import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goal: {
    create: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

describe("POST /api/goals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates goal with defaults", async () => {
    mockPrisma.goal.create.mockResolvedValueOnce({
      id: "g1",
      title: "My goal",
      description: "",
      type: "TASK",
      priority: 3,
      x: 0,
      y: 0,
    });

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "My goal" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toBe("g1");
    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: {
        title: "My goal",
        description: "",
        type: "TASK",
        priority: 3,
        x: 0,
        y: 0,
      },
    });
  });

  it("returns 400 for invalid payload", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockPrisma.goal.create).not.toHaveBeenCalled();
  });
});
