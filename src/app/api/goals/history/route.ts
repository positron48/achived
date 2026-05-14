import { NextResponse } from "next/server";

import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boardId = getBoardIdFromRequest(request);
  if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

  const role = await getUserBoardRole(boardId, user.id);
  if (!role || !boardRoleSatisfies(role, "VIEWER")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get("id");
  if (!goalId) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const history = await prisma.goalChange.findMany({
    where: { boardId, goalId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(history);
}
