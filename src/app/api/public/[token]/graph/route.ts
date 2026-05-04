import { NextResponse } from "next/server";

import { dbEdgeRowToApiEdge } from "@/lib/graph-types";
import { prisma } from "@/server/db";

type Context = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(_: Request, { params }: Context) {
  const { token } = await params;
  const board = await prisma.board.findFirst({
    where: {
      publicShareToken: token,
      isPublicReadOnly: true,
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!board) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const [goals, edgeRows] = await Promise.all([
    prisma.goal.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goalEdge.findMany({
      where: { boardId: board.id },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        type: true,
        waypoints: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const edges = edgeRows.map(dbEdgeRowToApiEdge);

  return NextResponse.json({
    board: {
      id: board.id,
      title: board.title,
      readOnly: true,
    },
    goals,
    edges,
  });
}
