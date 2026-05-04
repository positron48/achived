import { NextResponse } from "next/server";

import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

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
