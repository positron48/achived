import { NextResponse } from "next/server";

import { getSessionUser } from "@/server/auth-session";
import { ensureUserHasBoard, listBoardsForUser } from "@/server/boards";
import { prisma } from "@/server/db";
import { createBoardSchema } from "@/server/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const boards = await ensureUserHasBoard(user.id);
  return NextResponse.json(boards);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await prisma.board.create({
    data: {
      title: parsed.data.title,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: "EDITOR",
        },
      },
    },
  });

  const boards = await listBoardsForUser(user.id);
  return NextResponse.json(boards, { status: 201 });
}
