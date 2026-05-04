import { NextResponse } from "next/server";

import { boardRoleSatisfies, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { listBoardsForUser } from "@/server/boards";
import { prisma } from "@/server/db";
import { updateBoardSchema } from "@/server/validation";

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

  const { id } = await params;
  const role = await getUserBoardRole(id, user.id);
  if (!role || !boardRoleSatisfies(role, "EDITOR")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await prisma.board.update({
    where: { id },
    data: {
      title: parsed.data.title,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Context) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const board = await prisma.board.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!board || board.ownerId !== user.id) {
    return NextResponse.json({ error: "Only owner can delete board" }, { status: 403 });
  }

  await prisma.board.delete({ where: { id } });
  const boards = await listBoardsForUser(user.id);
  return NextResponse.json(boards);
}
