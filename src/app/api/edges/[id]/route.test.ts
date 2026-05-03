import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  goalEdge: {
    delete: vi.fn(),
  },
};

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
}));

describe("DELETE /api/edges/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes edge", async () => {
    mockPrisma.goalEdge.delete.mockResolvedValueOnce({ id: "e1" });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/edges/e1"), {
      params: Promise.resolve({ id: "e1" }),
    });

    expect(response.status).toBe(204);
  });

  it("returns 404 when edge not found", async () => {
    mockPrisma.goalEdge.delete.mockRejectedValueOnce({ code: "P2025" });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/edges/e1"), {
      params: Promise.resolve({ id: "e1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Edge not found");
  });
});
