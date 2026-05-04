import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";

import { deserializeGraphSnapshot, serializeGraphSnapshot } from "./graph-history";

describe("graph-history", () => {
  it("round-trips node and edge data", () => {
    const nodes: Node[] = [
      {
        id: "a",
        type: "goalNode",
        position: { x: 10, y: 20 },
        data: {
          title: "T",
          description: "D",
          status: "TODO",
          priority: 2,
          type: "TASK",
          computedState: "AVAILABLE",
          lockReason: null,
          startsOn: "2026-01-15",
          isConnecting: false,
        },
        draggable: true,
      },
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "a",
        target: "a",
        type: "boundaryStraight",
        data: { waypoints: [{ x: 1, y: 2 }] },
        selectable: true,
      },
    ];
    const raw = serializeGraphSnapshot(nodes, edges);
    const out = deserializeGraphSnapshot(raw, true);
    expect(out).not.toBeNull();
    expect(out!.nodes).toHaveLength(1);
    expect(out!.nodes[0]!.id).toBe("a");
    expect(out!.nodes[0]!.position).toEqual({ x: 10, y: 20 });
    expect((out!.nodes[0]!.data as { title: string }).title).toBe("T");
    expect(out!.edges).toHaveLength(1);
    expect((out!.edges[0]!.data as { waypoints: { x: number; y: number }[] }).waypoints[0]).toEqual({
      x: 1,
      y: 2,
    });
  });
});
