import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { updateEdgeWaypointsSchema } from "@/server/validation";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
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
  const parsed = updateEdgeWaypointsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  const waypointsForDb =
    parsed.data.waypoints === null ? Prisma.DbNull : parsed.data.waypoints;

  const updated = await prisma.goalEdge.updateMany({
    where: { id, boardId },
    data: { waypoints: waypointsForDb },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Edge not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Context) {
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

  const { id } = await params;
  const deleted = await prisma.goalEdge.deleteMany({
    where: { id, boardId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Edge not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
