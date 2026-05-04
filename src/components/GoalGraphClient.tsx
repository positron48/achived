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
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

import type {
  ApiEdge,
  ApiGoal,
  BoardMemberItem,
  BoardRole,
  BoardSummary,
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

type BoardModalMode = "create" | "rename";
type MemberRole = "VIEWER" | "EDITOR";

const DEFAULT_NODE_WIDTH = 256;
const DEFAULT_NODE_HEIGHT = 96;
/** Совпадает с шириной левой колонки (`w-[300px]`); нужна для сдвига viewport при сворачивании. */
const LEFT_SIDEBAR_WIDTH_PX = 300;
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

type DetailDropdownKind = "status" | "priority" | "type";

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

function ChevronIcon({
  direction,
  className = "h-4 w-4",
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {direction === "left" ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  );
}

function initialsFromEmail(email: string | null | undefined): string {
  if (!email?.trim()) return "?";
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return "?";
  const segments = local.split(/[._+-]+/).filter(Boolean);
  if (segments.length >= 2) {
    return (segments[0]!.slice(0, 1) + segments[1]!.slice(0, 1)).toUpperCase();
  }
  return (local.slice(0, 2) || "?").toUpperCase();
}

type ModalProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#171918] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#F2EEE6]">{title}</h3>
          <button
            type="button"
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-[#B8B0A3] hover:bg-white/5"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? "Request failed");
  }
  return payload as T;
}

type GoalGraphClientInnerProps = {
  boards: BoardSummary[];
  currentBoardId: string;
  currentBoardRole: BoardRole;
  currentUserEmail: string | null;
  isPublicView?: boolean;
  publicBoardTitle?: string;
  initialGraph: GraphResponse;
  initialNext: NextGoalItem[];
};

type FlowContextMenuState =
  | { kind: "node"; clientX: number; clientY: number; nodeId: string }
  | { kind: "pane"; clientX: number; clientY: number; flowX: number; flowY: number };

function GoalGraphClientInner({
  boards,
  currentBoardId,
  currentBoardRole,
  currentUserEmail,
  isPublicView = false,
  publicBoardTitle,
  initialGraph,
  initialNext,
}: GoalGraphClientInnerProps) {
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
  const [boardMembers, setBoardMembers] = useState<BoardMemberItem[]>([]);
  const [publicShareToken, setPublicShareToken] = useState<string | null>(
    boards.find((board) => board.id === currentBoardId)?.publicShareToken ?? null,
  );
  const [boardModalMode, setBoardModalMode] = useState<BoardModalMode | null>(null);
  const [boardModalTitle, setBoardModalTitle] = useState("");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<MemberRole>("VIEWER");
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [openDetailDropdown, setOpenDetailDropdown] = useState<DetailDropdownKind | null>(null);
  const [detailMenuBox, setDetailMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const detailDropdownTriggersRef = useRef<HTMLDivElement | null>(null);
  const detailDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const detailStatusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const detailPriorityAnchorRef = useRef<HTMLButtonElement | null>(null);
  const detailTypeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [flowContextMenu, setFlowContextMenu] = useState<FlowContextMenuState | null>(null);
  const flowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const prevLeftSidebarOpenRef = useRef(leftSidebarOpen);

  useLayoutEffect(() => {
    const prev = prevLeftSidebarOpenRef.current;
    if (prev === leftSidebarOpen) {
      return;
    }
    prevLeftSidebarOpenRef.current = leftSidebarOpen;

    const viewport = reactFlow.getViewport();
    const deltaX = leftSidebarOpen ? -LEFT_SIDEBAR_WIDTH_PX : LEFT_SIDEBAR_WIDTH_PX;
    void reactFlow.setViewport(
      { x: viewport.x + deltaX, y: viewport.y, zoom: viewport.zoom },
      { duration: 0 },
    );
  }, [leftSidebarOpen, reactFlow]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setError(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [error]);

  useEffect(() => {
    setOpenDetailDropdown(null);
  }, [selectedGoalId]);

  useEffect(() => {
    if (!openDetailDropdown) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as unknown as globalThis.Node;
      if (detailDropdownTriggersRef.current?.contains(target)) return;
      if (detailDropdownMenuRef.current?.contains(target)) return;
      setOpenDetailDropdown(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDetailDropdown(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openDetailDropdown]);

  useEffect(() => {
    if (!userMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current?.contains(event.target as unknown as globalThis.Node)) return;
      setUserMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!flowContextMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      if (flowContextMenuRef.current?.contains(event.target as unknown as globalThis.Node)) return;
      setFlowContextMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFlowContextMenu(null);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [flowContextMenu]);

  useLayoutEffect(() => {
    if (!openDetailDropdown) {
      setDetailMenuBox(null);
      return;
    }

    const el =
      openDetailDropdown === "status"
        ? detailStatusAnchorRef.current
        : openDetailDropdown === "priority"
          ? detailPriorityAnchorRef.current
          : detailTypeAnchorRef.current;

    if (!el) return;

    const sync = () => {
      const r = el.getBoundingClientRect();
      setDetailMenuBox({ top: r.bottom + 4, left: r.left, width: r.width });
    };

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [openDetailDropdown]);

  const isEditor = !isPublicView && (currentBoardRole === "OWNER" || currentBoardRole === "EDITOR");
  const canManageShare = !isPublicView && currentBoardRole === "OWNER";
  const publicUrl = publicShareToken ? `/share/${publicShareToken}` : null;

  const withBoard = useCallback(
    (path: string) => {
      if (isPublicView) return path;
      const separator = path.includes("?") ? "&" : "?";
      return `${path}${separator}boardId=${encodeURIComponent(currentBoardId)}`;
    },
    [currentBoardId, isPublicView],
  );

  const selectedGoalNode = useMemo(
    () => nodes.find((node) => node.id === selectedGoalId) ?? null,
    [nodes, selectedGoalId],
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const goalTextSyncedRef = useRef<{ id: string; title: string; description: string } | null>(null);
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
        selected: Boolean(node.selected) || node.id === selectedGoalId,
        hidden: query.length === 0 ? false : !matchesSearch(node.data.title),
        data: {
          ...node.data,
          isConnecting,
        },
      })),
    [isConnecting, matchesSearch, nodes, query.length, selectedGoalId],
  );
  const focusCount = activeGoals.length;
  const startableCount = availableGoals.length;
  const blockedCount = blockedGoals.length;
  const doneCount = nodes.filter((node) => node.data.computedState === "DONE").length;

  const focusGoal = useCallback((goalId: string) => {
    setSelectedGoalId(goalId);
  }, []);

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
      const response = await fetch(withBoard("/api/graph"));
      const data = await parseJson<GraphResponse>(response);
      const nextEdges = data.edges.map(toFlowEdge);
      setNodes(buildFlowNodes(data.goals, data.edges));
      setEdges(nextEdges);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load graph");
    } finally {
      setIsLoading(false);
    }
  }, [withBoard]);

  const loadNext = useCallback(async () => {
    try {
      const response = await fetch(withBoard("/api/next"));
      const data = await parseJson<NextGoalItem[]>(response);
      setNextGoals(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load next goals");
    }
  }, [withBoard]);

  const createGoalWithPosition = useCallback(
    async (x: number, y: number) => {
      if (!isEditor) {
        setError("У вас только read-only доступ к этой доске.");
        return;
      }

      const title = window.prompt("Название новой цели");
      if (!title?.trim()) return;

      setError(null);
      try {
        const response = await fetch(withBoard("/api/goals"), {
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
    },
    [edges, isEditor, loadNext, withBoard],
  );

  const createGoal = useCallback(() => {
    const pos = getNextGoalPosition();
    void createGoalWithPosition(pos.x, pos.y);
  }, [createGoalWithPosition, getNextGoalPosition]);

  const updateGoal = useCallback(
    async (
      goalId: string,
      patch: Partial<Pick<ApiGoal, "title" | "description" | "status" | "priority" | "type" | "x" | "y">>,
    ) => {
      if (!isEditor) {
        setError("У вас только read-only доступ к этой доске.");
        return;
      }

      setError(null);

      try {
        const response = await fetch(withBoard(`/api/goals/${goalId}`), {
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
    [edges, isEditor, loadNext, withBoard],
  );

  const updateGoalRef = useRef(updateGoal);
  updateGoalRef.current = updateGoal;

  const deleteGoalById = useCallback(
    async (goalId: string) => {
      if (!isEditor) {
        setError("У вас только read-only доступ к этой доске.");
        return;
      }
      if (!window.confirm("Удалить цель и связанные связи?")) return;
      setError(null);

      try {
        const response = await fetch(withBoard(`/api/goals/${goalId}`), {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error("Failed to delete goal");
        }
        setNodes((prev) => prev.filter((node) => node.id !== goalId));
        setEdges((prev) => prev.filter((edge) => edge.source !== goalId && edge.target !== goalId));
        setSelectedGoalId((prev) => (prev === goalId ? null : prev));
        void loadNext();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to delete goal");
      }
    },
    [isEditor, loadNext, withBoard],
  );

  const deleteGoal = useCallback(async () => {
    if (!selectedGoalId) return;
    await deleteGoalById(selectedGoalId);
  }, [deleteGoalById, selectedGoalId]);

  const onNodesChange = useCallback((changes: NodeChange<Node<GoalNodeData>>[]) => {
    setNodes((prev) => applyNodeChanges<Node<GoalNodeData>>(changes, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((prev) => applyEdgeChanges<Edge>(changes, prev));
  }, []);

  const onConnect = useCallback<OnConnect>(async (connection: Connection) => {
    if (!isEditor) {
      setError("У вас только read-only доступ к этой доске.");
      return;
    }
    if (!connection.source || !connection.target) return;

    setError(null);
    try {
      const response = await fetch(withBoard("/api/edges"), {
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
  }, [isEditor, loadNext, withBoard]);

  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler<Node<GoalNodeData>>>((_, node) => {
    setSelectedGoalId(node.id);
  }, []);

  const onNodeContextMenu = useCallback<NodeMouseHandler<Node<GoalNodeData>>>(
    (event, node) => {
      event.preventDefault();
      if (!isEditor || isPublicView) return;
      setFlowContextMenu({
        kind: "node",
        clientX: event.clientX,
        clientY: event.clientY,
        nodeId: node.id,
      });
      setSelectedGoalId(node.id);
    },
    [isEditor, isPublicView],
  );

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      if (!isEditor || isPublicView) return;
      const flowPoint = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setFlowContextMenu({
        kind: "pane",
        clientX: event.clientX,
        clientY: event.clientY,
        flowX: flowPoint.x - DEFAULT_NODE_WIDTH / 2,
        flowY: flowPoint.y - DEFAULT_NODE_HEIGHT / 2,
      });
    },
    [isEditor, isPublicView, reactFlow],
  );

  const onNodeDragStop = useCallback(
    async (_event: ReactMouseEvent, node: Node<GoalNodeData>, draggedNodes: Node<GoalNodeData>[]) => {
      if (!isEditor) return;

      const targets = draggedNodes.length > 0 ? draggedNodes : [node];

      for (const n of targets) {
        await updateGoal(n.id, {
          x: n.position.x,
          y: n.position.y,
        });
      }
    },
    [isEditor, updateGoal],
  );

  const onEdgeDoubleClick = useCallback(async (_: unknown, edge: Edge) => {
    if (!isEditor) {
      setError("У вас только read-only доступ к этой доске.");
      return;
    }
    if (!window.confirm("Удалить связь?")) return;

    setError(null);
    try {
      const response = await fetch(withBoard(`/api/edges/${edge.id}`), {
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
  }, [isEditor, loadNext, withBoard]);

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

  useEffect(() => {
    if (!selectedGoalNode) {
      goalTextSyncedRef.current = null;
      return;
    }
    goalTextSyncedRef.current = {
      id: selectedGoalNode.id,
      title: selectedGoalNode.data.title,
      description: selectedGoalNode.data.description,
    };
  }, [selectedGoalNode?.id]);

  useEffect(() => {
    if (!selectedGoalId || !isEditor || !selectedGoalNode) return;
    const synced = goalTextSyncedRef.current;
    if (!synced || synced.id !== selectedGoalId) return;
    if (selectedTitle === synced.title && selectedDescription === synced.description) return;

    const timeoutId = window.setTimeout(() => {
      const goalId = selectedGoalId;
      const title = selectedTitle;
      const description = selectedDescription;
      void updateGoalRef.current(goalId, { title, description }).then(() => {
        if (goalTextSyncedRef.current?.id !== goalId) return;
        goalTextSyncedRef.current = { id: goalId, title, description };
      });
    }, 480);

    return () => window.clearTimeout(timeoutId);
  }, [selectedTitle, selectedDescription, selectedGoalId, isEditor, selectedGoalNode]);

  useEffect(() => {
    const goalIdWhenFocused = selectedGoalId;

    return () => {
      if (!goalIdWhenFocused || !isEditor) return;
      const node = nodesRef.current.find((n) => n.id === goalIdWhenFocused);
      if (!node) return;
      void updateGoalRef.current(goalIdWhenFocused, {
        title: node.data.title,
        description: node.data.description,
      });
    };
  }, [selectedGoalId, isEditor]);

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

  const patchGoalMeta = useCallback(
    async (patch: Partial<Pick<GoalNodeData, "status" | "priority" | "type">>) => {
      if (!selectedGoalNode || !isEditor) return;
      const goalId = selectedGoalNode.id;
      setNodeField(goalId, patch);
      await updateGoal(goalId, patch);
    },
    [isEditor, selectedGoalNode, setNodeField, updateGoal],
  );

  const applyGoalStatusFromContextMenu = useCallback(
    async (goalId: string, status: GoalStatus) => {
      setFlowContextMenu(null);
      if (!isEditor) return;
      setNodeField(goalId, { status });
      await updateGoal(goalId, { status });
    },
    [isEditor, setNodeField, updateGoal],
  );

  const deleteGoalFromContextMenu = useCallback(
    async (goalId: string) => {
      setFlowContextMenu(null);
      await deleteGoalById(goalId);
    },
    [deleteGoalById],
  );

  const createBoard = useCallback(async (title: string) => {
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const allBoards = await parseJson<BoardSummary[]>(response);
      const created = allBoards.at(-1);
      if (created) {
        window.location.assign(`/?boardId=${encodeURIComponent(created.id)}`);
      } else {
        window.location.reload();
      }
    } catch (createBoardError) {
      setError(createBoardError instanceof Error ? createBoardError.message : "Failed to create board");
    }
  }, []);

  const renameBoard = useCallback(
    async (title: string) => {
      if (!isEditor) {
        setError("Только editor/owner может переименовывать доску.");
        return;
      }

      try {
        const response = await fetch(`/api/boards/${currentBoardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        });
        await parseJson<{ ok: boolean }>(response);
        window.location.reload();
      } catch (renameError) {
        setError(renameError instanceof Error ? renameError.message : "Failed to rename board");
      }
    },
    [currentBoardId, isEditor],
  );

  const inviteMember = useCallback(
    async (email: string, role: MemberRole) => {
      if (!isEditor) {
        setError("Только editor/owner может делиться доской.");
        return;
      }

      try {
        const response = await fetch(`/api/boards/${currentBoardId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        });
        const members = await parseJson<BoardMemberItem[]>(response);
        setBoardMembers(members);
      } catch (shareError) {
        setError(shareError instanceof Error ? shareError.message : "Failed to share board");
      }
    },
    [currentBoardId, isEditor],
  );

  const refreshMembers = useCallback(async () => {
    if (isPublicView) return;
    try {
      const response = await fetch(`/api/boards/${currentBoardId}/members`);
      const members = await parseJson<BoardMemberItem[]>(response);
      setBoardMembers(members);
    } catch (membersError) {
      setError(membersError instanceof Error ? membersError.message : "Failed to load members");
    }
  }, [currentBoardId, isPublicView]);

  const openCreateBoardModal = useCallback(() => {
    setBoardModalMode("create");
    setBoardModalTitle("");
  }, []);

  const openRenameBoardModal = useCallback(() => {
    if (!isEditor) {
      setError("Только editor/owner может переименовывать доску.");
      return;
    }
    const currentTitle = boards.find((board) => board.id === currentBoardId)?.title ?? "";
    setBoardModalMode("rename");
    setBoardModalTitle(currentTitle);
  }, [boards, currentBoardId, isEditor]);

  const submitBoardModal = useCallback(async () => {
    if (!boardModalMode || !boardModalTitle.trim()) return;
    if (boardModalMode === "create") {
      await createBoard(boardModalTitle);
    } else {
      await renameBoard(boardModalTitle);
    }
    setBoardModalMode(null);
  }, [boardModalMode, boardModalTitle, createBoard, renameBoard]);

  const openShareModal = useCallback(async () => {
    if (!isEditor) {
      setError("Только editor/owner может делиться доской.");
      return;
    }
    await refreshMembers();
    setShareEmail("");
    setShareRole("VIEWER");
    setShareModalOpen(true);
  }, [isEditor, refreshMembers]);

  const submitShareModal = useCallback(async () => {
    if (!shareEmail.trim()) return;
    await inviteMember(shareEmail, shareRole);
    setShareEmail("");
    setShareRole("VIEWER");
  }, [inviteMember, shareEmail, shareRole]);

  const openMembersModal = useCallback(async () => {
    await refreshMembers();
    setMembersModalOpen(true);
  }, [refreshMembers]);

  const changeMemberRole = useCallback(
    async (memberUserId: string, role: MemberRole) => {
      try {
        const response = await fetch(`/api/boards/${currentBoardId}/members/${memberUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        await parseJson<{ ok: boolean }>(response);
        await refreshMembers();
      } catch (roleError) {
        setError(roleError instanceof Error ? roleError.message : "Failed to change member role");
      }
    },
    [currentBoardId, refreshMembers],
  );

  const removeMember = useCallback(
    async (memberUserId: string) => {
      try {
        const response = await fetch(`/api/boards/${currentBoardId}/members/${memberUserId}`, {
          method: "DELETE",
        });
        await parseJson<{ ok: boolean }>(response);
        await refreshMembers();
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : "Failed to remove member");
      }
    },
    [currentBoardId, refreshMembers],
  );

  const togglePublicReadOnly = useCallback(async () => {
    if (!canManageShare) {
      setError("Только owner может управлять публичной ссылкой.");
      return;
    }

    try {
      const response = await fetch(`/api/boards/${currentBoardId}/public`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !publicShareToken }),
      });
      const payload = await parseJson<{ publicShareToken: string | null }>(response);
      setPublicShareToken(payload.publicShareToken);
    } catch (publicError) {
      setError(publicError instanceof Error ? publicError.message : "Failed to update public share");
    }
  }, [canManageShare, currentBoardId, publicShareToken]);

  return (
    <div className="flex h-full w-full flex-col bg-[#101211] text-[#F2EEE6]">
      <header className="flex h-20 items-center gap-5 border-b border-white/10 bg-[#111312] px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-[#1C1F1D] text-[#D8C8A8]">
            ◈
          </div>
          <div>
            <p className="text-2xl font-medium tracking-tight">GoalGraph</p>
            {isPublicView ? (
              <p className="text-xs text-[#B8B0A3]">Публичный просмотр: {publicBoardTitle ?? "Board"}</p>
            ) : (
              <p className="text-xs text-[#B8B0A3]">{currentBoardRole === "VIEWER" ? "Read-only" : "Editable"}</p>
            )}
          </div>
        </div>

        {!isPublicView ? (
          <div className="flex items-center gap-2">
            <select
              className="h-10 rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none"
              value={currentBoardId}
              onChange={(event) =>
                window.location.assign(`/?boardId=${encodeURIComponent(event.target.value)}`)
              }
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.title} ({board.role.toLowerCase()})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="h-10 rounded-xl border border-white/10 bg-[#181B1A] px-3 text-xs text-[#B8B0A3] hover:bg-white/5"
              onClick={openCreateBoardModal}
            >
              + Доска
            </button>
            <button
              type="button"
              className="h-10 rounded-xl border border-white/10 bg-[#181B1A] px-3 text-xs text-[#B8B0A3] hover:bg-white/5"
              onClick={openRenameBoardModal}
              disabled={!isEditor}
            >
              Переименовать
            </button>
          </div>
        ) : null}

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
          className="h-10 rounded-xl bg-[#B96745] px-4 text-sm font-medium text-[#F2EEE6] transition hover:bg-[#C47657] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={createGoal}
          disabled={!isEditor}
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
          {!isPublicView ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-[#252825] text-sm font-semibold text-[#D8C8A8] transition hover:border-[#D39A43]/45 hover:bg-[#2E312F]"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                title={currentUserEmail ?? "Профиль"}
                onClick={() => setUserMenuOpen((open) => !open)}
              >
                {initialsFromEmail(currentUserEmail)}
              </button>
              {userMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[400] mt-2 w-56 rounded-xl border border-white/10 bg-[#171918] py-2 shadow-[0_12px_40px_rgba(0,0,0,.5)]"
                >
                  <p className="border-b border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A857B]">
                    Аккаунт
                  </p>
                  <p className="break-all px-3 py-2 text-xs leading-snug text-[#D8C8A8]">{currentUserEmail}</p>
                  <Link
                    href="/api/auth/signout"
                    role="menuitem"
                    className="block px-3 py-2 text-sm text-[#F2EEE6] transition hover:bg-white/10"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Выйти
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {!leftSidebarOpen ? (
          <button
            type="button"
            className="pointer-events-auto absolute left-0 top-1/2 z-20 flex h-16 w-4 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-white/10 bg-[#171918] text-[#B8B0A3] shadow-lg transition hover:bg-[#1D201E] hover:text-[#F2EEE6]"
            aria-label="Показать левую панель"
            onClick={() => setLeftSidebarOpen(true)}
          >
            <ChevronIcon direction="right" className="h-3 w-3" />
          </button>
        ) : null}

        <aside
          className={`relative shrink-0 overflow-hidden border-white/10 bg-[#171918] ${
            leftSidebarOpen ? "w-[300px] border-r" : "w-0 border-0"
          }`}
        >
          <div className="flex h-full min-h-0 w-[300px] flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                      onClick={() => focusGoal(goal.id)}
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
                      onClick={() => focusGoal(goal.id)}
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
            </div>
            <div className="flex shrink-0 justify-end border-t border-white/10 px-2 py-2">
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-[#B8B0A3] transition hover:border-white/10 hover:bg-white/5 hover:text-[#F2EEE6]"
                aria-label="Скрыть левую панель"
                onClick={() => setLeftSidebarOpen(false)}
              >
                <ChevronIcon direction="left" />
              </button>
            </div>
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
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onPaneClick={() => {
              setSelectedGoalId(null);
              setFlowContextMenu(null);
            }}
            defaultEdgeOptions={{
              type: "boundaryStraight",
              style: { stroke: EDGE_STROKE, strokeWidth: EDGE_WIDTH },
            }}
            nodesDraggable={isEditor}
            nodesConnectable={isEditor}
            fitView
          >
            <Background gap={24} size={1} color="rgba(216, 200, 168, 0.3)" />
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
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
          {isLoading ? (
            <div className="absolute bottom-4 left-4 z-10 text-xs text-[#8A857B]">Загрузка...</div>
          ) : null}
        </section>

        <aside
          className={`relative shrink-0 overflow-hidden border-white/10 bg-[#171918] ${
            rightSidebarOpen ? "w-[340px] border-l" : "w-0 border-0"
          }`}
        >
          <div className="flex h-full min-h-0 w-[340px] flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {!isPublicView && !selectedGoalNode ? (
            <div className="mb-4 space-y-2 rounded-xl border border-white/10 bg-[#1D201E] p-3 text-xs text-[#B8B0A3]">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[#F2EEE6]">Доступ к доске</p>
                <p>{currentBoardRole.toLowerCase()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 disabled:opacity-50"
                  onClick={() => void openShareModal()}
                  disabled={!isEditor}
                >
                  Пригласить
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5"
                  onClick={() => void openMembersModal()}
                >
                  Участники
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 disabled:opacity-50"
                  onClick={togglePublicReadOnly}
                  disabled={!canManageShare}
                >
                  {publicShareToken ? "Скрыть public" : "Сделать public"}
                </button>
                {publicUrl ? (
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `${window.location.origin}${publicUrl}`,
                      )
                    }
                  >
                    Копировать ссылку
                  </button>
                ) : null}
              </div>
              {publicUrl ? <p className="break-all text-[11px]">{publicUrl}</p> : null}
              <div className="max-h-28 overflow-y-auto rounded-lg border border-white/10 p-2 text-[11px]">
                {boardMembers.length === 0 ? (
                  <p className="text-[#777268]">Участников нет</p>
                ) : (
                  boardMembers.map((member) => (
                    <p key={member.userId}>
                      {member.email} - {member.role.toLowerCase()}
                      {member.email === currentUserEmail ? " (вы)" : ""}
                    </p>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {selectedGoalNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-[#F2EEE6]">{selectedTitle}</h2>
                </div>
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-lg leading-none text-[#B8B0A3] hover:bg-white/5 hover:text-[#F2EEE6]"
                  aria-label="Закрыть"
                  onClick={() => setSelectedGoalId(null)}
                >
                  <span aria-hidden>×</span>
                </button>
              </div>

              <div ref={detailDropdownTriggersRef} className="space-y-2">
                <button
                  ref={detailStatusAnchorRef}
                  type="button"
                  disabled={!isEditor}
                  aria-expanded={openDetailDropdown === "status"}
                  aria-haspopup="listbox"
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#1D201E] px-3 py-2 text-left transition hover:bg-white/[0.04] disabled:pointer-events-none disabled:opacity-50"
                  onClick={() =>
                    setOpenDetailDropdown((open) => (open === "status" ? null : "status"))
                  }
                >
                  <span className="text-xs text-[#B8B0A3]">Статус</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full border border-[#D39A43]/45 bg-[#D39A43]/12 px-2 py-0.5 text-xs text-[#D8C8A8]">
                      {statusLabel[selectedStatus]}
                    </span>
                    <span className="text-[10px] text-[#8A857B]" aria-hidden>
                      ▾
                    </span>
                  </span>
                </button>

                <button
                  ref={detailPriorityAnchorRef}
                  type="button"
                  disabled={!isEditor}
                  aria-expanded={openDetailDropdown === "priority"}
                  aria-haspopup="listbox"
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#1D201E] px-3 py-2 text-left transition hover:bg-white/[0.04] disabled:pointer-events-none disabled:opacity-50"
                  onClick={() =>
                    setOpenDetailDropdown((open) => (open === "priority" ? null : "priority"))
                  }
                >
                  <span className="text-xs text-[#B8B0A3]">Приоритет</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${priorityTone(selectedPriority)}`}>
                      ⚑ {priorityLabel(selectedPriority)}
                    </span>
                    <span className="text-[10px] text-[#8A857B]" aria-hidden>
                      ▾
                    </span>
                  </span>
                </button>

                <button
                  ref={detailTypeAnchorRef}
                  type="button"
                  disabled={!isEditor}
                  aria-expanded={openDetailDropdown === "type"}
                  aria-haspopup="listbox"
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#1D201E] px-3 py-2 text-left transition hover:bg-white/[0.04] disabled:pointer-events-none disabled:opacity-50"
                  onClick={() =>
                    setOpenDetailDropdown((open) => (open === "type" ? null : "type"))
                  }
                >
                  <span className="text-xs text-[#B8B0A3]">Тип</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#D8C8A8]">{typeLabel[selectedType]}</span>
                    <span className="text-[10px] text-[#8A857B]" aria-hidden>
                      ▾
                    </span>
                  </span>
                </button>
              </div>

              {openDetailDropdown && detailMenuBox
                ? createPortal(
                    <div
                      ref={detailDropdownMenuRef}
                      role="listbox"
                      className="fixed z-[300] overflow-hidden rounded-xl border border-white/10 bg-[#161918] py-1 shadow-[0_12px_40px_rgba(0,0,0,.45)]"
                      style={{
                        top: detailMenuBox.top,
                        left: detailMenuBox.left,
                        width: Math.max(detailMenuBox.width, 220),
                      }}
                    >
                      {openDetailDropdown === "status"
                        ? statusOptions.map((status) => (
                            <button
                              key={status}
                              type="button"
                              role="option"
                              aria-selected={status === selectedStatus}
                              className={`flex w-full px-3 py-2 text-left text-sm transition ${
                                status === selectedStatus
                                  ? "bg-[#D39A43]/14 text-[#F2EEE6]"
                                  : "text-[#D8C8A8] hover:bg-white/10"
                              }`}
                              onClick={() => {
                                void patchGoalMeta({ status });
                                setOpenDetailDropdown(null);
                              }}
                            >
                              {statusLabel[status]}
                            </button>
                          ))
                        : openDetailDropdown === "priority"
                          ? [1, 2, 3, 4, 5].map((priority) => (
                              <button
                                key={priority}
                                type="button"
                                role="option"
                                aria-selected={priority === selectedPriority}
                                className={`flex w-full px-3 py-2 text-left text-sm transition ${
                                  priority === selectedPriority
                                    ? "bg-[#D39A43]/14 text-[#F2EEE6]"
                                    : "text-[#D8C8A8] hover:bg-white/10"
                                }`}
                                onClick={() => {
                                  void patchGoalMeta({ priority });
                                  setOpenDetailDropdown(null);
                                }}
                              >
                                <span className={priorityTone(priority)}>
                                  ⚑ {priority} — {priorityLabel(priority)}
                                </span>
                              </button>
                            ))
                          : typeOptions.map((type) => (
                              <button
                                key={type}
                                type="button"
                                role="option"
                                aria-selected={type === selectedType}
                                className={`flex w-full px-3 py-2 text-left text-sm transition ${
                                  type === selectedType
                                    ? "bg-[#D39A43]/14 text-[#F2EEE6]"
                                    : "text-[#D8C8A8] hover:bg-white/10"
                                }`}
                                onClick={() => {
                                  void patchGoalMeta({ type });
                                  setOpenDetailDropdown(null);
                                }}
                              >
                                {typeLabel[type]}
                              </button>
                            ))}
                    </div>,
                    document.body,
                  )
                : null}

              <label className="block text-xs text-[#B8B0A3]">
                Название
                <input
                  className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedTitle}
                  disabled={!isEditor}
                  onChange={(event) => setNodeField(selectedGoalNode.id, { title: event.target.value })}
                />
              </label>

              <label className="block text-xs text-[#B8B0A3]">
                Описание
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 py-2 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedDescription}
                  disabled={!isEditor}
                  onChange={(event) =>
                    setNodeField(selectedGoalNode.id, { description: event.target.value })
                  }
                />
              </label>

              <button
                type="button"
                className="h-10 w-full rounded-xl border border-[#A94F3D]/50 bg-[#2A1A18] text-sm text-[#F0B0A0] hover:bg-[#351F1B] disabled:opacity-50"
                disabled={!isEditor}
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
            </div>
            <div className="flex shrink-0 justify-start border-t border-white/10 px-2 py-2">
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-[#B8B0A3] transition hover:border-white/10 hover:bg-white/5 hover:text-[#F2EEE6]"
                aria-label="Скрыть правую панель"
                onClick={() => setRightSidebarOpen(false)}
              >
                <ChevronIcon direction="right" />
              </button>
            </div>
          </div>
        </aside>

        {!rightSidebarOpen ? (
          <button
            type="button"
            className="pointer-events-auto absolute right-0 top-1/2 z-20 flex h-16 w-4 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-white/10 bg-[#171918] text-[#B8B0A3] shadow-lg transition hover:bg-[#1D201E] hover:text-[#F2EEE6]"
            aria-label="Показать правую панель"
            onClick={() => setRightSidebarOpen(true)}
          >
            <ChevronIcon direction="left" className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {flowContextMenu && isEditor && !isPublicView
        ? createPortal(
            <div
              ref={flowContextMenuRef}
              role="menu"
              className="fixed z-[600] max-h-[min(420px,calc(100vh-16px))] min-w-[208px] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-[#171918] py-1 shadow-[0_16px_48px_rgba(0,0,0,.55)]"
              style={{
                left: Math.min(globalThis.window.innerWidth - 216, Math.max(8, flowContextMenu.clientX)),
                top: Math.min(globalThis.window.innerHeight - 48, Math.max(8, flowContextMenu.clientY)),
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              {flowContextMenu.kind === "node" ? (
                <>
                  <p className="border-b border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A857B]">
                    Статус
                  </p>
                  {statusOptions.map((status) => {
                    const current = nodes.find((n) => n.id === flowContextMenu.nodeId)?.data.status;
                    const isCurrent = current === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        role="menuitem"
                        className={`flex w-full px-3 py-2 text-left text-sm ${
                          isCurrent
                            ? "bg-[#D39A43]/14 text-[#F2EEE6]"
                            : "text-[#D8C8A8] hover:bg-white/10"
                        }`}
                        onClick={() => void applyGoalStatusFromContextMenu(flowContextMenu.nodeId, status)}
                      >
                        {statusLabel[status]}
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#F0B0A0] hover:bg-[#A94F3D]/20"
                    onClick={() => void deleteGoalFromContextMenu(flowContextMenu.nodeId)}
                  >
                    Удалить карточку
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#D8C8A8] hover:bg-white/10"
                    onClick={() => {
                      const pos = flowContextMenu;
                      setFlowContextMenu(null);
                      void createGoalWithPosition(pos.flowX, pos.flowY);
                    }}
                  >
                    Добавить карточку
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}

      {boardModalMode ? (
        <Modal
          title={boardModalMode === "create" ? "Новая доска" : "Переименовать доску"}
          onClose={() => setBoardModalMode(null)}
        >
          <div className="space-y-3">
            <label className="block text-xs text-[#B8B0A3]">
              Название
              <input
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none"
                value={boardModalTitle}
                onChange={(event) => setBoardModalTitle(event.target.value)}
                placeholder="Например, Рабочие цели"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                className="h-10 rounded-xl bg-[#B96745] px-4 text-sm font-medium text-[#F2EEE6] hover:bg-[#C47657]"
                onClick={() => void submitBoardModal()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {shareModalOpen ? (
        <Modal title="Поделиться доской" onClose={() => setShareModalOpen(false)}>
          <div className="space-y-3">
            <label className="block text-xs text-[#B8B0A3]">
              Email пользователя
              <input
                type="email"
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none"
                value={shareEmail}
                onChange={(event) => setShareEmail(event.target.value)}
                placeholder="user@example.com"
              />
            </label>
            <label className="block text-xs text-[#B8B0A3]">
              Роль
              <select
                className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none"
                value={shareRole}
                onChange={(event) => setShareRole(event.target.value as MemberRole)}
              >
                <option value="VIEWER">viewer (read-only)</option>
                <option value="EDITOR">editor (редактирование)</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="h-10 rounded-xl border border-white/10 px-4 text-sm text-[#B8B0A3] hover:bg-white/5"
                onClick={() => setShareModalOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="h-10 rounded-xl bg-[#B96745] px-4 text-sm font-medium text-[#F2EEE6] hover:bg-[#C47657]"
                onClick={() => void submitShareModal()}
              >
                Выдать доступ
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {membersModalOpen ? (
        <Modal title="Участники доски" onClose={() => setMembersModalOpen(false)}>
          <div className="space-y-2">
            {boardMembers.length === 0 ? (
              <p className="text-sm text-[#777268]">Участников пока нет.</p>
            ) : (
              boardMembers.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1D201E] p-2"
                >
                  <div>
                    <p className="text-sm text-[#F2EEE6]">
                      {member.email}
                      {member.email === currentUserEmail ? " (вы)" : ""}
                    </p>
                    <p className="text-[11px] text-[#8A857B]">{member.name ?? "Без имени"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-8 rounded-lg border border-white/10 bg-[#181B1A] px-2 text-xs text-[#F2EEE6]"
                      value={member.role}
                      disabled={!isEditor || member.email === currentUserEmail}
                      onChange={(event) =>
                        void changeMemberRole(member.userId, event.target.value as MemberRole)
                      }
                    >
                      <option value="VIEWER">viewer</option>
                      <option value="EDITOR">editor</option>
                    </select>
                    <button
                      type="button"
                      className="h-8 rounded-lg border border-[#A94F3D]/50 px-2 text-xs text-[#F0B0A0] hover:bg-[#351F1B] disabled:opacity-50"
                      disabled={!isEditor || member.email === currentUserEmail}
                      onClick={() => void removeMember(member.userId)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

type GoalGraphClientProps = {
  boards: BoardSummary[];
  currentBoardId: string;
  currentBoardRole: BoardRole;
  currentUserEmail: string | null;
  isPublicView?: boolean;
  publicBoardTitle?: string;
  initialGraph: GraphResponse;
  initialNext: NextGoalItem[];
};

export function GoalGraphClient({
  boards,
  currentBoardId,
  currentBoardRole,
  currentUserEmail,
  isPublicView,
  publicBoardTitle,
  initialGraph,
  initialNext,
}: GoalGraphClientProps) {
  return (
    <ReactFlowProvider>
      <GoalGraphClientInner
        boards={boards}
        currentBoardId={currentBoardId}
        currentBoardRole={currentBoardRole}
        currentUserEmail={currentUserEmail}
        isPublicView={isPublicView}
        publicBoardTitle={publicBoardTitle}
        initialGraph={initialGraph}
        initialNext={initialNext}
      />
    </ReactFlowProvider>
  );
}
