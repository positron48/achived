import { NextResponse } from "next/server";

import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { createGoalSchema } from "@/server/validation";

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
  const parsed = createGoalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { startsOn, ...rest } = parsed.data;

  const goal = await prisma.goal.create({
    data: {
      boardId,
      title: rest.title,
      description: rest.description ?? "",
      type: rest.type ?? "TASK",
      priority: rest.priority ?? 3,
      x: rest.x ?? 0,
      y: rest.y ?? 0,
      ...(startsOn ? { startsOn: new Date(startsOn) } : {}),
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
