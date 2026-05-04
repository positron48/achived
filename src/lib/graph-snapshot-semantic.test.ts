import { describe, expect, it } from "vitest";

import { snapshotsSemanticallyEqual } from "./graph-snapshot-semantic";

describe("snapshotsSemanticallyEqual", () => {
  it("returns true for identical JSON strings", () => {
    const s = JSON.stringify({
      v: 1,
      nodes: [
        {
          id: "a",
          position: { x: 1, y: 2 },
          data: {
            title: "t",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
      ],
      edges: [],
    });
    expect(snapshotsSemanticallyEqual(s, s)).toBe(true);
  });

  it("returns true when only node order differs", () => {
    const a = JSON.stringify({
      v: 1,
      nodes: [
        {
          id: "b",
          position: { x: 0, y: 0 },
          data: {
            title: "b",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
        {
          id: "a",
          position: { x: 1, y: 2 },
          data: {
            title: "a",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
      ],
      edges: [],
    });
    const b = JSON.stringify({
      v: 1,
      nodes: [
        {
          id: "a",
          position: { x: 1, y: 2 },
          data: {
            title: "a",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
        {
          id: "b",
          position: { x: 0, y: 0 },
          data: {
            title: "b",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
      ],
      edges: [],
    });
    expect(snapshotsSemanticallyEqual(a, b)).toBe(true);
  });

  it("returns false when a goal title changes", () => {
    const before = JSON.stringify({
      v: 1,
      nodes: [
        {
          id: "a",
          position: { x: 1, y: 2 },
          data: {
            title: "old",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
      ],
      edges: [],
    });
    const after = JSON.stringify({
      v: 1,
      nodes: [
        {
          id: "a",
          position: { x: 1, y: 2 },
          data: {
            title: "new",
            description: "",
            status: "TODO",
            priority: 3,
            type: "TASK",
            computedState: "AVAILABLE",
            lockReason: null,
            startsOn: null,
          },
        },
      ],
      edges: [],
    });
    expect(snapshotsSemanticallyEqual(before, after)).toBe(false);
  });
});
