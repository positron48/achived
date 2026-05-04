import { NextResponse } from "next/server";

import { boardRoleSatisfies, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { updateBoardMemberSchema } from "@/server/validation";

type Context = {
  params: Promise<{
    id: string;
    userId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, userId } = await params;
  const role = await getUserBoardRole(id, actor.id);
  if (!role || !boardRoleSatisfies(role, "EDITOR")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBoardMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const targetBoard = await prisma.board.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (targetBoard?.ownerId === userId) {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });
  }

  const updated = await prisma.boardMember.updateMany({
    where: { boardId: id, userId },
    data: { role: parsed.data.role },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Context) {
  const actor = await getSessionUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, userId } = await params;
  const role = await getUserBoardRole(id, actor.id);
  if (!role || !boardRoleSatisfies(role, "EDITOR")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const board = await prisma.board.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (board?.ownerId === userId) {
    return NextResponse.json({ error: "Cannot remove owner from board" }, { status: 400 });
  }

  await prisma.boardMember.deleteMany({
    where: { boardId: id, userId },
  });

  return NextResponse.json({ ok: true });
}
