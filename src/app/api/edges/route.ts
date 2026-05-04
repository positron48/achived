import { NextResponse } from "next/server";

import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { createsCycle } from "@/server/graph";
import { hasPrismaCode } from "@/server/prisma-errors";
import { createEdgeSchema } from "@/server/validation";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const boardId = getBoardIdFromRequest(request);
  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }

  const role = await getUserBoardRole(boardId, user.id);
  if (!role || !boardRoleSatisfies(role, "EDITOR")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createEdgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { sourceId, targetId, type = "REQUIRES" } = parsed.data;

  if (sourceId === targetId) {
    return NextResponse.json({ error: "Self-edge is not allowed" }, { status: 400 });
  }

  const [sourceExists, targetExists] = await Promise.all([
    prisma.goal.count({ where: { id: sourceId, boardId } }),
    prisma.goal.count({ where: { id: targetId, boardId } }),
  ]);

  if (!sourceExists || !targetExists) {
    return NextResponse.json(
      { error: "Source or target goal does not exist" },
      { status: 400 },
    );
  }

  if (type === "REQUIRES") {
    const requiresEdges = await prisma.goalEdge.findMany({
      where: { type: "REQUIRES", boardId },
      select: {
        sourceId: true,
        targetId: true,
      },
    });

    if (createsCycle(sourceId, targetId, requiresEdges)) {
      return NextResponse.json(
        { error: "Cycle detected. Dependency cannot be created" },
        { status: 400 },
      );
    }
  }

  try {
    const edge = await prisma.goalEdge.create({
      data: {
        boardId,
        sourceId,
        targetId,
        type,
      },
    });

    return NextResponse.json(edge, { status: 201 });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      return NextResponse.json({ error: "Duplicate edge" }, { status: 409 });
    }

    throw error;
  }
}
