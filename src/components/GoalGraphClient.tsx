"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type ConnectionLineComponentProps,
  ConnectionLineType,
  type Connection,
  Controls,
  type EdgeProps,
  getStraightPath,
  Handle,
  MiniMap,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useInternalNode,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useRef, useState } from "react";

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
  isConnecting: boolean;
};

const DEFAULT_NODE_WIDTH = 256;
const DEFAULT_NODE_HEIGHT = 96;
const EDGE_STROKE = "rgba(216,200,168,.42)";
const EDGE_WIDTH = 1.2;
const EDGE_HIT_WIDTH = EDGE_WIDTH + 4;
const EDGE_ARROW_LENGTH = 12;
const EDGE_ARROW_HALF_WIDTH = 4;

const statusLabel: Record<GoalStatus, string> = {
  TODO: "В планах",
  ACTIVE: "В работе",
  DONE: "Готово",
  BLOCKED: "Заблокировано",
  DROPPED: "Отменено",
};

const typeLabel: Record<GoalType, string> = {
  EPIC: "Эпик",
  MILESTONE: "Майлстоун",
  TASK: "Задача",
  HABIT: "Привычка",
};

const priorityLabel = (priority: number) => {
  if (priority >= 4) return "Высокий";
  if (priority >= 2) return "Средний";
  return "Низкий";
};

const priorityTone = (priority: number) => {
  if (priority >= 4) return "text-[#D47758]";
  if (priority >= 2) return "text-[#D39A43]";
  return "text-[#8B944C]";
};

const stateTone: Record<
  ComputedState,
  {
    border: string;
    chip: string;
    dot: string;
    card: string;
  }
> = {
  AVAILABLE: {
    border: "border-[#8B944C]/65",
    chip: "text-[#A1AA7B] bg-[#8B944C]/15 border-[#8B944C]/45",
    dot: "bg-[#8B944C]",
    card: "bg-[#1E211F]",
  },
  ACTIVE: {
    border: "border-[#B96745]/75",
    chip: "text-[#D8C8A8] bg-[#B96745]/15 border-[#B96745]/55",
    dot: "bg-[#D39A43]",
    card: "bg-[#211E1A]",
  },
  LOCKED: {
    border: "border-white/10",
    chip: "text-[#8A857B] bg-white/[0.03] border-white/10",
    dot: "bg-[#777268]",
    card: "bg-[#191B1A]",
  },
  BLOCKED: {
    border: "border-[#8A536B]/55",
    chip: "text-[#BA9CAA] bg-[#8A536B]/15 border-[#8A536B]/40",
    dot: "bg-[#8A536B]",
    card: "bg-[#1A191C]",
  },
  DONE: {
    border: "border-[#A1AA7B]/55",
    chip: "text-[#C7D39B] bg-[#A1AA7B]/15 border-[#A1AA7B]/35",
    dot: "bg-[#A1AA7B]",
    card: "bg-[#1B1E1A]",
  },
  DROPPED: {
    border: "border-[#A94F3D]/50",
    chip: "text-[#CD9B90] bg-[#A94F3D]/15 border-[#A94F3D]/40",
    dot: "bg-[#A94F3D]",
    card: "bg-[#1B1918]",
  },
};

const stateTitle: Record<ComputedState, string> = {
  AVAILABLE: "Доступно",
  ACTIVE: "В работе",
  LOCKED: "Ждет зависимости",
  BLOCKED: "Заблокировано",
  DONE: "Завершено",
  DROPPED: "Отменено",
};

type RectNode = {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
};

function getIntersectionPoint(from: RectNode, to: RectNode) {
  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;
  const ratio = Math.max(
    Math.abs(dx) / Math.max(from.halfW, 1),
    Math.abs(dy) / Math.max(from.halfH, 1),
  );

  if (!Number.isFinite(ratio) || ratio === 0) {
    return { x: from.centerX, y: from.centerY };
  }

  return {
    x: from.centerX + dx / ratio,
    y: from.centerY + dy / ratio,
  };
}

function nudgePointTowards(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);

  if (!len || !Number.isFinite(len)) return from;

  return {
    x: from.x + (dx / len) * distance,
    y: from.y + (dy / len) * distance,
  };
}

function rectCenter(rect: RectNode): { x: number; y: number } {
  return { x: rect.centerX, y: rect.centerY };
}

function getArrowPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = end.x - ux * EDGE_ARROW_LENGTH;
  const baseY = end.y - uy * EDGE_ARROW_LENGTH;
  const perpX = -uy;
  const perpY = ux;

  return `M ${end.x} ${end.y} L ${baseX + perpX * EDGE_ARROW_HALF_WIDTH} ${
    baseY + perpY * EDGE_ARROW_HALF_WIDTH
  } L ${baseX - perpX * EDGE_ARROW_HALF_WIDTH} ${baseY - perpY * EDGE_ARROW_HALF_WIDTH} Z`;
}

function BoundaryStraightEdge({ id, source, target, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const sourceWidth = sourceNode.measured.width ?? sourceNode.width ?? DEFAULT_NODE_WIDTH;
  const sourceHeight = sourceNode.measured.height ?? sourceNode.height ?? DEFAULT_NODE_HEIGHT;
  const targetWidth = targetNode.measured.width ?? targetNode.width ?? DEFAULT_NODE_WIDTH;
  const targetHeight = targetNode.measured.height ?? targetNode.height ?? DEFAULT_NODE_HEIGHT;

  const sourceRect: RectNode = {
    centerX: sourceNode.internals.positionAbsolute.x + sourceWidth / 2,
    centerY: sourceNode.internals.positionAbsolute.y + sourceHeight / 2,
    halfW: sourceWidth / 2,
    halfH: sourceHeight / 2,
  };
  const targetRect: RectNode = {
    centerX: targetNode.internals.positionAbsolute.x + targetWidth / 2,
    centerY: targetNode.internals.positionAbsolute.y + targetHeight / 2,
    halfW: targetWidth / 2,
    halfH: targetHeight / 2,
  };

  const sourcePoint = nudgePointTowards(
    getIntersectionPoint(sourceRect, targetRect),
    rectCenter(targetRect),
    1,
  );
  const targetPoint = getIntersectionPoint(targetRect, sourceRect);

  const [edgePath] = getStraightPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
  });
  const arrowPath = getArrowPath(sourcePoint, targetPoint);

  return (
    <g data-id={id}>
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={EDGE_HIT_WIDTH}
        pointerEvents="stroke"
      />
      <path d={edgePath} fill="none" stroke={EDGE_STROKE} strokeWidth={EDGE_WIDTH} style={style} />
      <path
        d={arrowPath}
        fill="rgba(0,0,0,0.001)"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={4}
        pointerEvents="all"
      />
      <path d={arrowPath} fill={EDGE_STROKE} />
    </g>
  );
}

function BoundaryConnectionLine({
  fromNode,
  toNode,
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  const sourceWidth = fromNode ? (fromNode.measured.width ?? fromNode.width ?? DEFAULT_NODE_WIDTH) : 0;
  const sourceHeight = fromNode ? (fromNode.measured.height ?? fromNode.height ?? DEFAULT_NODE_HEIGHT) : 0;
  const targetWidth = toNode ? (toNode.measured.width ?? toNode.width ?? DEFAULT_NODE_WIDTH) : 0;
  const targetHeight = toNode ? (toNode.measured.height ?? toNode.height ?? DEFAULT_NODE_HEIGHT) : 0;

  const sourceRect: RectNode | null = fromNode
    ? {
        centerX: fromNode.internals.positionAbsolute.x + sourceWidth / 2,
        centerY: fromNode.internals.positionAbsolute.y + sourceHeight / 2,
        halfW: sourceWidth / 2,
        halfH: sourceHeight / 2,
      }
    : null;

  const targetRect: RectNode | null = toNode
    ? {
        centerX: toNode.internals.positionAbsolute.x + targetWidth / 2,
        centerY: toNode.internals.positionAbsolute.y + targetHeight / 2,
        halfW: targetWidth / 2,
        halfH: targetHeight / 2,
      }
    : null;

  const sourceAnchor = sourceRect
    ? nudgePointTowards(
        getIntersectionPoint(sourceRect, targetRect ?? { centerX: toX, centerY: toY, halfW: 1, halfH: 1 }),
        targetRect ? rectCenter(targetRect) : { x: toX, y: toY },
        1,
      )
    : { x: fromX, y: fromY };
  const targetAnchor = targetRect
    ? getIntersectionPoint(targetRect, sourceRect ?? { centerX: fromX, centerY: fromY, halfW: 1, halfH: 1 })
    : { x: toX, y: toY };

  const arrowPath = getArrowPath(sourceAnchor, targetAnchor);

  return (
    <g>
      <path
        d={`M ${sourceAnchor.x} ${sourceAnchor.y} L ${targetAnchor.x} ${targetAnchor.y}`}
        fill="none"
        stroke={EDGE_STROKE}
        strokeWidth={EDGE_WIDTH}
      />
      <path d={arrowPath} fill={EDGE_STROKE} />
    </g>
  );
}

function GoalNode({ data, selected }: NodeProps<Node<GoalNodeData>>) {
  const tone = stateTone[data.computedState];
  const isDimmed = data.computedState === "LOCKED" || data.computedState === "BLOCKED";
  const canDropNow = data.isConnecting;
  const targetHandleStyle = {
    left: "-3px",
    top: "-3px",
    width: "calc(100% + 6px)",
    height: "calc(100% + 6px)",
    transform: "none",
    borderRadius: "19px",
    background: "transparent",
    border: "none",
    opacity: 0,
    zIndex: canDropNow ? 35 : 0,
    pointerEvents: canDropNow ? ("all" as const) : ("none" as const),
  };
  const sourceHandleBaseStyle = {
    transform: "none",
    borderRadius: 0,
    background: "transparent",
    border: "none",
    opacity: 0,
    zIndex: 40,
    pointerEvents: canDropNow ? ("none" as const) : ("all" as const),
  };

  return (
    <div
      className={`relative min-h-24 min-w-64 rounded-2xl border px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,.25)] transition ${
        tone.border
      } ${tone.card} ${isDimmed ? "opacity-[0.64] saturate-[0.58]" : ""} ${
        selected ? "ring-1 ring-[#D39A43] shadow-[0_0_0_1px_rgba(211,154,67,.7),0_0_28px_rgba(211,154,67,.16)]" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={targetHandleStyle}
        isConnectableStart={false}
        isConnectableEnd
      />
      <Handle
        id="source-top"
        type="source"
        position={Position.Top}
        isConnectableStart
        isConnectableEnd={false}
        style={{
          ...sourceHandleBaseStyle,
          left: 0,
          top: "-3px",
          width: "100%",
          height: "6px",
        }}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        isConnectableStart
        isConnectableEnd={false}
        style={{
          ...sourceHandleBaseStyle,
          right: "-3px",
          top: 0,
          width: "6px",
          height: "100%",
        }}
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        isConnectableStart
        isConnectableEnd={false}
        style={{
          ...sourceHandleBaseStyle,
          left: 0,
          bottom: "-3px",
          width: "100%",
          height: "6px",
        }}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        isConnectableStart
        isConnectableEnd={false}
        style={{
          ...sourceHandleBaseStyle,
          left: "-3px",
          top: 0,
          width: "6px",
          height: "100%",
        }}
      />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-[#F2EEE6]">{data.title || "Untitled goal"}</p>
          <p className="mt-1 text-[11px] text-[#B8B0A3]">{typeLabel[data.type]}</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${tone.dot}`} />
      </div>

      <div className="relative z-10 mt-3 flex items-center justify-between">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${tone.chip}`}>{stateTitle[data.computedState]}</span>
        <span className={`text-[11px] ${priorityTone(data.priority)}`}>⚑ {priorityLabel(data.priority)}</span>
      </div>

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
      isConnecting: false,
    },
    draggable: true,
  };
}

function toFlowEdge(edge: ApiEdge): Edge {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: "boundaryStraight",
  };
}

function getConnectErrorMessage(rawMessage: string) {
  if (rawMessage.includes("Duplicate edge")) {
    return "Такая связь уже существует.";
  }
  if (rawMessage.includes("Cycle detected")) {
    return "Нельзя создать связь: получится цикл зависимостей.";
  }
  if (rawMessage.includes("Self-edge")) {
    return "Нельзя создавать связь цели с самой собой.";
  }
  return rawMessage;
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
  const reactFlow = useReactFlow<Node<GoalNodeData>, Edge>();
  const flowSectionRef = useRef<HTMLElement | null>(null);
  const [nodes, setNodes] = useState<Node<GoalNodeData>[]>(() =>
    buildFlowNodes(initialGraph.goals, initialGraph.edges),
  );
  const [edges, setEdges] = useState<Edge[]>(() => initialGraph.edges.map(toFlowEdge));
  const [nextGoals, setNextGoals] = useState<NextGoalItem[]>(initialNext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const selectedGoalNode = useMemo(
    () => nodes.find((node) => node.id === selectedGoalId) ?? null,
    [nodes, selectedGoalId],
  );
  const nodeTypes = useMemo(() => ({ goalNode: GoalNode }), []);
  const edgeTypes = useMemo(() => ({ boundaryStraight: BoundaryStraightEdge }), []);
  const activeGoals = useMemo(
    () => nextGoals.filter((goal) => goal.computedState === "ACTIVE"),
    [nextGoals],
  );
  const availableGoals = useMemo(
    () => nextGoals.filter((goal) => goal.computedState === "AVAILABLE"),
    [nextGoals],
  );
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = useCallback(
    (title: string) => (query.length === 0 ? true : title.toLowerCase().includes(query)),
    [query],
  );
  const activeGoalsFiltered = useMemo(
    () => activeGoals.filter((goal) => matchesSearch(goal.title)),
    [activeGoals, matchesSearch],
  );
  const availableGoalsFiltered = useMemo(
    () => availableGoals.filter((goal) => matchesSearch(goal.title)),
    [availableGoals, matchesSearch],
  );
  const blockedGoals = useMemo(
    () =>
      nodes
        .filter((node) => node.data.computedState === "LOCKED" || node.data.computedState === "BLOCKED")
        .map((node) => node.data.title),
    [nodes],
  );
  const blockedGoalsFiltered = useMemo(
    () => blockedGoals.filter((title) => matchesSearch(title)),
    [blockedGoals, matchesSearch],
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
  const recentDoneFiltered = useMemo(
    () => recentDone.filter((title) => matchesSearch(title)),
    [matchesSearch, recentDone],
  );
  const visibleNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        hidden: query.length === 0 ? false : !matchesSearch(node.data.title),
        data: {
          ...node.data,
          isConnecting,
        },
      })),
    [isConnecting, matchesSearch, nodes, query.length],
  );
  const focusCount = activeGoals.length;
  const startableCount = availableGoals.length;
  const blockedCount = blockedGoals.length;
  const doneCount = nodes.filter((node) => node.data.computedState === "DONE").length;

  const getNextGoalPosition = useCallback(() => {
    const flowSection = flowSectionRef.current;
    if (!flowSection) {
      return { x: 120, y: 120 };
    }

    const bounds = flowSection.getBoundingClientRect();
    const centerPosition = reactFlow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
    return {
      x: centerPosition.x - DEFAULT_NODE_WIDTH / 2,
      y: centerPosition.y - DEFAULT_NODE_HEIGHT / 2,
    };
  }, [reactFlow]);

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
      if (connectError instanceof Error) {
        setError(getConnectErrorMessage(connectError.message));
      } else {
        setError("Не удалось создать связь.");
      }
    }
  }, [loadNext]);

  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

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
        applyComputedStates(
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
          edges,
        ),
      );
    },
    [edges],
  );

  const quickSetStatus = useCallback(
    async (goalId: string, status: GoalStatus) => {
      setNodeField(goalId, { status });
      await updateGoal(goalId, { status });
    },
    [setNodeField, updateGoal],
  );

  return (
    <div className="flex h-full w-full flex-col bg-[#101211] text-[#F2EEE6]">
      <header className="flex h-20 items-center gap-5 border-b border-white/10 bg-[#111312] px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-[#1C1F1D] text-[#D8C8A8]">
            ◈
          </div>
          <p className="text-2xl font-medium tracking-tight">GoalGraph</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-[#181B1A] px-3">
            <span className="text-[#777268]">⌕</span>
            <input
              className="h-full w-full bg-transparent text-sm text-[#F2EEE6] outline-none placeholder:text-[#777268]"
              placeholder="Поиск целей, тегов, заметок..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="h-10 rounded-xl bg-[#B96745] px-4 text-sm font-medium text-[#F2EEE6] transition hover:bg-[#C47657]"
          onClick={createGoal}
        >
          + Новая цель
        </button>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#181B1A] text-[#B8B0A3] transition hover:bg-white/5 hover:text-[#F2EEE6]"
          onClick={loadGraph}
          title="Обновить граф"
          aria-label="Обновить граф"
        >
          ↻
        </button>

        <div className="flex items-center gap-4 text-xs text-[#B8B0A3]">
          <div className="text-right">
            <p className="text-[#F2EEE6]">{focusCount}</p>
            <p>в работе</p>
          </div>
          <div className="text-right">
            <p className="text-[#F2EEE6]">{startableCount}</p>
            <p>можно начать</p>
          </div>
          <div className="text-right">
            <p className="text-[#F2EEE6]">{doneCount}</p>
            <p>done</p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[300px] overflow-y-auto border-r border-white/10 bg-[#171918] p-4">
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#8A857B]">В работе</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#B8B0A3]">
                  {activeGoalsFiltered.length}
                </span>
              </div>
              <div className="space-y-2">
                {activeGoalsFiltered.length === 0 ? (
                  <p className="text-sm text-[#777268]">Пока пусто</p>
                ) : (
                  activeGoalsFiltered.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      className="w-full rounded-xl border border-[#B96745]/35 bg-[#201D1A] px-3 py-2 text-left transition hover:border-[#B96745]/55"
                      onClick={() => setSelectedGoalId(goal.id)}
                    >
                      <p className="truncate text-sm font-medium text-[#F2EEE6]">{goal.title}</p>
                      <p className="mt-1 text-[11px] text-[#B8B0A3]">{typeLabel[goal.type]}</p>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#8A857B]">Можно начать</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#B8B0A3]">
                  {availableGoalsFiltered.length}
                </span>
              </div>
              <div className="space-y-2">
                {availableGoalsFiltered.length === 0 ? (
                  <p className="text-sm text-[#777268]">Нет доступных</p>
                ) : (
                  availableGoalsFiltered.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      className="w-full rounded-xl border border-[#8B944C]/35 bg-[#1D211D] px-3 py-2 text-left transition hover:border-[#8B944C]/55"
                      onClick={() => setSelectedGoalId(goal.id)}
                    >
                      <p className="truncate text-sm font-medium text-[#F2EEE6]">{goal.title}</p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[#B8B0A3]">
                        <span>{typeLabel[goal.type]}</span>
                        <span className={priorityTone(goal.priority)}>⚑ {priorityLabel(goal.priority)}</span>
                      </div>
                      <span className="mt-2 inline-flex rounded-full bg-[#8B944C]/20 px-2 py-0.5 text-[10px] text-[#C7D39B]">
                        Доступно
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[#8A857B]">Заблокировано</h3>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#B8B0A3]">
                  {blockedCount}
                </span>
              </div>
              <div className="space-y-1 text-sm text-[#6F6A62]">
                {blockedGoalsFiltered.length === 0 ? (
                  <p className="text-[#777268]">Нет</p>
                ) : (
                  blockedGoalsFiltered.map((title) => <p key={title}>• {title}</p>)
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-[#8A857B]">
                Недавно завершено
              </h3>
              <div className="space-y-1 text-sm text-[#8A857B]">
                {recentDoneFiltered.length === 0 ? (
                  <p className="text-[#777268]">Пока пусто</p>
                ) : (
                  recentDoneFiltered.map((title) => <p key={title}>✓ {title}</p>)
                )}
              </div>
            </section>
          </div>
        </aside>

        <section ref={flowSectionRef} className="goal-graph-flow relative h-full min-w-0 flex-1">
          {error ? (
            <div className="absolute left-4 top-4 z-10 rounded-xl border border-[#A94F3D]/40 bg-[#2A1A18] px-3 py-2 text-sm text-[#F3B1A4]">
              {error}
            </div>
          ) : null}

          <ReactFlow
            className="h-full"
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionLineType={ConnectionLineType.Straight}
            connectionLineComponent={BoundaryConnectionLine}
            nodes={visibleNodes}
            edges={edges}
            proOptions={{ hideAttribution: true }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onEdgeDoubleClick={onEdgeDoubleClick}
            defaultEdgeOptions={{
              type: "boundaryStraight",
              style: { stroke: EDGE_STROKE, strokeWidth: EDGE_WIDTH },
            }}
            fitView
          >
            <Background gap={24} size={1} />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              maskColor="rgba(16,18,17,0.25)"
              style={{
                width: 210,
                height: 130,
                borderRadius: 12,
                backgroundColor: "rgba(23,25,24,0.9)",
                border: "1px solid rgba(255,255,255,.06)",
              }}
              nodeColor={(node) => {
                const n = node as Node<GoalNodeData>;
                if (n.data.computedState === "DONE") return "#8B944C";
                if (n.data.computedState === "ACTIVE") return "#B96745";
                if (n.id === selectedGoalId) return "#D39A43";
                if (n.data.computedState === "BLOCKED" || n.data.computedState === "LOCKED") return "#5F4A56";
                return "#6E6A60";
              }}
            />
            <Controls position="bottom-left" />
          </ReactFlow>
          {isLoading ? (
            <div className="absolute bottom-4 left-4 z-10 text-xs text-[#8A857B]">Загрузка...</div>
          ) : null}
        </section>

        <aside className="w-[340px] overflow-y-auto border-l border-white/10 bg-[#171918] px-4 py-5">
          {selectedGoalNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-[#F2EEE6]">{selectedTitle}</h2>
                  <p className="mt-1 text-xs text-[#B8B0A3]">{typeLabel[selectedType]}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-[#B8B0A3] hover:bg-white/5"
                  onClick={() => setSelectedGoalId(null)}
                >
                  Закрыть
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1D201E] px-3 py-2">
                <span className="text-xs text-[#B8B0A3]">Статус</span>
                <span className="rounded-full border border-[#D39A43]/45 bg-[#D39A43]/12 px-2 py-0.5 text-xs text-[#D8C8A8]">
                  {statusLabel[selectedStatus]}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#1D201E] px-3 py-2">
                <p className="text-[11px] text-[#8A857B]">Приоритет</p>
                <p className={`mt-1 text-sm ${priorityTone(selectedPriority)}`}>⚑ {priorityLabel(selectedPriority)}</p>
              </div>

              <label className="block text-xs text-[#B8B0A3]">
                Название
                <input
                  className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedTitle}
                  onChange={(event) => setNodeField(selectedGoalNode.id, { title: event.target.value })}
                />
              </label>

              <label className="block text-xs text-[#B8B0A3]">
                Описание
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 py-2 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedDescription}
                  onChange={(event) =>
                    setNodeField(selectedGoalNode.id, { description: event.target.value })
                  }
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-[#B8B0A3]">
                  Тип
                  <select
                    className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-2 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                    value={selectedType}
                    onChange={(event) =>
                      setNodeField(selectedGoalNode.id, { type: event.target.value as GoalType })
                    }
                  >
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs text-[#B8B0A3]">
                  Статус
                  <select
                    className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-2 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                    value={selectedStatus}
                    onChange={(event) =>
                      setNodeField(selectedGoalNode.id, { status: event.target.value as GoalStatus })
                    }
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs text-[#B8B0A3]">
                Приоритет (1..5)
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedPriority}
                  onChange={(event) =>
                    setNodeField(selectedGoalNode.id, {
                      priority: Math.min(5, Math.max(1, Number(event.target.value || 3))),
                    })
                  }
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[#B96745] text-sm font-medium text-[#F2EEE6] hover:bg-[#C47657]"
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
                  Сохранить
                </button>
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[#8B944C]/35 text-sm text-[#DCE6AA] hover:bg-[#8B944C]/45"
                  onClick={() => void quickSetStatus(selectedGoalNode.id, "DONE")}
                >
                  Отметить done
                </button>
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[#D39A43]/30 text-sm text-[#E6CA96] hover:bg-[#D39A43]/40"
                  onClick={() => void quickSetStatus(selectedGoalNode.id, "ACTIVE")}
                >
                  В работу
                </button>
                <button
                  type="button"
                  className="h-10 rounded-xl bg-[#A94F3D]/30 text-sm text-[#F0B0A0] hover:bg-[#A94F3D]/40"
                  onClick={() => void quickSetStatus(selectedGoalNode.id, "DROPPED")}
                >
                  Отменить
                </button>
              </div>

              <button
                type="button"
                className="h-10 w-full rounded-xl border border-[#A94F3D]/50 bg-[#2A1A18] text-sm text-[#F0B0A0] hover:bg-[#351F1B]"
                onClick={deleteGoal}
              >
                Удалить цель
              </button>

              <div className="rounded-xl border border-white/10 bg-[#1D201E] p-3 text-sm text-[#B8B0A3]">
                <p className="mb-1 text-xs uppercase tracking-[0.06em] text-[#8A857B]">Заблокировано из-за</p>
                {selectedBlockedBy.length === 0 ? (
                  <p className="text-[#777268]">Ничего</p>
                ) : (
                  selectedBlockedBy.map((title) => <p key={title}>• {title}</p>)
                )}

                <p className="mb-1 mt-4 text-xs uppercase tracking-[0.06em] text-[#8A857B]">Разблокирует</p>
                {selectedUnlocks.length === 0 ? (
                  <p className="text-[#777268]">Ничего</p>
                ) : (
                  selectedUnlocks.map((title) => <p key={title}>• {title}</p>)
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#1D201E] p-4 text-sm text-[#B8B0A3]">
              Выберите цель на графе, чтобы открыть детали. Двойной клик по связи удаляет зависимость.
            </div>
          )}
        </aside>
      </div>
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
