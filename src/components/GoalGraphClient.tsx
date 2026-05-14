"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type ConnectionLineComponentProps,
  ConnectionLineType,
  type Connection,
  ControlButton,
  Controls,
  type EdgeProps,
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
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";

import {
  normalizeEdgeWaypointsArray,
  type ApiEdge,
  type ApiGoal,
  type BoardMemberItem,
  type BoardRole,
  type BoardSummary,
  type ComputedState,
  type GoalStatus,
  type GoalType,
  type EdgeWaypoint,
  type GraphResponse,
  type NextGoalItem,
  normalizeGoalStartsOn,
} from "@/lib/graph-types";
import { applyGraphSnapshotToServer } from "@/lib/apply-graph-snapshot-to-server";
import { logDevGraphHistoryDiff } from "@/lib/dev-graph-snapshot-diff";
import { snapshotsSemanticallyEqual } from "@/lib/graph-snapshot-semantic";
import {
  GRAPH_HISTORY_MAX_ENTRIES,
  deserializeGraphSnapshot,
  readPersistedGraphHistory,
  serializeGraphSnapshot,
  writePersistedGraphHistory,
} from "@/lib/graph-history";
import type { UserUiSettings } from "@/lib/user-ui-settings";
import { isBeforeStartCalendarDay } from "@/lib/schedule";

const DEFAULT_USER_UI_SETTINGS: UserUiSettings = {
  graphGridSnapEnabled: false,
  graphLeftSidebarOpen: true,
  graphRightSidebarOpen: true,
};

type GoalNodeData = {
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  type: GoalType;
  computedState: ComputedState;
  lockReason: "deps" | "schedule" | null;
  /** YYYY-MM-DD или пусто — не раньше этого дня имеет смысл начинать. */
  startsOn: string | null;
  isConnecting: boolean;
};

type BoardModalMode = "create" | "rename";
type MemberRole = "VIEWER" | "EDITOR";

const DEFAULT_NODE_WIDTH = 256;
const DEFAULT_NODE_HEIGHT = 96;

/** Совпадает с `gap` у `<Background />`: верхний левый угол узла притягивается к узлам этой сетки. */
const BACKGROUND_GRID_GAP = 24;

function measuredGoalNodeSize(node: Node<GoalNodeData>): { width: number; height: number } {
  const width =
    typeof node.measured?.width === "number"
      ? node.measured.width
      : typeof node.width === "number"
        ? node.width
        : DEFAULT_NODE_WIDTH;
  const height =
    typeof node.measured?.height === "number"
      ? node.measured.height
      : typeof node.height === "number"
        ? node.height
        : DEFAULT_NODE_HEIGHT;
  return { width, height };
}

function snapFlowTopLeftToGrid(pos: { x: number; y: number }): { x: number; y: number } {
  const g = BACKGROUND_GRID_GAP;
  return {
    x: g * Math.round(pos.x / g),
    y: g * Math.round(pos.y / g),
  };
}

type AlignGoalsMode =
  | { layout: "row" }
  | { layout: "column"; edge: "left" | "center" | "right" };

/** Совпадает с шириной левой колонки (`w-[300px]`); нужна для сдвига viewport при сворачивании. */
const LEFT_SIDEBAR_WIDTH_PX = 300;
/** Единственная «яркая» линия: от цели-источника в состоянии DONE (непрозрачный цвет — линии не просвечивают). */
const EDGE_STROKE_FROM_DONE = "#A8BE7A";
/** Все остальные линии (источник ещё не DONE): чуть светлее тёмно-серый, без альфы. */
const EDGE_STROKE_MUTED = "#443F3B";
/** Выбранное ребро. */
const EDGE_STROKE_SELECTED = "#E8DCC4";
const EDGE_WIDTH = 1.2;
const EDGE_HIT_WIDTH = EDGE_WIDTH + 4;
const EDGE_ARROW_LENGTH = 12;
const EDGE_ARROW_HALF_WIDTH = 4;
const EDGE_HANDLE_RADIUS = 5;
const EDGE_MID_HANDLE_RADIUS = 4;
/** Не показывать «серединную» точку на очень коротком отрезке (кроме случая без waypoints). */
const EDGE_MIN_SEGMENT_FOR_MID_HANDLE = 40;
/** Радиус скругления углов полилинии (дуги окружности вместо Bézier). */
const EDGE_CORNER_RADIUS = 52;

function strokeForDependencyEdge(sourceComputed: ComputedState | undefined, selected: boolean): string {
  if (selected) return EDGE_STROKE_SELECTED;
  if (sourceComputed === "DONE") return EDGE_STROKE_FROM_DONE;
  return EDGE_STROKE_MUTED;
}

type XY = { x: number; y: number };

/** Полилиния через точки с скруглениями на waypoint-ах (дуги заданного радиуса). */
function roundedPolylinePath(
  points: XY[],
  baseRadius: number,
): { d: string; endTangent: XY } | null {
  const n = points.length;
  if (n < 2) return null;

  const last = points[n - 1]!;

  if (n === 2) {
    const a = points[0]!;
    const dx = last.x - a.x;
    const dy = last.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      d: `M ${a.x} ${a.y} L ${last.x} ${last.y}`,
      endTangent: { x: dx / len, y: dy / len },
    };
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  let pen = points[0]!;

  for (let k = 1; k <= n - 2; k++) {
    const prev = points[k - 1]!;
    const corner = points[k]!;
    const next = points[k + 1]!;

    const vin = { x: corner.x - prev.x, y: corner.y - prev.y };
    const vout = { x: next.x - corner.x, y: next.y - corner.y };
    const lenIn = Math.hypot(vin.x, vin.y);
    const lenOut = Math.hypot(vout.x, vout.y);
    if (!lenIn || !lenOut) continue;

    const eIn = { x: vin.x / lenIn, y: vin.y / lenIn };
    const eOut = { x: vout.x / lenOut, y: vout.y / lenOut };

    const dot = Math.max(-1, Math.min(1, eIn.x * eOut.x + eIn.y * eOut.y));
    const cross = eIn.x * eOut.y - eIn.y * eOut.x;
    const phi = Math.atan2(cross, dot);

    const rCap = Math.min(baseRadius, lenIn * 0.42, lenOut * 0.42);
    const tanHalf = Math.tan(Math.abs(phi) / 2);
    if (!Number.isFinite(tanHalf) || tanHalf <= 1e-6) {
      d += ` L ${corner.x} ${corner.y}`;
      pen = corner;
      continue;
    }
    // Для скругления угла trim = r * tan(theta / 2), а не деление.
    let trim = rCap * tanHalf;
    trim = Math.min(trim, lenIn * 0.499, lenOut * 0.499);

    const absPhi = Math.abs(phi);
    const nearlyStraight = absPhi < 0.08;
    const nearUTurn = Math.PI - absPhi < 0.08;
    const tinyTrim = trim < 1.25;

    if (nearlyStraight || nearUTurn || tinyTrim || !Number.isFinite(trim)) {
      d += ` L ${corner.x} ${corner.y}`;
      pen = corner;
      continue;
    }

    const qStart = { x: corner.x - eIn.x * trim, y: corner.y - eIn.y * trim };
    const qEnd = { x: corner.x + eOut.x * trim, y: corner.y + eOut.y * trim };

    const effectiveRadius = Math.max(trim / tanHalf, 1e-3);
    d += ` L ${qStart.x} ${qStart.y}`;
    d += svgCircularArcSuffix(qStart, qEnd, effectiveRadius, cross >= 0 ? 1 : 0);
    pen = qEnd;
  }

  d += ` L ${last.x} ${last.y}`;
  const dx = last.x - pen.x;
  const dy = last.y - pen.y;
  const len = Math.hypot(dx, dy) || 1;
  return { d, endTangent: { x: dx / len, y: dy / len } };
}

/** Фрагмент path после текущей точки qStart: малая дуга до qEnd. */
function svgCircularArcSuffix(
  q1: XY,
  q2: XY,
  rNominal: number,
  sweepFlag: 0 | 1,
): string {
  const dx = q2.x - q1.x;
  const dy = q2.y - q1.y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return "";

  let radius = rNominal;
  const halfChord = chord / 2;
  if (halfChord > radius - 1e-9) {
    radius = halfChord + 1e-6;
  }

  return ` A ${radius} ${radius} 0 0 ${sweepFlag} ${q2.x} ${q2.y}`;
}

const EdgeWaypointActionsContext = createContext<{
  isEditor: boolean;
  updateWaypoints: (edgeId: string, waypoints: EdgeWaypoint[]) => void;
  /** Прилипание точек связи к сетке (узлы — через snapToGrid у React Flow). */
  gridSnapEnabled: boolean;
  highlightedWaypointKeys: Set<string>;
  selectedWaypointKeys: Set<string>;
  toggleWaypointSelection: (edgeId: string, index: number, additive: boolean) => void;
} | null>(null);

/** Наконечник стрелки по направлению кривой у целевого узла (tangentUnit — единичный вектор «внутрь» к target). */
function getArrowHeadPath(end: XY, tangentUnit: XY) {
  const ux = tangentUnit.x;
  const uy = tangentUnit.y;
  const baseX = end.x - ux * EDGE_ARROW_LENGTH;
  const baseY = end.y - uy * EDGE_ARROW_LENGTH;
  const perpX = -uy;
  const perpY = ux;

  return `M ${end.x} ${end.y} L ${baseX + perpX * EDGE_ARROW_HALF_WIDTH} ${
    baseY + perpY * EDGE_ARROW_HALF_WIDTH
  } L ${baseX - perpX * EDGE_ARROW_HALF_WIDTH} ${baseY - perpY * EDGE_ARROW_HALF_WIDTH} Z`;
}

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

/** Оттенки по уровням 1…5, чтобы отличать 2/3 (средние) и 4/5 (высокие). */
const priorityTone = (priority: number) => {
  switch (priority) {
    case 1:
      return "text-[#8B944C]";
    case 2:
      return "text-[#9E8A38]";
    case 3:
      return "text-[#C9A030]";
    case 4:
      return "text-[#D4654A]";
    case 5:
      return "text-[#E24A32]";
    default:
      return "text-[#D39A43]";
  }
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

function stateChipLabel(state: ComputedState, lockReason: GoalNodeData["lockReason"]): string {
  if (state === "LOCKED" && lockReason === "schedule") return "Срок не наступил";
  return stateTitle[state];
}

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

/** Граница узла по лучу из центра к точке «куда идём» (учитывает waypoint-ы). */
function boundaryExitToward(rect: RectNode, toward: XY): XY {
  const dx = toward.x - rect.centerX;
  const dy = toward.y - rect.centerY;
  const ratio = Math.max(
    Math.abs(dx) / Math.max(rect.halfW, 1),
    Math.abs(dy) / Math.max(rect.halfH, 1),
  );

  if (!Number.isFinite(ratio) || ratio === 0) {
    return { x: rect.centerX, y: rect.centerY };
  }

  return {
    x: rect.centerX + dx / ratio,
    y: rect.centerY + dy / ratio,
  };
}

/**
 * Первая точка на границе целевого узла при движении от waypoint к центру узла
 * (стрелка входит со стороны траектории, а не центра противоположного блока).
 */
function boundaryEntryFromApproach(rect: RectNode, approach: XY): XY {
  const cx = rect.centerX;
  const cy = rect.centerY;
  const xmin = cx - rect.halfW;
  const xmax = cx + rect.halfW;
  const ymin = cy - rect.halfH;
  const ymax = cy + rect.halfH;

  const ax = approach.x;
  const ay = approach.y;
  const bx = cx;
  const by = cy;
  const ddx = bx - ax;
  const ddy = by - ay;

  let bestT = Infinity;
  let best: XY = { x: cx, y: cy };

  const consider = (t: number, px: number, py: number) => {
    if (t <= 1e-9 || t >= bestT) return;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const onVertical =
      (Math.abs(px - xmin) < 1e-5 || Math.abs(px - xmax) < 1e-5) &&
      py >= ymin - 1e-5 &&
      py <= ymax + 1e-5;
    const onHorizontal =
      (Math.abs(py - ymin) < 1e-5 || Math.abs(py - ymax) < 1e-5) &&
      px >= xmin - 1e-5 &&
      px <= xmax + 1e-5;
    if (!(onVertical || onHorizontal)) return;
    bestT = t;
    best = { x: px, y: py };
  };

  if (Math.abs(ddx) > 1e-14) {
    const tMin = (xmin - ax) / ddx;
    consider(tMin, xmin, ay + tMin * ddy);
    const tMax = (xmax - ax) / ddx;
    consider(tMax, xmax, ay + tMax * ddy);
  }
  if (Math.abs(ddy) > 1e-14) {
    const tBottom = (ymin - ay) / ddy;
    consider(tBottom, ax + tBottom * ddx, ymin);
    const tTop = (ymax - ay) / ddy;
    consider(tTop, ax + tTop * ddx, ymax);
  }

  if (!Number.isFinite(bestT)) {
    return getIntersectionPoint(rect, {
      centerX: ax,
      centerY: ay,
      halfW: 1,
      halfH: 1,
    });
  }

  return best;
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

function getStraightArrowHeadPath(start: XY, end: XY) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return getArrowHeadPath(end, { x: ux, y: uy });
}

/** Полилиния для штриха: последняя точка — середина наконечника (линия не заходит под остриё). */
function shortenChainEndAtArrowMid(vertexChain: XY[]): XY[] {
  if (vertexChain.length < 2) return vertexChain;
  const tip = vertexChain[vertexChain.length - 1]!;
  const prev = vertexChain[vertexChain.length - 2]!;
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const halfArrow = EDGE_ARROW_LENGTH / 2;
  const back = Math.min(halfArrow, Math.max(0, len - 0.75));
  if (back <= 1e-9) return vertexChain;
  const ux = dx / len;
  const uy = dy / len;
  const lineEnd = { x: tip.x - ux * back, y: tip.y - uy * back };
  return [...vertexChain.slice(0, -1), lineEnd];
}

type BoundaryEdgeFlowData = {
  waypoints?: EdgeWaypoint[];
};

const EMPTY_EDGE_WAYPOINTS: EdgeWaypoint[] = [];

function BoundaryStraightEdge({
  id,
  source,
  target,
  style,
  selected,
  data,
}: EdgeProps<Edge<BoundaryEdgeFlowData>>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const reactFlow = useReactFlow();
  const waypointActions = useContext(EdgeWaypointActionsContext);

  const committedWaypoints = useMemo(
    () => data?.waypoints ?? EMPTY_EDGE_WAYPOINTS,
    [data?.waypoints],
  );
  const [dragWaypoints, setDragWaypoints] = useState<EdgeWaypoint[] | null>(null);
  const dragDraftRef = useRef<EdgeWaypoint[] | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const displayWaypoints = dragWaypoints ?? committedWaypoints;

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const geometry = useMemo(() => {
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

    let sourcePoint: XY;
    let targetPoint: XY;

    if (displayWaypoints.length === 0) {
      sourcePoint = nudgePointTowards(
        getIntersectionPoint(sourceRect, targetRect),
        rectCenter(targetRect),
        1,
      );
      targetPoint = getIntersectionPoint(targetRect, sourceRect);
    } else {
      const towardFirst = displayWaypoints[0]!;
      sourcePoint = nudgePointTowards(boundaryExitToward(sourceRect, towardFirst), towardFirst, 1);

      const approachLast = displayWaypoints[displayWaypoints.length - 1]!;
      targetPoint = boundaryEntryFromApproach(targetRect, approachLast);
    }

    return { sourcePoint, targetPoint };
  }, [displayWaypoints, sourceNode, targetNode]);

  const vertexChain = useMemo(() => {
    if (!geometry) return [];
    return [geometry.sourcePoint, ...displayWaypoints, geometry.targetPoint];
  }, [geometry, displayWaypoints]);

  const vertexChainForStroke = useMemo(
    () => shortenChainEndAtArrowMid(vertexChain),
    [vertexChain],
  );

  const curve = useMemo(() => {
    if (vertexChainForStroke.length < 2) return null;
    return roundedPolylinePath(vertexChainForStroke, EDGE_CORNER_RADIUS);
  }, [vertexChainForStroke]);

  const arrowHeadPath = useMemo(() => {
    if (!geometry || vertexChain.length < 2) return "";
    const tip = geometry.targetPoint;
    const prev = vertexChain[vertexChain.length - 2]!;
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return getArrowHeadPath(tip, { x: dx / len, y: dy / len });
  }, [geometry, vertexChain]);

  const stopDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  const finishWaypointDrag = useCallback(() => {
    const final = dragDraftRef.current;
    dragDraftRef.current = null;
    stopDragListeners();
    setDragWaypoints(null);
    if (final && waypointActions) {
      waypointActions.updateWaypoints(id, final);
    }
  }, [id, stopDragListeners, waypointActions]);

  const beginWaypointDrag = useCallback(
    (setupDraft: () => EdgeWaypoint[], dragIndex: number) => (event: ReactPointerEvent<SVGElement>) => {
      const wa = waypointActions;
      if (!wa?.isEditor) return;
      event.stopPropagation();
      event.preventDefault();

      const draft = setupDraft();
      const snapWp = wa.gridSnapEnabled && !event.ctrlKey;
      if (snapWp && draft[dragIndex]) {
        draft[dragIndex] = snapFlowTopLeftToGrid(draft[dragIndex]!);
      }
      dragDraftRef.current = draft;
      setDragWaypoints(draft);

      const onMove = (ev: PointerEvent) => {
        let p = reactFlow.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        if (wa.gridSnapEnabled && !ev.ctrlKey) {
          p = snapFlowTopLeftToGrid(p);
        }
        const base = dragDraftRef.current ?? draft;
        const next = [...base];
        next[dragIndex] = p;
        dragDraftRef.current = next;
        setDragWaypoints(next);
      };

      const onUp = () => {
        finishWaypointDrag();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      dragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
    },
    [finishWaypointDrag, reactFlow, waypointActions],
  );

  const removeWaypointAtIndex = useCallback(
    (index: number) => {
      if (!waypointActions?.isEditor) return;
      stopDragListeners();
      const base = dragDraftRef.current ?? committedWaypoints;
      dragDraftRef.current = null;
      setDragWaypoints(null);
      if (index < 0 || index >= base.length) return;
      const next = base.filter((_, i) => i !== index);
      waypointActions.updateWaypoints(id, next);
    },
    [committedWaypoints, id, stopDragListeners, waypointActions],
  );

  const showWaypointHandles = Boolean(selected && waypointActions?.isEditor && geometry);
  const highlightedWaypointKeys = waypointActions?.highlightedWaypointKeys ?? new Set<string>();
  const selectedWaypointKeys = waypointActions?.selectedWaypointKeys ?? new Set<string>();

  const segmentMidHandles = useMemo(() => {
    if (!showWaypointHandles || vertexChain.length < 2) return [];
    const handles: { key: string; cx: number; cy: number; segmentIndex: number }[] = [];
    for (let i = 0; i < vertexChain.length - 1; i++) {
      const a = vertexChain[i]!;
      const b = vertexChain[i + 1]!;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const allowMid =
        displayWaypoints.length === 0 ? i === 0 : dist >= EDGE_MIN_SEGMENT_FOR_MID_HANDLE;
      if (!allowMid) continue;
      handles.push({
        key: `mid-${i}`,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        segmentIndex: i,
      });
    }
    return handles;
  }, [displayWaypoints.length, showWaypointHandles, vertexChain]);

  const sourceComputed = (sourceNode?.data as GoalNodeData | undefined)?.computedState;
  const strokeColor = useMemo(
    () => strokeForDependencyEdge(sourceComputed, Boolean(selected)),
    [selected, sourceComputed],
  );

  if (!geometry || !curve) return null;

  const { sourcePoint, targetPoint } = geometry;
  const edgePath = curve.d;

  const strokeW = selected ? EDGE_WIDTH * 1.85 : EDGE_WIDTH;

  return (
    <g data-id={id}>
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={EDGE_HIT_WIDTH}
        pointerEvents="stroke"
      />
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeW}
        style={{ ...(style as CSSProperties | undefined), stroke: strokeColor, strokeWidth: strokeW }}
      />
      <path
        d={arrowHeadPath}
        fill="rgba(0,0,0,0.001)"
        stroke="rgba(0,0,0,0.001)"
        strokeWidth={4}
        pointerEvents="all"
      />
      <path d={arrowHeadPath} fill={strokeColor} style={{ fill: strokeColor }} />

      {showWaypointHandles
        ? displayWaypoints.map((wp, index) => (
            <circle
              key={`wp-${index}`}
              className="nopan nodrag"
              cx={wp.x}
              cy={wp.y}
              r={EDGE_HANDLE_RADIUS}
              fill="#D39A43"
              stroke="rgba(242,238,230,.85)"
              strokeWidth={1}
              style={{ cursor: "grab", pointerEvents: "all" }}
              onPointerDown={(event) => {
                waypointActions?.toggleWaypointSelection(id, index, event.shiftKey);
                beginWaypointDrag(() => [...committedWaypoints], index)(event);
              }}
              onDoubleClick={(event: ReactMouseEvent<SVGCircleElement>) => {
                event.preventDefault();
                event.stopPropagation();
                removeWaypointAtIndex(index);
              }}
              onContextMenu={(event: ReactMouseEvent<SVGCircleElement>) => {
                event.preventDefault();
                event.stopPropagation();
                removeWaypointAtIndex(index);
              }}
            >
              <title>Перетащить · двойной клик или ПКМ — удалить точку</title>
            </circle>
          ))
        : null}
      {waypointActions?.isEditor
        ? displayWaypoints.map((wp, index) => {
            const key = `${id}:${index}`;
            if (!highlightedWaypointKeys.has(key) && !selectedWaypointKeys.has(key)) return null;
            return (
              <circle
                key={`hl-${key}`}
                cx={wp.x}
                cy={wp.y}
                r={EDGE_HANDLE_RADIUS + 2}
                fill="rgba(211,154,67,.22)"
                stroke="rgba(211,154,67,.95)"
                strokeWidth={1}
                pointerEvents="none"
              />
            );
          })
        : null}

      {showWaypointHandles
        ? segmentMidHandles.map((h) => (
            <circle
              key={h.key}
              className="nopan nodrag"
              cx={h.cx}
              cy={h.cy}
              r={EDGE_MID_HANDLE_RADIUS}
              fill="rgba(211,154,67,.28)"
              stroke="rgba(211,154,67,.65)"
              strokeWidth={1}
              strokeDasharray="3 3"
              style={{ cursor: "crosshair", pointerEvents: "all" }}
              onPointerDown={beginWaypointDrag(() => {
                const verts = [sourcePoint, ...committedWaypoints, targetPoint];
                const mid = {
                  x: (verts[h.segmentIndex]!.x + verts[h.segmentIndex + 1]!.x) / 2,
                  y: (verts[h.segmentIndex]!.y + verts[h.segmentIndex + 1]!.y) / 2,
                };
                return [
                  ...committedWaypoints.slice(0, h.segmentIndex),
                  mid,
                  ...committedWaypoints.slice(h.segmentIndex),
                ];
              }, h.segmentIndex)}
            />
          ))
        : null}
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

  const arrowPath = getStraightArrowHeadPath(sourceAnchor, targetAnchor);

  return (
    <g>
      <path
        d={`M ${sourceAnchor.x} ${sourceAnchor.y} L ${targetAnchor.x} ${targetAnchor.y}`}
        fill="none"
        stroke={EDGE_STROKE_MUTED}
        strokeWidth={EDGE_WIDTH}
      />
      <path d={arrowPath} fill={EDGE_STROKE_MUTED} />
    </g>
  );
}

function GoalNode({ data, selected }: NodeProps<Node<GoalNodeData>>) {
  const tone = stateTone[data.computedState];
  const isDone = data.computedState === "DONE";
  const isDimmed =
    !isDone && (data.computedState === "LOCKED" || data.computedState === "BLOCKED");
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
        isDone
          ? "border-[#4D6A40]/45 bg-[#0F150F] opacity-[0.88] saturate-[0.85] shadow-[0_8px_20px_rgba(40,80,40,0.12)]"
          : `${tone.border} ${tone.card} ${
              isDimmed
                ? "!border-white/[0.07] !bg-[#121413] shadow-[0_10px_28px_rgba(0,0,0,0.48)]"
                : ""
            }`
      } ${
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
          <p
            className={`truncate text-[15px] font-semibold ${
              isDone ? "text-[#B8C9A8]" : isDimmed ? "text-[#BAB3A8]" : "text-[#F2EEE6]"
            }`}
          >
            {data.title || "Untitled goal"}
          </p>
          <p
            className={`mt-1 text-[11px] ${isDone ? "text-[#7A8B6C]" : isDimmed ? "text-[#6E6A62]" : "text-[#B8B0A3]"}`}
          >
            {typeLabel[data.type]}
          </p>
        </div>
        {isDone ? (
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#6B8F52]/55 bg-[#152018]"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#8FD973]" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
        )}
      </div>

      <div className="relative z-10 mt-3 flex items-center justify-between">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${tone.chip}`}>
          {stateChipLabel(data.computedState, data.lockReason)}
        </span>
        <span className={`text-[11px] ${priorityTone(data.priority)}`}>⚑ {priorityLabel(data.priority)}</span>
      </div>

    </div>
  );
}

const statusOptions: GoalStatus[] = ["TODO", "ACTIVE", "DONE", "BLOCKED", "DROPPED"];
const typeOptions: GoalType[] = ["EPIC", "MILESTONE", "TASK", "HABIT"];

type DetailDropdownKind = "status" | "priority" | "type";

function getComputedNodeState(
  node: Node<GoalNodeData>,
  nodes: Node<GoalNodeData>[],
  edges: Edge[],
): { computedState: ComputedState; lockReason: GoalNodeData["lockReason"] } {
  if (node.data.status === "DONE") return { computedState: "DONE", lockReason: null };
  if (node.data.status === "DROPPED") return { computedState: "DROPPED", lockReason: null };
  if (node.data.status === "BLOCKED") return { computedState: "BLOCKED", lockReason: null };

  if (isBeforeStartCalendarDay(node.data.startsOn)) {
    return { computedState: "LOCKED", lockReason: "schedule" };
  }

  const blockers = edges
    .filter((edge) => edge.source && edge.target === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.source))
    .filter((candidate): candidate is Node<GoalNodeData> => Boolean(candidate))
    .filter((candidate) => candidate.data.status !== "DONE");

  if (blockers.length > 0) return { computedState: "LOCKED", lockReason: "deps" };
  if (node.data.status === "ACTIVE") return { computedState: "ACTIVE", lockReason: null };
  return { computedState: "AVAILABLE", lockReason: null };
}

function applyComputedStates(nodes: Node<GoalNodeData>[], edges: Edge[]) {
  return nodes.map((node) => {
    const { computedState, lockReason } = getComputedNodeState(node, nodes, edges);
    return {
      ...node,
      data: {
        ...node.data,
        computedState,
        lockReason,
      },
    };
  });
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
      lockReason: null,
      startsOn: normalizeGoalStartsOn(goal.startsOn),
      isConnecting: false,
    },
    draggable: true,
  };
}

function toFlowEdge(edge: ApiEdge, selectable = true): Edge {
  const waypoints = normalizeEdgeWaypointsArray(edge.waypoints);
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    type: "boundaryStraight",
    data: {
      ...(waypoints.length > 0 ? { waypoints } : {}),
      linkType: edge.type,
    },
    selectable,
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
  const flowEdges = edges.map((edge) => toFlowEdge(edge));
  const baseNodes = spreadOverlappingNodes(goals.map(toFlowNode));
  return applyComputedStates(baseNodes, flowEdges);
}

/** Иконка «magnet» из Lucide Icons (ISC); подгонена под stroke-панель React Flow. */
function MagnetToolbarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m12 15 4 4" />
      <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z" />
      <path d="m5 8 4 4" />
    </svg>
  );
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
  publicShareTokenFromPage?: string | null;
  publicBoardTitle?: string;
  initialGraph: GraphResponse;
  initialNext: NextGoalItem[];
  initialUserUiSettings?: UserUiSettings | null;
};

type FlowContextMenuState =
  | { kind: "node"; clientX: number; clientY: number; nodeId: string }
  | {
      /** ПКМ по оверлею мультивыделения (`NodesSelection`), а не по самому узлу */
      kind: "selection";
      clientX: number;
      clientY: number;
      anchorNodeId: string;
    }
  | { kind: "pane"; clientX: number; clientY: number; flowX: number; flowY: number };

function GoalGraphClientInner({
  boards,
  currentBoardId,
  currentBoardRole,
  currentUserEmail,
  isPublicView = false,
  publicShareTokenFromPage = null,
  publicBoardTitle,
  initialGraph,
  initialNext,
  initialUserUiSettings = null,
}: GoalGraphClientInnerProps) {
  const isEditor =
    !isPublicView && (currentBoardRole === "OWNER" || currentBoardRole === "EDITOR");

  const userUiDefaults = initialUserUiSettings ?? DEFAULT_USER_UI_SETTINGS;

  const persistUserUiSettings = useCallback(
    (patch: Partial<UserUiSettings>) => {
      if (isPublicView || !currentUserEmail) return;
      void fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    },
    [currentUserEmail, isPublicView],
  );

  const reactFlow = useReactFlow<Node<GoalNodeData>, Edge>();
  const flowSectionRef = useRef<HTMLElement | null>(null);
  const [nodes, setNodes] = useState<Node<GoalNodeData>[]>(() =>
    buildFlowNodes(initialGraph.goals, initialGraph.edges),
  );
  const nodesRef = useRef(nodes);
  const [edges, setEdges] = useState<Edge[]>(() =>
    initialGraph.edges.map((edge) => toFlowEdge(edge, isEditor)),
  );
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const skipGraphHistoryRef = useRef(false);
  const graphHistoryRef = useRef<{ entries: string[]; index: number }>({ entries: [], index: 0 });
  const [historyNav, setHistoryNav] = useState({ index: 0, entryCount: 1 });
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);

  /** Перетаскивание группы узлов: эталонные точки траектории для рёбер между двумя выбранными узлами. */
  const nodeDragWaypointsRef = useRef<{
    anchorStart: { x: number; y: number };
    internalEdges: { id: string; waypoints: EdgeWaypoint[]; movableIndexes: number[] }[];
  } | null>(null);
  const [highlightedWaypointKeys, setHighlightedWaypointKeys] = useState<Set<string>>(new Set());
  const [selectedWaypointKeys, setSelectedWaypointKeys] = useState<Set<string>>(new Set());
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ x0: number; y0: number; x1: number; y1: number; ox: number; oy: number } | null>(null);
  const selectionBoxRef = useRef<{ x0: number; y0: number; x1: number; y1: number; ox: number; oy: number } | null>(null);
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    const nextIds = new Set(selectedNodes.map((n) => n.id));
    setSelectedNodeIds((prev) => {
      if (prev.size === nextIds.size) {
        let same = true;
        for (const id of prev) {
          if (!nextIds.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return nextIds;
    });
  }, []);
  const [nextGoals, setNextGoals] = useState<NextGoalItem[]>(initialNext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalIdState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [boardMembers, setBoardMembers] = useState<BoardMemberItem[]>([]);
  const [publicShareToken, setPublicShareToken] = useState<string | null>(
    publicShareTokenFromPage ?? boards.find((board) => board.id === currentBoardId)?.publicShareToken ?? null,
  );
  const [goalChangesOpen, setGoalChangesOpen] = useState(false);
  const [goalChanges, setGoalChanges] = useState<
    Array<{ id: string; changedField: string; oldValue: string | null; newValue: string | null; userEmail: string | null; createdAt: string }>
  >([]);
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
  const [editingCardTitle, setEditingCardTitle] = useState(false);
  const cardTitleInputRef = useRef<HTMLInputElement | null>(null);

  const setSelectedGoalId = useCallback((action: SetStateAction<string | null>) => {
    setEditingCardTitle(false);
    setSelectedGoalIdState(action);
  }, []);

  const selectGoalId = useCallback((goalId: string | null) => {
    setOpenDetailDropdown(null);
    setSelectedGoalId(goalId);
  }, [setSelectedGoalId]);

  useLayoutEffect(() => {
    if (!editingCardTitle) return;
    const el = cardTitleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingCardTitle]);

  const detailDropdownTriggersRef = useRef<HTMLDivElement | null>(null);
  const detailDropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const detailStatusAnchorRef = useRef<HTMLButtonElement | null>(null);
  const detailPriorityAnchorRef = useRef<HTMLButtonElement | null>(null);
  const detailTypeAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(userUiDefaults.graphLeftSidebarOpen);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(userUiDefaults.graphRightSidebarOpen);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [flowContextMenu, setFlowContextMenu] = useState<FlowContextMenuState | null>(null);
  const flowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const prevLeftSidebarOpenRef = useRef(leftSidebarOpen);
  const [gridSnapEnabled, setGridSnapEnabled] = useState(userUiDefaults.graphGridSnapEnabled);
  /** Зажатый Ctrl временно отключает привязку к сетке при перетаскивании узлов и точек связи. */
  const [ctrlHeldForSnapBypass, setCtrlHeldForSnapBypass] = useState(false);
  const [dragSnapBypass, setDragSnapBypass] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCtrlHeldForSnapBypass(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCtrlHeldForSnapBypass(false);
      }
    };
    const resetCtrlSnapBypass = () => setCtrlHeldForSnapBypass(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", resetCtrlSnapBypass);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        resetCtrlSnapBypass();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", resetCtrlSnapBypass);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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

  useLayoutEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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

  const syncHistoryNavFromRef = useCallback(() => {
    const h = graphHistoryRef.current;
    setHistoryNav({
      index: h.index,
      entryCount: Math.max(1, h.entries.length),
    });
  }, []);

  const commitGraphHistory = useCallback(
    (nextNodes: Node<GoalNodeData>[], nextEdges: Edge[]) => {
      if (!isEditor || isPublicView) return;
      if (skipGraphHistoryRef.current) return;
      const snap = serializeGraphSnapshot(nextNodes, nextEdges);
      const h = graphHistoryRef.current;
      const tip = h.entries[h.index];
      if (tip !== undefined && snapshotsSemanticallyEqual(tip, snap)) {
        return;
      }
      const nextEntries = h.entries.slice(0, h.index + 1);
      nextEntries.push(snap);
      while (nextEntries.length > GRAPH_HISTORY_MAX_ENTRIES) {
        nextEntries.shift();
      }
      const index = nextEntries.length - 1;
      graphHistoryRef.current = { entries: nextEntries, index };
      writePersistedGraphHistory(currentBoardId, nextEntries, index);
      syncHistoryNavFromRef();
    },
    [currentBoardId, isEditor, isPublicView, syncHistoryNavFromRef],
  );

  const resetGraphHistoryFromSnapshot = useCallback(
    (nextNodes: Node<GoalNodeData>[], nextEdges: Edge[]) => {
      if (!isEditor || isPublicView) return;
      const snap = serializeGraphSnapshot(nextNodes, nextEdges);
      graphHistoryRef.current = { entries: [snap], index: 0 };
      writePersistedGraphHistory(currentBoardId, [snap], 0);
      syncHistoryNavFromRef();
    },
    [currentBoardId, isEditor, isPublicView, syncHistoryNavFromRef],
  );

  useLayoutEffect(() => {
    if (!isEditor || isPublicView) return;
    const n0 = buildFlowNodes(initialGraph.goals, initialGraph.edges);
    const e0 = initialGraph.edges.map((edge) => toFlowEdge(edge, isEditor));
    const initialSnap = serializeGraphSnapshot(n0, e0);
    const persisted = readPersistedGraphHistory(currentBoardId);
    if (
      persisted &&
      persisted.entries.length > 0 &&
      persisted.entries[0] === initialSnap &&
      persisted.index < persisted.entries.length
    ) {
      graphHistoryRef.current = {
        entries: persisted.entries,
        index: Math.min(persisted.index, persisted.entries.length - 1),
      };
    } else {
      graphHistoryRef.current = { entries: [initialSnap], index: 0 };
      writePersistedGraphHistory(currentBoardId, [initialSnap], 0);
    }
    queueMicrotask(() => {
      syncHistoryNavFromRef();
    });
    // initialGraph — только начальная загрузка для этой доски (при смене boardId).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- см. выше
  }, [currentBoardId, isEditor, isPublicView, syncHistoryNavFromRef]);

  const selectedGoalNode = useMemo(
    () => nodes.find((node) => node.id === selectedGoalId) ?? null,
    [nodes, selectedGoalId],
  );

  const canUndoGraph = historyNav.index > 0 && !isHistorySyncing;
  const canRedoGraph = historyNav.index < historyNav.entryCount - 1 && !isHistorySyncing;

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
    () =>
      activeGoals
        .filter((goal) => matchesSearch(goal.title))
        .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title)),
    [activeGoals, matchesSearch],
  );
  const availableGoalsFiltered = useMemo(
    () =>
      availableGoals
        .filter((goal) => matchesSearch(goal.title))
        .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title)),
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

  const focusGoal = useCallback(
    (goalId: string) => {
      selectGoalId(goalId);
    },
    [selectGoalId],
  );

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

  useEffect(() => {
    if (!isEditor || isPublicView) return;
    const host = flowSectionRef.current;
    if (!host) return;

    let startClient: { x: number; y: number } | null = null;
    let active = false;

    const onPointerDown = (event: PointerEvent) => {
      if (!event.shiftKey || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".react-flow__node,.react-flow__edge,.react-flow__controls,.react-flow__minimap")) return;
      startClient = { x: event.clientX, y: event.clientY };
      active = true;
      const r = host.getBoundingClientRect();
      const next = { x0: event.clientX, y0: event.clientY, x1: event.clientX, y1: event.clientY, ox: r.left, oy: r.top };
      selectionBoxRef.current = next;
      setSelectionBox(next);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!active || !startClient) return;
      setSelectionBox((prev) => {
        if (!prev) return prev;
        const next = { ...prev, x1: event.clientX, y1: event.clientY };
        selectionBoxRef.current = next;
        return next;
      });
    };
    const onPointerUp = () => {
      const box = selectionBoxRef.current;
      if (!active || !box) return;
      active = false;
      const startFlow = reactFlow.screenToFlowPosition({ x: box.x0, y: box.y0 });
      const endFlow = reactFlow.screenToFlowPosition({ x: box.x1, y: box.y1 });
      const minX = Math.min(startFlow.x, endFlow.x);
      const maxX = Math.max(startFlow.x, endFlow.x);
      const minY = Math.min(startFlow.y, endFlow.y);
      const maxY = Math.max(startFlow.y, endFlow.y);
      const hitNodes = new Set(
        nodesRef.current
          .filter((n) => {
            const { width, height } = measuredGoalNodeSize(n);
            const left = n.position.x;
            const top = n.position.y;
            const right = left + width;
            const bottom = top + height;
            return !(right < minX || left > maxX || bottom < minY || top > maxY);
          })
          .map((n) => n.id),
      );
      const hitWps = new Set<string>();
      for (const e of edgesRef.current) {
        const wps = normalizeEdgeWaypointsArray((e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints);
        wps.forEach((wp, i) => {
          if (wp.x >= minX && wp.x <= maxX && wp.y >= minY && wp.y <= maxY) hitWps.add(`${e.id}:${i}`);
        });
      }
      setSelectedNodeIds(hitNodes);
      setSelectedWaypointKeys(hitWps);
      selectionBoxRef.current = null;
      setSelectionBox(null);
    };

    host.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isEditor, isPublicView, reactFlow]);

  const loadGraph = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint =
        isPublicView && publicShareToken
          ? `/api/public/${encodeURIComponent(publicShareToken)}/graph`
          : withBoard("/api/graph");
      const response = await fetch(endpoint);
      const data = await parseJson<GraphResponse>(response);
      const nextEdges = data.edges.map((edge) => toFlowEdge(edge, isEditor));
      const nextNodes = buildFlowNodes(data.goals, data.edges);
      setNodes(nextNodes);
      setEdges(nextEdges);
      resetGraphHistoryFromSnapshot(nextNodes, nextEdges);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load graph");
    } finally {
      setIsLoading(false);
    }
  }, [isEditor, isPublicView, publicShareToken, resetGraphHistoryFromSnapshot, withBoard]);

  const loadNext = useCallback(async () => {
    try {
      const response = await fetch(withBoard("/api/next"));
      const data = await parseJson<NextGoalItem[]>(response);
      setNextGoals(data);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load next goals");
    }
  }, [withBoard]);

  const undoGraph = useCallback(async () => {
    if (!isEditor || isPublicView || isHistorySyncing) return;
    const h = graphHistoryRef.current;
    if (h.index <= 0) return;
    const newIndex = h.index - 1;
    const raw = h.entries[newIndex]!;

    setIsHistorySyncing(true);
    setError(null);
    try {
      logDevGraphHistoryDiff(h.entries[h.index]!, raw, "undo");
      await applyGraphSnapshotToServer({
        targetSnapshotJson: raw,
        currentNodes: nodesRef.current,
        currentEdges: edgesRef.current,
        withBoard,
      });
      const parsed = deserializeGraphSnapshot(raw, isEditor);
      if (!parsed) {
        throw new Error("Некорректный снимок графа");
      }
      skipGraphHistoryRef.current = true;
      setNodes(applyComputedStates(parsed.nodes as Node<GoalNodeData>[], parsed.edges));
      setEdges(parsed.edges);
      graphHistoryRef.current = { ...h, index: newIndex };
      writePersistedGraphHistory(currentBoardId, h.entries, newIndex);
      skipGraphHistoryRef.current = false;
      setSelectedGoalId((sel) =>
        sel && (parsed.nodes as Node<GoalNodeData>[]).some((n) => n.id === sel) ? sel : null,
      );
      syncHistoryNavFromRef();
      void loadNext();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Не удалось откатить граф");
      await loadGraph();
    } finally {
      setIsHistorySyncing(false);
    }
  }, [
    currentBoardId,
    isEditor,
    isHistorySyncing,
    isPublicView,
    loadGraph,
    loadNext,
    setSelectedGoalId,
    syncHistoryNavFromRef,
    withBoard,
  ]);

  const redoGraph = useCallback(async () => {
    if (!isEditor || isPublicView || isHistorySyncing) return;
    const h = graphHistoryRef.current;
    if (h.index >= h.entries.length - 1) return;
    const newIndex = h.index + 1;
    const raw = h.entries[newIndex]!;

    setIsHistorySyncing(true);
    setError(null);
    try {
      logDevGraphHistoryDiff(h.entries[h.index]!, raw, "redo");
      await applyGraphSnapshotToServer({
        targetSnapshotJson: raw,
        currentNodes: nodesRef.current,
        currentEdges: edgesRef.current,
        withBoard,
      });
      const parsed = deserializeGraphSnapshot(raw, isEditor);
      if (!parsed) {
        throw new Error("Некорректный снимок графа");
      }
      skipGraphHistoryRef.current = true;
      setNodes(applyComputedStates(parsed.nodes as Node<GoalNodeData>[], parsed.edges));
      setEdges(parsed.edges);
      graphHistoryRef.current = { ...h, index: newIndex };
      writePersistedGraphHistory(currentBoardId, h.entries, newIndex);
      skipGraphHistoryRef.current = false;
      setSelectedGoalId((sel) =>
        sel && (parsed.nodes as Node<GoalNodeData>[]).some((n) => n.id === sel) ? sel : null,
      );
      syncHistoryNavFromRef();
      void loadNext();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Не удалось повторить шаг");
      await loadGraph();
    } finally {
      setIsHistorySyncing(false);
    }
  }, [
    currentBoardId,
    isEditor,
    isHistorySyncing,
    isPublicView,
    loadGraph,
    loadNext,
    setSelectedGoalId,
    syncHistoryNavFromRef,
    withBoard,
  ]);

  useEffect(() => {
    if (!isEditor || isPublicView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "z" || event.key === "Z") {
        if (event.shiftKey) {
          event.preventDefault();
          void redoGraph();
        } else {
          event.preventDefault();
          void undoGraph();
        }
      }
      if (event.key === "y" && event.ctrlKey) {
        event.preventDefault();
        void redoGraph();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isEditor, isPublicView, redoGraph, undoGraph]);

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
        setNodes((prev) => {
          const nextNodes = applyComputedStates([...prev, toFlowNode(goal)], edgesRef.current);
          if (!skipGraphHistoryRef.current) {
            commitGraphHistory(nextNodes, edgesRef.current);
          }
          return nextNodes;
        });
        void loadNext();
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Failed to create goal");
      }
    },
    [commitGraphHistory, isEditor, loadNext, withBoard],
  );

  const createGoal = useCallback(() => {
    const pos = getNextGoalPosition();
    void createGoalWithPosition(pos.x, pos.y);
  }, [createGoalWithPosition, getNextGoalPosition]);

  const updateGoal = useCallback(
    async (
      goalId: string,
      patch: Partial<
        Pick<ApiGoal, "title" | "description" | "status" | "priority" | "type" | "x" | "y" | "startsOn">
      >,
      options?: { recordHistory?: boolean },
    ) => {
      if (!isEditor) {
        setError("У вас только read-only доступ к этой доске.");
        return;
      }

      const recordHistory = options?.recordHistory !== false;

      setError(null);

      try {
        const response = await fetch(withBoard(`/api/goals/${goalId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        const updated = await parseJson<ApiGoal>(response);
        setNodes((prev) => {
          const nextNodes = applyComputedStates(
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
                      startsOn: normalizeGoalStartsOn(updated.startsOn),
                    },
                  }
                : node,
            ),
            edgesRef.current,
          );
          if (recordHistory && !skipGraphHistoryRef.current) {
            commitGraphHistory(nextNodes, edgesRef.current);
          }
          return nextNodes;
        });
        void loadNext();
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Failed to update goal");
      }
    },
    [commitGraphHistory, isEditor, loadNext, withBoard],
  );

  const updateGoalRef = useRef(updateGoal);
  useLayoutEffect(() => {
    updateGoalRef.current = updateGoal;
  }, [updateGoal]);

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
        const nextNodes = nodesRef.current.filter((node) => node.id !== goalId);
        const nextEdges = edgesRef.current.filter(
          (edge) => edge.source !== goalId && edge.target !== goalId,
        );
        setNodes(nextNodes);
        setEdges(nextEdges);
        if (!skipGraphHistoryRef.current) {
          commitGraphHistory(nextNodes, nextEdges);
        }
        setOpenDetailDropdown(null);
        setSelectedGoalId((prev) => (prev === goalId ? null : prev));
        void loadNext();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to delete goal");
      }
    },
    [commitGraphHistory, isEditor, loadNext, setSelectedGoalId, withBoard],
  );

  const deleteGoal = useCallback(async () => {
    if (!selectedGoalId) return;
    await deleteGoalById(selectedGoalId);
  }, [deleteGoalById, selectedGoalId]);

  const onNodesChange = useCallback((changes: NodeChange<Node<GoalNodeData>>[]) => {
    const filtered = isEditor ? changes : changes.filter((c) => c.type !== "position");
    setNodes((prev) => applyNodeChanges<Node<GoalNodeData>>(filtered, prev));
  }, [isEditor]);

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
      const nextEdges = addEdge(toFlowEdge(edge, isEditor), edgesRef.current);
      const nextNodes = applyComputedStates(nodesRef.current, nextEdges);
      setEdges(nextEdges);
      setNodes(nextNodes);
      if (!skipGraphHistoryRef.current) {
        commitGraphHistory(nextNodes, nextEdges);
      }
      void loadNext();
    } catch (connectError) {
      if (connectError instanceof Error) {
        setError(getConnectErrorMessage(connectError.message));
      } else {
        setError("Не удалось создать связь.");
      }
    }
  }, [commitGraphHistory, isEditor, loadNext, withBoard]);

  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler<Node<GoalNodeData>>>(
    (_, node) => {
      selectGoalId(node.id);
    },
    [selectGoalId],
  );

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
      selectGoalId(node.id);
    },
    [isEditor, isPublicView, selectGoalId],
  );

  const onSelectionContextMenu = useCallback(
    (event: ReactMouseEvent, selectedNodes: Node<GoalNodeData>[]) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isEditor || isPublicView) return;
      if (selectedNodes.length < 2) return;

      const flowPoint = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let anchorNodeId = selectedNodes[0]!.id;
      for (const n of selectedNodes) {
        const { width: w, height: h } = measuredGoalNodeSize(n);
        const { x, y } = n.position;
        if (flowPoint.x >= x && flowPoint.x <= x + w && flowPoint.y >= y && flowPoint.y <= y + h) {
          anchorNodeId = n.id;
          break;
        }
      }

      setFlowContextMenu({
        kind: "selection",
        clientX: event.clientX,
        clientY: event.clientY,
        anchorNodeId,
      });
      selectGoalId(anchorNodeId);
    },
    [isEditor, isPublicView, reactFlow, selectGoalId],
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
      const nextEdges = edgesRef.current.filter((existing) => existing.id !== edge.id);
      const nextNodes = applyComputedStates(nodesRef.current, nextEdges);
      setEdges(nextEdges);
      setNodes(nextNodes);
      if (!skipGraphHistoryRef.current) {
        commitGraphHistory(nextNodes, nextEdges);
      }
      void loadNext();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete edge");
    }
  }, [commitGraphHistory, isEditor, loadNext, withBoard]);

  const updateEdgeWaypoints = useCallback(
    async (edgeId: string, waypoints: EdgeWaypoint[]) => {
      setEdges((prev) =>
        prev.map((edge) =>
          edge.id === edgeId ? { ...edge, data: { ...(edge.data ?? {}), waypoints } } : edge,
        ),
      );

      if (!isEditor) return;

      setError(null);
      try {
        const response = await fetch(withBoard(`/api/edges/${edgeId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waypoints }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((payload as { error?: string }).error ?? "Не удалось сохранить траекторию связи");
        }
        if (!skipGraphHistoryRef.current) {
          commitGraphHistory(nodesRef.current, edgesRef.current);
        }
      } catch (waypointError) {
        setError(waypointError instanceof Error ? waypointError.message : "Не удалось сохранить траекторию связи");
      }
    },
    [commitGraphHistory, isEditor, withBoard],
  );

  const onNodeDragStart = useCallback(
    (event: ReactMouseEvent, node: Node<GoalNodeData>, dragged: Node<GoalNodeData>[]) => {
      if (!isEditor) return;
      setDragSnapBypass(Boolean(event.ctrlKey));
      const selectedNow = nodesRef.current.filter((n) => selectedNodeIds.has(n.id));
      const group = selectedNow.length > 1 ? selectedNow : dragged.length > 0 ? dragged : [node];
      const groupIds = new Set(group.map((n) => n.id));
      const anchorStart = { x: node.position.x, y: node.position.y };
      const internalEdges: { id: string; waypoints: EdgeWaypoint[]; movableIndexes: number[] }[] = [];
      if (group.length === 0) return;
      for (const e of edgesRef.current) {
        const wps = normalizeEdgeWaypointsArray(
          (e.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints,
        );
        const movableIndexes = wps
          .map((_, index) => index)
          .filter((index) => selectedWaypointKeys.has(`${e.id}:${index}`));
        const isInternalGroupEdge = groupIds.has(e.source) && groupIds.has(e.target);
        const effectiveMovableIndexes =
          movableIndexes.length > 0
            ? movableIndexes
            : isInternalGroupEdge
              ? wps.map((_, index) => index)
              : [];
        if (effectiveMovableIndexes.length > 0) {
          internalEdges.push({
            id: e.id,
            waypoints: wps.map((w) => ({ x: w.x, y: w.y })),
            movableIndexes: effectiveMovableIndexes,
          });
        }
      }
      const keys = new Set<string>();
      for (const ie of internalEdges) for (const idx of ie.movableIndexes) keys.add(`${ie.id}:${idx}`);
      setHighlightedWaypointKeys(keys);
      nodeDragWaypointsRef.current = { anchorStart, internalEdges };
    },
    [isEditor, selectedNodeIds, selectedWaypointKeys],
  );

  const onNodeDrag = useCallback(
    (_event: ReactMouseEvent, node: Node<GoalNodeData>) => {
      const snap = nodeDragWaypointsRef.current;
      if (!snap || snap.internalEdges.length === 0) return;
      const dx = node.position.x - snap.anchorStart.x;
      const dy = node.position.y - snap.anchorStart.y;
      setEdges((prev) =>
        prev.map((edge) => {
          const hit = snap.internalEdges.find((ie) => ie.id === edge.id);
          if (!hit) return edge;
          const movable = new Set(hit.movableIndexes);
          const newWps = hit.waypoints.map((wp, index) =>
            movable.has(index) ? { x: wp.x + dx, y: wp.y + dy } : { x: wp.x, y: wp.y },
          );
          return { ...edge, data: { ...(edge.data ?? {}), waypoints: newWps } };
        }),
      );
    },
    [],
  );

  const onNodeDragStop = useCallback(
    async (_event: ReactMouseEvent, node: Node<GoalNodeData>, draggedNodes: Node<GoalNodeData>[]) => {
      if (!isEditor) return;
      setDragSnapBypass(false);

      const snap = nodeDragWaypointsRef.current;
      nodeDragWaypointsRef.current = null;
      setHighlightedWaypointKeys(new Set());

      const targets = draggedNodes.length > 0 ? draggedNodes : [node];

      for (const n of targets) {
        await updateGoal(n.id, {
          x: n.position.x,
          y: n.position.y,
        });
      }

      if (snap?.internalEdges.length) {
        for (const ie of snap.internalEdges) {
          const current = edgesRef.current.find((e) => e.id === ie.id);
          if (!current) continue;
          const wps = normalizeEdgeWaypointsArray(
            (current.data as { waypoints?: EdgeWaypoint[] } | undefined)?.waypoints,
          );
          if (wps.length > 0) {
            await updateEdgeWaypoints(ie.id, wps);
          }
        }
      }
    },
    [isEditor, updateEdgeWaypoints, updateGoal],
  );

  const edgeWaypointActionsValue = useMemo(
    () => ({
      isEditor,
      updateWaypoints: updateEdgeWaypoints,
      gridSnapEnabled: Boolean(isEditor && gridSnapEnabled),
      highlightedWaypointKeys,
      selectedWaypointKeys,
      toggleWaypointSelection: (edgeId: string, index: number, additive: boolean) => {
        const key = `${edgeId}:${index}`;
        setSelectedWaypointKeys((prev) => {
          const next = additive ? new Set(prev) : new Set<string>();
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      },
    }),
    [gridSnapEnabled, highlightedWaypointKeys, isEditor, selectedWaypointKeys, updateEdgeWaypoints],
  );

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
  const selectedStartsOn = selectedGoalNode?.data.startsOn ?? "";
  const loadGoalChanges = useCallback(async (goalId: string) => {
    if (isPublicView) return;
    try {
      const response = await fetch(withBoard(`/api/goals/history?id=${encodeURIComponent(goalId)}`));
      const data = await parseJson<Array<{ id: string; changedField: string; oldValue: string | null; newValue: string | null; userEmail: string | null; createdAt: string }>>(response);
      setGoalChanges(data);
    } catch {
      setGoalChanges([]);
    }
  }, [isPublicView, withBoard]);

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
    // Sync ref только при смене выбранной цели (id), не при каждом обновлении полей в nodes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGoalNode?.id]);

  useEffect(() => {
    const goalIdWhenFocused = selectedGoalId;

    return () => {
      if (!goalIdWhenFocused || !isEditor) return;
      const node = nodesRef.current.find((n) => n.id === goalIdWhenFocused);
      if (!node) return;
      void updateGoalRef.current(
        goalIdWhenFocused,
        {
          title: node.data.title,
          description: node.data.description,
        },
        { recordHistory: false },
      );
    };
  }, [selectedGoalId, isEditor]);
  useEffect(() => {
    if (!selectedGoalNode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGoalChanges(selectedGoalNode.id);
  }, [loadGoalChanges, selectedGoalNode]);

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

  const alignSelectedGoalsFromContextMenu = useCallback(
    async (mode: AlignGoalsMode, anchorNodeId: string) => {
      const currentNodes = nodesRef.current;
      const ids = currentNodes.filter((n) => n.selected).map((n) => n.id);
      if (ids.length < 2) return;

      const anchor =
        currentNodes.find((n) => n.id === anchorNodeId && ids.includes(n.id)) ??
        currentNodes.find((n) => ids.includes(n.id));
      if (!anchor) return;

      setFlowContextMenu(null);

      const { width: anchorW } = measuredGoalNodeSize(anchor);
      const ax = anchor.position.x;
      const ay = anchor.position.y;

      for (const id of ids) {
        const n = nodesRef.current.find((node) => node.id === id);
        if (!n) continue;

        const { width: w } = measuredGoalNodeSize(n);

        const patch: { x?: number; y?: number } = {};

        if (mode.layout === "row") {
          if (Math.abs(n.position.y - ay) > 0.5) patch.y = ay;
        } else {
          let nextX = ax;
          if (mode.edge === "center") nextX = ax + anchorW / 2 - w / 2;
          if (mode.edge === "right") nextX = ax + anchorW - w;
          if (Math.abs(n.position.x - nextX) > 0.5) patch.x = nextX;
        }

        if (patch.x !== undefined || patch.y !== undefined) {
          await updateGoal(id, patch, { recordHistory: false });
        }
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!skipGraphHistoryRef.current) {
        commitGraphHistory(nodesRef.current, edgesRef.current);
      }
    },
    [commitGraphHistory, updateGoal],
  );

  const snapSelectedGoalsToGridFromContextMenu = useCallback(async () => {
    const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
    if (ids.length < 2) return;

    setFlowContextMenu(null);

    if (!isEditor) {
      setError("У вас только read-only доступ к этой доске.");
      return;
    }

    for (const id of ids) {
      const n = nodesRef.current.find((node) => node.id === id);
      if (!n) continue;
      const snapped = snapFlowTopLeftToGrid(n.position);
      if (Math.abs(snapped.x - n.position.x) > 0.5 || Math.abs(snapped.y - n.position.y) > 0.5) {
        await updateGoal(id, { x: snapped.x, y: snapped.y }, { recordHistory: false });
      }
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!skipGraphHistoryRef.current) {
      commitGraphHistory(nodesRef.current, edgesRef.current);
    }
  }, [commitGraphHistory, isEditor, updateGoal]);

  const deleteMultipleGoalsFromContextMenu = useCallback(async () => {
    const ids = nodesRef.current.filter((n) => n.selected).map((n) => n.id);
    if (ids.length < 2) return;

    setFlowContextMenu(null);

    if (!isEditor) {
      setError("У вас только read-only доступ к этой доске.");
      return;
    }
    if (!window.confirm(`Удалить выбранные цели (${ids.length}) и связанные связи?`)) return;

    setError(null);

    try {
      await Promise.all(
        ids.map((id) =>
          fetch(withBoard(`/api/goals/${id}`), { method: "DELETE" }).then((response) => {
            if (!response.ok) throw new Error("Failed to delete goal");
          }),
        ),
      );
      const idSet = new Set(ids);
      const nextNodes = nodesRef.current.filter((node) => !idSet.has(node.id));
      const nextEdges = edgesRef.current.filter(
        (edge) => !idSet.has(edge.source) && !idSet.has(edge.target),
      );
      setNodes(nextNodes);
      setEdges(nextEdges);
      if (!skipGraphHistoryRef.current) {
        commitGraphHistory(nextNodes, nextEdges);
      }
      setOpenDetailDropdown(null);
      setSelectedGoalId((prev) => (prev && idSet.has(prev) ? null : prev));
      void loadNext();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete goals");
    }
  }, [commitGraphHistory, isEditor, loadNext, setSelectedGoalId, withBoard]);

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

  const flowMultiSelectedIds =
    flowContextMenu?.kind === "node" || flowContextMenu?.kind === "selection"
      ? nodes.filter((n) => n.selected).map((n) => n.id)
      : [];
  const showMultiGoalContextMenu =
    flowContextMenu?.kind === "selection" ||
    (flowContextMenu?.kind === "node" &&
      flowMultiSelectedIds.length >= 2 &&
      flowMultiSelectedIds.includes(flowContextMenu.nodeId));
  const multiGoalContextMenuAnchorId =
    flowContextMenu?.kind === "selection"
      ? flowContextMenu.anchorNodeId
      : flowContextMenu?.kind === "node"
        ? flowContextMenu.nodeId
        : "";

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
            onClick={() => {
              setLeftSidebarOpen(true);
              persistUserUiSettings({ graphLeftSidebarOpen: true });
            }}
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
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-[#B8B0A3]">{typeLabel[goal.type]}</span>
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
                onClick={() => {
                  setLeftSidebarOpen(false);
                  persistUserUiSettings({ graphLeftSidebarOpen: false });
                }}
              >
                <ChevronIcon direction="left" />
              </button>
            </div>
          </div>
        </aside>

        <section ref={flowSectionRef} className="goal-graph-flow relative h-full min-w-0 flex-1">
          {selectionBox ? (
            <div
              className="pointer-events-none absolute z-20 border border-[#D39A43] bg-[#D39A43]/15"
              style={{
                left: Math.min(selectionBox.x0, selectionBox.x1) - selectionBox.ox,
                top: Math.min(selectionBox.y0, selectionBox.y1) - selectionBox.oy,
                width: Math.abs(selectionBox.x1 - selectionBox.x0),
                height: Math.abs(selectionBox.y1 - selectionBox.y0),
              }}
            />
          ) : null}
          {error ? (
            <div className="absolute left-4 top-4 z-10 rounded-xl border border-[#A94F3D]/40 bg-[#2A1A18] px-3 py-2 text-sm text-[#F3B1A4]">
              {error}
            </div>
          ) : null}

          <EdgeWaypointActionsContext.Provider value={edgeWaypointActionsValue}>
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
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onPaneClick={() => {
              selectGoalId(null);
              setFlowContextMenu(null);
              setSelectedWaypointKeys((prev) => (prev.size === 0 ? prev : new Set()));
            }}
            onSelectionChange={handleSelectionChange}
            defaultEdgeOptions={{
              type: "boundaryStraight",
              style: { stroke: EDGE_STROKE_MUTED, strokeWidth: EDGE_WIDTH },
              data: { waypoints: [] },
              selectable: isEditor,
            }}
            nodesDraggable={isEditor}
            nodesConnectable={isEditor}
            snapToGrid={isEditor && gridSnapEnabled && !ctrlHeldForSnapBypass && !dragSnapBypass}
            snapGrid={[BACKGROUND_GRID_GAP, BACKGROUND_GRID_GAP]}
            minZoom={0.06}
            fitView
            fitViewOptions={{ minZoom: 0.06 }}
          >
            <Background gap={BACKGROUND_GRID_GAP} size={1} color="rgba(216, 200, 168, 0.3)" />
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
            <Controls position="bottom-left" showInteractive={false}>
              {isEditor ? (
                <>
                  <ControlButton
                    type="button"
                    onClick={() => void undoGraph()}
                    disabled={!canUndoGraph}
                    title="Назад по истории графа (⌘Z / Ctrl+Z)"
                    aria-label="Отменить изменение графа"
                  >
                    <ChevronIcon direction="left" className="h-[18px] w-[18px]" />
                  </ControlButton>
                  <ControlButton
                    type="button"
                    onClick={() => void redoGraph()}
                    disabled={!canRedoGraph}
                    title="Вперёд по истории графа (⌘⇧Z / Ctrl+Shift+Z)"
                    aria-label="Вернуть изменение графа"
                  >
                    <ChevronIcon direction="right" className="h-[18px] w-[18px]" />
                  </ControlButton>
                  <ControlButton
                    onClick={() => {
                      setGridSnapEnabled((previous) => {
                        const next = !previous;
                        persistUserUiSettings({ graphGridSnapEnabled: next });
                        return next;
                      });
                    }}
                    title={
                      gridSnapEnabled
                        ? "Отключить прилипание к точкам сетки (Ctrl при перетаскивании — без привязки)"
                        : "Прилипание к точкам сетки при перетаскивании"
                    }
                    aria-label={
                      gridSnapEnabled
                        ? "Отключить прилипание к точкам сетки"
                        : "Включить прилипание к точкам сетки"
                    }
                    aria-pressed={gridSnapEnabled}
                    className={
                      gridSnapEnabled ? "!bg-[#D39A43]/22 text-[#F2EEE6] hover:!bg-[#D39A43]/30" : undefined
                    }
                  >
                    <MagnetToolbarIcon className="h-[18px] w-[18px]" />
                  </ControlButton>
                </>
              ) : null}
            </Controls>
          </ReactFlow>
          </EdgeWaypointActionsContext.Provider>
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
                <div className="min-w-0 flex-1">
                  {editingCardTitle && isEditor ? (
                    <input
                      ref={cardTitleInputRef}
                      className="w-full rounded-md border border-[#D39A43]/35 bg-[#181B1A] px-1 py-0.5 text-2xl font-semibold text-[#F2EEE6] outline-none focus:border-[#D39A43]/55"
                      value={selectedTitle}
                      aria-label="Название цели"
                      disabled={!isEditor}
                      onChange={(event) =>
                        setNodeField(selectedGoalNode.id, { title: event.target.value })
                      }
                      onBlur={() => {
                        setEditingCardTitle(false);
                        void updateGoalRef.current(
                          selectedGoalNode.id,
                          { title: selectedTitle, description: selectedDescription },
                          { recordHistory: false },
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          setEditingCardTitle(false);
                          void updateGoalRef.current(
                            selectedGoalNode.id,
                            { title: selectedTitle, description: selectedDescription },
                            { recordHistory: false },
                          );
                        }
                      }}
                    />
                  ) : (
                    <h2
                      className={`break-words text-2xl font-semibold text-[#F2EEE6] ${
                        isEditor
                          ? "cursor-text rounded-md px-1 py-0.5 hover:bg-white/[0.06]"
                          : ""
                      }`}
                      onClick={() => {
                        if (isEditor) setEditingCardTitle(true);
                      }}
                    >
                      {selectedTitle || "Без названия"}
                    </h2>
                  )}
                </div>
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-lg leading-none text-[#B8B0A3] hover:bg-white/5 hover:text-[#F2EEE6]"
                  aria-label="Закрыть"
                  onClick={() => selectGoalId(null)}
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
                    <span className="text-sm font-medium text-[#D8C8A8]">
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
                Описание
                <textarea
                  className="mt-1 h-24 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 py-2 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedDescription}
                  disabled={!isEditor}
                  onChange={(event) =>
                    setNodeField(selectedGoalNode.id, { description: event.target.value })
                  }
                  onBlur={() => {
                    void updateGoalRef.current(
                      selectedGoalNode.id,
                      { title: selectedTitle, description: selectedDescription },
                      { recordHistory: false },
                    );
                  }}
                />
              </label>

              <label className="block text-xs text-[#B8B0A3]">
                Дата начала
                <input
                  type="date"
                  className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-[#181B1A] px-3 text-sm text-[#F2EEE6] outline-none focus:border-[#D39A43]/45"
                  value={selectedStartsOn}
                  disabled={!isEditor}
                  onChange={(event) => {
                    const next = event.target.value || null;
                    setNodeField(selectedGoalNode.id, { startsOn: next });
                  }}
                  onBlur={() => {
                    void updateGoal(selectedGoalNode.id, { startsOn: selectedStartsOn || null });
                  }}
                />
                <p className="mt-1 text-[11px] text-[#6F6A62]">
                  До этой даты цель заблокирована, даже если от других целей не зависит.
                </p>
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

              {goalChanges.length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#1D201E] p-3 text-sm text-[#B8B0A3]">
                  <button
                    type="button"
                    className="mb-2 w-full cursor-pointer text-left text-xs uppercase tracking-[0.06em] text-[#8A857B]"
                    onClick={() => setGoalChangesOpen((v) => !v)}
                  >
                    История изменений {goalChangesOpen ? "▾" : "▸"}
                  </button>
                  {goalChangesOpen ? (
                    <div className="max-h-44 space-y-2 overflow-y-auto text-xs">
                      {goalChanges.map((entry) => (
                        <p key={entry.id}>
                          {entry.userEmail === currentUserEmail ? "Вы" : entry.userEmail ?? "Пользователь"}:{" "}
                          <span className="cursor-help" title={new Date(entry.createdAt).toLocaleString("ru-RU")}>изменен</span>{" "}
                          <span>{entry.changedField}</span>: <span className="cursor-help" title={entry.oldValue ?? "—"}>&quot;
                          {entry.newValue ?? "—"}&quot;</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#1D201E] p-4 text-sm text-[#B8B0A3]">
              Выберите цель на графе, чтобы открыть детали. Клик по связи — точки траектории;
              по точке — двойной клик или ПКМ удаляют её; двойной клик по самой связи удаляет зависимость.
            </div>
          )}
            </div>
            <div className="flex shrink-0 justify-start border-t border-white/10 px-2 py-2">
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-[#B8B0A3] transition hover:border-white/10 hover:bg-white/5 hover:text-[#F2EEE6]"
                aria-label="Скрыть правую панель"
                onClick={() => {
                  setRightSidebarOpen(false);
                  persistUserUiSettings({ graphRightSidebarOpen: false });
                }}
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
            onClick={() => {
              setRightSidebarOpen(true);
              persistUserUiSettings({ graphRightSidebarOpen: true });
            }}
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
              className="fixed z-[600] max-h-[min(480px,calc(100vh-16px))] min-w-[208px] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-[#171918] py-1 shadow-[0_16px_48px_rgba(0,0,0,.55)]"
              style={{
                left: Math.min(globalThis.window.innerWidth - 216, Math.max(8, flowContextMenu.clientX)),
                top: Math.min(globalThis.window.innerHeight - 48, Math.max(8, flowContextMenu.clientY)),
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              {flowContextMenu.kind === "pane" ? (
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
              ) : showMultiGoalContextMenu ? (
                <>
                  <p className="border-b border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A857B]">
                    Выравнивание
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#D8C8A8] hover:bg-white/10"
                    onClick={() =>
                      void alignSelectedGoalsFromContextMenu({ layout: "row" }, multiGoalContextMenuAnchorId)
                    }
                  >
                    В ряд (одна линия)
                  </button>
                  <p className="border-t border-white/10 px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.06em] text-[#6F6A62]">
                    В колонку
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#D8C8A8] hover:bg-white/10"
                    onClick={() =>
                      void alignSelectedGoalsFromContextMenu(
                        { layout: "column", edge: "left" },
                        multiGoalContextMenuAnchorId,
                      )
                    }
                  >
                    Левый край
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#D8C8A8] hover:bg-white/10"
                    onClick={() =>
                      void alignSelectedGoalsFromContextMenu(
                        { layout: "column", edge: "center" },
                        multiGoalContextMenuAnchorId,
                      )
                    }
                  >
                    По центру по горизонтали
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#D8C8A8] hover:bg-white/10"
                    onClick={() =>
                      void alignSelectedGoalsFromContextMenu(
                        { layout: "column", edge: "right" },
                        multiGoalContextMenuAnchorId,
                      )
                    }
                  >
                    Правый край
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#D8C8A8] hover:bg-white/10"
                    onClick={() => void snapSelectedGoalsToGridFromContextMenu()}
                  >
                    Выровнять по сетке
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full px-3 py-2 text-left text-sm text-[#F0B0A0] hover:bg-[#A94F3D]/20"
                    onClick={() => void deleteMultipleGoalsFromContextMenu()}
                  >
                    Удалить выбранные ({flowMultiSelectedIds.length})
                  </button>
                </>
              ) : flowContextMenu.kind === "node" ? (
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
              ) : null}
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
  publicShareTokenFromPage?: string | null;
  initialGraph: GraphResponse;
  initialNext: NextGoalItem[];
  initialUserUiSettings?: UserUiSettings | null;
};

export function GoalGraphClient({
  boards,
  currentBoardId,
  currentBoardRole,
  currentUserEmail,
  isPublicView,
  publicBoardTitle,
  publicShareTokenFromPage,
  initialGraph,
  initialNext,
  initialUserUiSettings,
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
        publicShareTokenFromPage={publicShareTokenFromPage}
        initialGraph={initialGraph}
        initialNext={initialNext}
        initialUserUiSettings={initialUserUiSettings}
      />
    </ReactFlowProvider>
  );
}
