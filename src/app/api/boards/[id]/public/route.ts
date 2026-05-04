import { NextResponse } from "next/server";

import { getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { createPublicShareToken } from "@/server/boards";
import { prisma } from "@/server/db";
import { updateBoardPublicSchema } from "@/server/validation";

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
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owner can manage public sharing" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateBoardPublicSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const board = await prisma.board.update({
    where: { id },
    data: {
      isPublicReadOnly: parsed.data.enabled,
      publicShareToken: parsed.data.enabled ? createPublicShareToken() : null,
    },
    select: {
      isPublicReadOnly: true,
      publicShareToken: true,
    },
  });

  return NextResponse.json(board);
}
