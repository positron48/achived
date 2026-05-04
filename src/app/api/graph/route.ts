import { NextResponse } from "next/server";

import { dbEdgeRowToApiEdge } from "@/lib/graph-types";
import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const boardId = getBoardIdFromRequest(request);
  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }

  const role = await getUserBoardRole(boardId, user.id);
  if (!role || !boardRoleSatisfies(role, "VIEWER")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const [goals, edgeRows] = await Promise.all([
    prisma.goal.findMany({
      where: { boardId },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.goalEdge.findMany({
      where: { boardId },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        type: true,
        waypoints: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const edges = edgeRows.map(dbEdgeRowToApiEdge);

  return NextResponse.json({ goals, edges });
}
