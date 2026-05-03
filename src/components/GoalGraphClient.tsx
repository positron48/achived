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

import type {
  ApiEdge,
  ApiGoal,
  ComputedState,
  GoalStatus,
  GoalType,
  GraphResponse,
  NextGoalItem,
} from "@/lib/graph-types";

type GoalNodeData = {
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
  computedState: ComputedState;
};

const statusDotClass: Record<GoalStatus, string> = {
  TODO: "bg-slate-400",
  ACTIVE: "bg-cyan-400",
  DONE: "bg-emerald-400",
  BLOCKED: "bg-amber-400",
  DROPPED: "bg-rose-400",
};

function GoalNode({ data, selected }: NodeProps<Node<GoalNodeData>>) {
  const borderByComputed: Record<ComputedState, string> = {
    AVAILABLE: "border-emerald-400",
    ACTIVE: "border-cyan-400",
    LOCKED: "border-slate-700",
    BLOCKED: "border-amber-400",
    DONE: "border-emerald-700",
    DROPPED: "border-rose-700",
  };

  return (
    <div
      className={`relative min-h-20 min-w-56 rounded-xl border px-4 py-3 shadow-lg ${
        selected ? "ring-2 ring-cyan-300" : ""
      } bg-slate-950 text-slate-100`}
    >
      <div className={`absolute inset-0 rounded-xl border ${borderByComputed[data.computedState]}`} />
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-cyan-500" />

      <span
        className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ${statusDotClass[data.status]}`}
        title={data.status}
      />
      <div className="relative z-10 flex h-full min-h-14 items-center justify-center text-center text-sm font-semibold leading-tight">
        {data.title || "Untitled goal"}
      </div>

      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-cyan-500" />
    </div>
  );
}

const statusOptions: GoalStatus[] = ["TODO", "ACTIVE", "DONE", "BLOCKED", "DROPPED"];
const typeOptions: GoalType[] = ["EPIC", "MILESTONE", "TASK", "HABIT"];

function getComputedState(
  node: Node<GoalNodeData>,
  nodes: Node<GoalNodeData>[],
  edges: Edge[],
): ComputedState {
  if (node.data.status === "DONE") return "DONE";
  if (node.data.status === "DROPPED") return "DROPPED";
  if (node.data.status === "BLOCKED") return "BLOCKED";

  const blockers = edges
    .filter((edge) => edge.source && edge.target === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.source))
    .filter((candidate): candidate is Node<GoalNodeData> => Boolean(candidate))
    .filter((candidate) => candidate.data.status !== "DONE");

  if (blockers.length > 0) return "LOCKED";
  if (node.data.status === "ACTIVE") return "ACTIVE";
  return "AVAILABLE";
}

function applyComputedStates(nodes: Node<GoalNodeData>[], edges: Edge[]) {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      computedState: getComputedState(node, nodes, edges),
    },
  }));
}

function toFlowNode(goal: ApiGoal): Node<GoalNodeData> {
  return {
    id: goal.id,
    type: "goalNode",
    position: { x: goal.x, y: goal.y },
    data: {
      title: goal.title,
      description: goal.description ?? "",
      status: goal.status,
      priority: goal.priority,
      type: goal.type,
      computedState: "AVAILABLE",
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

function buildFlowNodes(goals: ApiGoal[], edges: ApiEdge[]) {
  const flowEdges = edges.map(toFlowEdge);
  const baseNodes = spreadOverlappingNodes(goals.map(toFlowNode));
  return applyComputedStates(baseNodes, flowEdges);
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
  initialNext: NextGoalItem[];
};

function GoalGraphClientInner({ initialGraph, initialNext }: GoalGraphClientInnerProps) {
  const [nodes, setNodes] = useState<Node<GoalNodeData>[]>(() =>
    buildFlowNodes(initialGraph.goals, initialGraph.edges),
  );
  const [edges, setEdges] = useState<Edge[]>(() => initialGraph.edges.map(toFlowEdge));
  const [nextGoals, setNextGoals] = useState<NextGoalItem[]>(initialNext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const selectedGoalNode = useMemo(
    () => nodes.find((node) => node.id === selectedGoalId) ?? null,
    [nodes, selectedGoalId],
  );
  const nodeTypes = useMemo(() => ({ goalNode: GoalNode }), []);
  const activeGoals = useMemo(
    () => nextGoals.filter((goal) => goal.computedState === "ACTIVE"),
    [nextGoals],
  );
  const availableGoals = useMemo(
    () => nextGoals.filter((goal) => goal.computedState === "AVAILABLE"),
    [nextGoals],
  );
  const blockedGoals = useMemo(
    () =>
      nodes
        .filter((node) => node.data.computedState === "LOCKED" || node.data.computedState === "BLOCKED")
        .map((node) => node.data.title),
    [nodes],
  );
  const recentDone = useMemo(
    () =>
      nodes
        .filter((node) => node.data.computedState === "DONE")
        .slice(-6)
        .reverse()
        .map((node) => node.data.title),
    [nodes],
  );

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
      const nextEdges = data.edges.map(toFlowEdge);
      setNodes(buildFlowNodes(data.goals, data.edges));
      setEdges(nextEdges);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load graph");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadNext = useCallback(async () => {
    try {
      const response = await fetch("/api/next");
      const data = await parseJson<NextGoalItem[]>(response);
      setNextGoals(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load next goals");
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
      setNodes((prev) => applyComputedStates([...prev, toFlowNode(goal)], edges));
      void loadNext();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create goal");
    }
  }, [edges, getNextGoalPosition, loadNext]);

  const updateGoal = useCallback(
    async (
      goalId: string,
      patch: Partial<Pick<ApiGoal, "title" | "description" | "status" | "priority" | "type" | "x" | "y">>,
    ) => {
      setError(null);

      try {
        const response = await fetch(`/api/goals/${goalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        const updated = await parseJson<ApiGoal>(response);
        setNodes((prev) =>
          applyComputedStates(
            prev.map((node) =>
              node.id === updated.id
                ? {
                    ...node,
                    position: { x: updated.x, y: updated.y },
                    data: {
                      ...node.data,
                      title: updated.title,
                      description: updated.description,
                      status: updated.status,
                      priority: updated.priority,
                      type: updated.type,
                    },
                  }
                : node,
            ),
            edges,
          ),
        );
        void loadNext();
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Failed to update goal");
      }
    },
    [edges, loadNext],
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
      const nextEdges = edges.filter(
        (edge) => edge.source !== selectedGoalId && edge.target !== selectedGoalId,
      );
      setEdges(nextEdges);
      setSelectedGoalId(null);
      void loadNext();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete goal");
    }
  }, [edges, loadNext, selectedGoalId]);

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
      setEdges((prev) => {
        const nextEdges = addEdge(toFlowEdge(edge), prev);
        setNodes((currentNodes) => applyComputedStates(currentNodes, nextEdges));
        return nextEdges;
      });
      void loadNext();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Failed to create edge");
    }
  }, [loadNext]);

  const onNodeClick = useCallback<NodeMouseHandler<Node<GoalNodeData>>>((_, node) => {
    setSelectedGoalId(node.id);
  }, []);

  const onNodeDragStop = useCallback(async (_: unknown, node: Node<GoalNodeData>) => {
    try {
      await updateGoal(node.id, {
        x: node.position.x,
        y: node.position.y,
      });
    } catch {
      setError("Failed to save node position");
    }
  }, [updateGoal]);

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
      setEdges((prev) => {
        const nextEdges = prev.filter((existing) => existing.id !== edge.id);
        setNodes((currentNodes) => applyComputedStates(currentNodes, nextEdges));
        return nextEdges;
      });
      void loadNext();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete edge");
    }
  }, [loadNext]);

  const selectedBlockedBy = useMemo(() => {
    if (!selectedGoalNode) return [];
    const blockers = edges
      .filter((edge) => edge.target === selectedGoalNode.id)
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter((node): node is Node<GoalNodeData> => Boolean(node));

    return blockers.map((node) => node.data.title);
  }, [edges, nodes, selectedGoalNode]);

  const selectedUnlocks = useMemo(() => {
    if (!selectedGoalNode) return [];
    const unlocked = edges
      .filter((edge) => edge.source === selectedGoalNode.id)
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .filter((node): node is Node<GoalNodeData> => Boolean(node));

    return unlocked.map((node) => node.data.title);
  }, [edges, nodes, selectedGoalNode]);

  const selectedTitle = selectedGoalNode?.data.title ?? "";
  const selectedDescription = selectedGoalNode?.data.description ?? "";
  const selectedStatus = selectedGoalNode?.data.status ?? "TODO";
  const selectedPriority = selectedGoalNode?.data.priority ?? 3;
  const selectedType = selectedGoalNode?.data.type ?? "TASK";

  const setNodeField = useCallback(
    (goalId: string, patch: Partial<GoalNodeData>) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === goalId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      );
    },
    [],
  );

  const quickSetStatus = useCallback(
    async (goalId: string, status: GoalStatus) => {
      setNodeField(goalId, { status });
      await updateGoal(goalId, { status });
    },
    [setNodeField, updateGoal],
  );

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
          <button
            type="button"
            className="rounded border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
            onClick={() => {
              void loadNext();
            }}
          >
            Next
          </button>
          {isLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
        </div>

        {error ? <p className="mb-4 rounded bg-rose-950 p-2 text-sm text-rose-300">{error}</p> : null}

        <div className="space-y-5">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Active</h2>
            <div className="space-y-2">
              {activeGoals.length === 0 ? (
                <p className="text-sm text-slate-500">Нет активных</p>
              ) : (
                activeGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="w-full cursor-pointer rounded border border-slate-800 bg-slate-900 px-2 py-2 text-left hover:bg-slate-800"
                    onClick={() => setSelectedGoalId(goal.id)}
                  >
                    <div className="text-sm font-medium">{goal.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>{goal.type}</span>
                      <span>P{goal.priority}</span>
                    </div>
                    <button
                      type="button"
                      className="mt-2 rounded bg-emerald-700 px-2 py-0.5 text-xs hover:bg-emerald-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        void quickSetStatus(goal.id, "DONE");
                      }}
                    >
                      Done
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Available next
            </h2>
            <div className="space-y-2">
              {availableGoals.length === 0 ? (
                <p className="text-sm text-slate-500">Нет доступных</p>
              ) : (
                availableGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="w-full cursor-pointer rounded border border-slate-800 bg-slate-900 px-2 py-2 text-left hover:bg-slate-800"
                    onClick={() => setSelectedGoalId(goal.id)}
                  >
                    <div className="text-sm font-medium">{goal.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>{goal.type}</span>
                      <span>P{goal.priority}</span>
                    </div>
                    <button
                      type="button"
                      className="mt-2 rounded bg-cyan-700 px-2 py-0.5 text-xs hover:bg-cyan-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        void quickSetStatus(goal.id, "ACTIVE");
                      }}
                    >
                      Start
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Blocked</h2>
            <div className="space-y-1 text-sm text-slate-400">
              {blockedGoals.length === 0 ? (
                <p className="text-slate-500">Нет</p>
              ) : (
                blockedGoals.map((title) => <p key={title}>- {title}</p>)
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recently done
            </h2>
            <div className="space-y-1 text-sm text-slate-400">
              {recentDone.length === 0 ? (
                <p className="text-slate-500">Пока пусто</p>
              ) : (
                recentDone.map((title) => <p key={title}>- {title}</p>)
              )}
            </div>
          </div>
        </div>
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

      <aside className="w-96 border-l border-slate-800 bg-slate-950 p-4">
        {selectedGoalNode ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Goal Drawer
            </h2>

            <label className="block text-xs text-slate-300">
              Title
              <input
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={selectedTitle}
                onChange={(event) => setNodeField(selectedGoalNode.id, { title: event.target.value })}
              />
            </label>

            <label className="block text-xs text-slate-300">
              Description
              <textarea
                className="mt-1 h-24 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={selectedDescription}
                onChange={(event) =>
                  setNodeField(selectedGoalNode.id, { description: event.target.value })
                }
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-slate-300">
                Type
                <select
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={selectedType}
                  onChange={(event) =>
                    setNodeField(selectedGoalNode.id, { type: event.target.value as GoalType })
                  }
                >
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-slate-300">
                Status
                <select
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                  value={selectedStatus}
                  onChange={(event) =>
                    setNodeField(selectedGoalNode.id, { status: event.target.value as GoalStatus })
                  }
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-xs text-slate-300">
              Priority
              <input
                type="number"
                min={1}
                max={5}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={selectedPriority}
                onChange={(event) =>
                  setNodeField(selectedGoalNode.id, {
                    priority: Math.min(5, Math.max(1, Number(event.target.value || 3))),
                  })
                }
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-cyan-700 px-3 py-1.5 text-sm hover:bg-cyan-600"
                onClick={() =>
                  void updateGoal(selectedGoalNode.id, {
                    title: selectedTitle,
                    description: selectedDescription,
                    type: selectedType,
                    status: selectedStatus,
                    priority: selectedPriority,
                  })
                }
              >
                Save
              </button>
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600"
                onClick={() => void quickSetStatus(selectedGoalNode.id, "DONE")}
              >
                Mark done
              </button>
              <button
                type="button"
                className="rounded bg-sky-700 px-3 py-1.5 text-sm hover:bg-sky-600"
                onClick={() => void quickSetStatus(selectedGoalNode.id, "ACTIVE")}
              >
                Mark active
              </button>
              <button
                type="button"
                className="rounded bg-rose-700 px-3 py-1.5 text-sm hover:bg-rose-600"
                onClick={() => void quickSetStatus(selectedGoalNode.id, "DROPPED")}
              >
                Drop
              </button>
            </div>

            <button
              type="button"
              className="w-full rounded bg-rose-900 px-3 py-2 text-sm font-medium hover:bg-rose-800"
              onClick={deleteGoal}
            >
              Delete Goal
            </button>

            <div className="rounded border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
              <p className="mb-1 font-semibold">Blocked by:</p>
              {selectedBlockedBy.length === 0 ? (
                <p className="text-slate-500">- none</p>
              ) : (
                selectedBlockedBy.map((title) => <p key={title}>- {title}</p>)
              )}

              <p className="mb-1 mt-3 font-semibold">Unlocks:</p>
              {selectedUnlocks.length === 0 ? (
                <p className="text-slate-500">- none</p>
              ) : (
                selectedUnlocks.map((title) => <p key={title}>- {title}</p>)
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Выберите ноду, чтобы открыть drawer. Double click по edge удаляет связь.
          </p>
        )}
      </aside>
    </div>
  );
}

type GoalGraphClientProps = {
  initialGraph: GraphResponse;
  initialNext: NextGoalItem[];
};

export function GoalGraphClient({ initialGraph, initialNext }: GoalGraphClientProps) {
  return (
    <ReactFlowProvider>
      <GoalGraphClientInner initialGraph={initialGraph} initialNext={initialNext} />
    </ReactFlowProvider>
  );
}
