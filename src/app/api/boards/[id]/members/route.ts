import { NextResponse } from "next/server";

import { boardRoleSatisfies, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { shareBoardWithUserSchema } from "@/server/validation";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, { params }: Context) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const role = await getUserBoardRole(id, user.id);
  if (!role || !boardRoleSatisfies(role, "VIEWER")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const members = await prisma.boardMember.findMany({
    where: { boardId: id },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      name: member.user.name,
      role: member.role,
    })),
  );
}

export async function POST(request: Request, { params }: Context) {
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
  const parsed = shareBoardWithUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const invitedUser = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true },
  });
  if (!invitedUser) {
    return NextResponse.json({ error: "User with that email not found" }, { status: 404 });
  }

  await prisma.boardMember.upsert({
    where: {
      boardId_userId: {
        boardId: id,
        userId: invitedUser.id,
      },
    },
    update: {
      role: parsed.data.role,
    },
    create: {
      boardId: id,
      userId: invitedUser.id,
      role: parsed.data.role,
    },
  });

  return GET(request, { params });
}
