import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  userSettings: {
    upsert: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/server/auth-session", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "u1", email: "u@example.com", name: null }),
}));

describe("PATCH /api/user/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts user settings", async () => {
    mockPrisma.userSettings.upsert.mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      graphGridSnapEnabled: true,
      graphLeftSidebarOpen: false,
      graphRightSidebarOpen: true,
      updatedAt: new Date(),
    });

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        graphGridSnapEnabled: true,
        graphLeftSidebarOpen: false,
      }),
    });

    const response = await PATCH(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.graphGridSnapEnabled).toBe(true);
    expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: {
        userId: "u1",
        graphGridSnapEnabled: true,
        graphLeftSidebarOpen: false,
        graphRightSidebarOpen: true,
      },
      update: {
        graphGridSnapEnabled: true,
        graphLeftSidebarOpen: false,
      },
    });
  });

  it("returns 400 for empty patch", async () => {
    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    expect(mockPrisma.userSettings.upsert).not.toHaveBeenCalled();
  });
});
