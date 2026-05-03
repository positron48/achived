"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  Handle,
  MiniMap,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";

import type { ApiEdge, ApiGoal, GoalStatus, GoalType, GraphResponse } from "@/lib/graph-types";

type GoalNodeData = {
  title: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
};

const statusDotClass: Record<GoalStatus, string> = {
  TODO: "bg-slate-400",
  ACTIVE: "bg-cyan-400",
  DONE: "bg-emerald-400",
  BLOCKED: "bg-amber-400",
  DROPPED: "bg-rose-400",
};

function GoalNode({ data, selected }: NodeProps<Node<GoalNodeData>>) {
  return (
    <div
      className={`relative min-h-20 min-w-56 rounded-xl border px-4 py-3 shadow-lg ${
        selected ? "border-cyan-400" : "border-slate-700"
      } bg-slate-950 text-slate-100`}
    >
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-cyan-500" />

      <span
        className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${statusDotClass[data.status]}`}
        title={data.status}
      />
      <div className="flex h-full min-h-14 items-center justify-center text-center text-sm font-semibold leading-tight">
        {data.title || "Untitled goal"}
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-cyan-500" />
    </div>
  );
}

const statusOptions: GoalStatus[] = ["TODO", "ACTIVE", "DONE", "BLOCKED", "DROPPED"];

function toFlowNode(goal: ApiGoal): Node<GoalNodeData> {
  return {
    id: goal.id,
    type: "goalNode",
    position: { x: goal.x, y: goal.y },
    data: {
      title: goal.title,
      status: goal.status,
      priority: goal.priority,
      type: goal.type,
    },
    draggable: true,
  };
}

function toFlowEdge(edge: ApiEdge): Edge {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: "bezier",
  };
}

function spreadOverlappingNodes(nodes: Node<GoalNodeData>[]): Node<GoalNodeData>[] {
  const positions = new Map<string, number>();

  return nodes.map((node) => {
    const key = `${Math.round(node.position.x)}:${Math.round(node.position.y)}`;
    const offsetIndex = positions.get(key) ?? 0;
    positions.set(key, offsetIndex + 1);

    if (offsetIndex === 0) {
      return node;
    }

    return {
      ...node,
      position: {
        x: node.position.x + offsetIndex * 26,
        y: node.position.y + offsetIndex * 20,
      },
    };
  });
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? "Request failed");
  }
  return payload as T;
}

type GoalGraphClientInnerProps = {
  initialGraph: GraphResponse;
};

function GoalGraphClientInner({ initialGraph }: GoalGraphClientInnerProps) {
  const [nodes, setNodes] = useState<Node<GoalNodeData>[]>(() =>
    spreadOverlappingNodes(initialGraph.goals.map(toFlowNode)),
  );
  const [edges, setEdges] = useState<Edge[]>(() => initialGraph.edges.map(toFlowEdge));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const selectedGoalNode = useMemo(
    () => nodes.find((node) => node.id === selectedGoalId) ?? null,
    [nodes, selectedGoalId],
  );
  const nodeTypes = useMemo(() => ({ goalNode: GoalNode }), []);

  const getNextGoalPosition = useCallback(() => {
    const index = nodes.length;
    const column = index % 4;
    const row = Math.floor(index / 4);
    return {
      x: 120 + column * 260,
      y: 120 + row * 140,
    };
  }, [nodes.length]);

  const loadGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/graph");
      const data = await parseJson<GraphResponse>(response);
      setNodes(spreadOverlappingNodes(data.goals.map(toFlowNode)));
      setEdges(data.edges.map(toFlowEdge));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load graph");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGoal = useCallback(async () => {
    const title = window.prompt("Название новой цели");
    if (!title?.trim()) return;
    const { x, y } = getNextGoalPosition();

    setError(null);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type: "TASK",
          priority: 3,
          x,
          y,
        }),
      });
      const goal = await parseJson<ApiGoal>(response);
      setNodes((prev) => [...prev, toFlowNode(goal)]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create goal");
    }
  }, [getNextGoalPosition]);

  const updateGoal = useCallback(
    async (patch: Partial<Pick<ApiGoal, "title" | "status" | "priority">>) => {
      if (!selectedGoalId) return;
      setError(null);

      try {
        const response = await fetch(`/api/goals/${selectedGoalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        const updated = await parseJson<ApiGoal>(response);
        setNodes((prev) =>
          prev.map((node) =>
            node.id === updated.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    title: updated.title,
                    status: updated.status,
                    priority: updated.priority,
                  },
                }
              : node,
          ),
        );
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Failed to update goal");
      }
    },
    [selectedGoalId],
  );

  const deleteGoal = useCallback(async () => {
    if (!selectedGoalId) return;
    if (!window.confirm("Удалить цель и связанные связи?")) return;
    setError(null);

    try {
      const response = await fetch(`/api/goals/${selectedGoalId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete goal");
      }
      setNodes((prev) => prev.filter((node) => node.id !== selectedGoalId));
      setEdges((prev) =>
        prev.filter((edge) => edge.source !== selectedGoalId && edge.target !== selectedGoalId),
      );
      setSelectedGoalId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete goal");
    }
  }, [selectedGoalId]);

  const onNodesChange = useCallback((changes: NodeChange<Node<GoalNodeData>>[]) => {
    setNodes((prev) => applyNodeChanges<Node<GoalNodeData>>(changes, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((prev) => applyEdgeChanges<Edge>(changes, prev));
  }, []);

  const onConnect = useCallback<OnConnect>(async (connection: Connection) => {
    if (!connection.source || !connection.target) return;

    setError(null);
    try {
      const response = await fetch("/api/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: connection.source,
          targetId: connection.target,
          type: "REQUIRES",
        }),
      });
      const edge = await parseJson<ApiEdge>(response);
      setEdges((prev) => addEdge(toFlowEdge(edge), prev));
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to create edge");
    }
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler<Node<GoalNodeData>>>((_, node) => {
    setSelectedGoalId(node.id);
  }, []);

  const onNodeDragStop = useCallback(async (_: unknown, node: Node<GoalNodeData>) => {
    try {
      await fetch(`/api/goals/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x: node.position.x,
          y: node.position.y,
        }),
      });
    } catch {
      setError("Failed to save node position");
    }
  }, []);

  const onEdgeDoubleClick = useCallback(async (_: unknown, edge: Edge) => {
    if (!window.confirm("Удалить связь?")) return;

    setError(null);
    try {
      const response = await fetch(`/api/edges/${edge.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete edge");
      }
      setEdges((prev) => prev.filter((existing) => existing.id !== edge.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete edge");
    }
  }, []);

  const selectedTitle = selectedGoalNode?.data.title ?? "";
  const selectedStatus = selectedGoalNode?.data.status ?? "TODO";
  const selectedPriority = selectedGoalNode?.data.priority ?? 3;

  return (
    <div className="flex h-full w-full">
      <aside className="w-80 border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">GoalGraph MVP</h1>
          <button
            type="button"
            className="rounded bg-cyan-600 px-3 py-1 text-sm font-medium hover:bg-cyan-500"
            onClick={createGoal}
          >
            Add Goal
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            className="rounded border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
            onClick={loadGraph}
          >
            Refresh
          </button>
          {isLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
        </div>

        {error ? <p className="mb-4 rounded bg-rose-950 p-2 text-sm text-rose-300">{error}</p> : null}

        {selectedGoalNode ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Selected Goal
            </h2>
            <label className="block text-xs text-slate-300">
              Title
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={selectedTitle}
                onChange={(event) => {
                  const title = event.target.value;
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === selectedGoalNode.id
                        ? { ...node, data: { ...node.data, title } }
                        : node,
                    ),
                  );
                }}
                onBlur={() => {
                  void updateGoal({ title: selectedTitle });
                }}
              />
            </label>

            <label className="block text-xs text-slate-300">
              Status
              <select
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={selectedStatus}
                onChange={(event) => {
                  const status = event.target.value as GoalStatus;
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === selectedGoalNode.id
                        ? { ...node, data: { ...node.data, status } }
                        : node,
                    ),
                  );
                  void updateGoal({ status });
                }}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-300">
              Priority
              <input
                type="number"
                min={1}
                max={5}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={selectedPriority}
                onChange={(event) => {
                  const priority = Math.min(5, Math.max(1, Number(event.target.value || 3)));
                  setNodes((prev) =>
                    prev.map((node) =>
                      node.id === selectedGoalNode.id
                        ? { ...node, data: { ...node.data, priority } }
                        : node,
                    ),
                  );
                }}
                onBlur={() => {
                  void updateGoal({ priority: selectedPriority });
                }}
              />
            </label>

            <button
              type="button"
              className="w-full rounded bg-rose-700 px-3 py-2 text-sm font-medium hover:bg-rose-600"
              onClick={deleteGoal}
            >
              Delete Goal
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Выберите ноду, чтобы отредактировать цель. Double click по edge удаляет связь.
          </p>
        )}
      </aside>

      <section className="h-full flex-1 bg-slate-900">
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          fitView
        >
          <Background />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </section>
    </div>
  );
}

type GoalGraphClientProps = {
  initialGraph: GraphResponse;
};

export function GoalGraphClient({ initialGraph }: GoalGraphClientProps) {
  return (
    <ReactFlowProvider>
      <GoalGraphClientInner initialGraph={initialGraph} />
    </ReactFlowProvider>
  );
}
