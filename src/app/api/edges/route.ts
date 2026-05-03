import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { hasPrismaCode } from "@/server/prisma-errors";
import { createEdgeSchema } from "@/server/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createEdgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { sourceId, targetId, type = "REQUIRES" } = parsed.data;

  if (sourceId === targetId) {
    return NextResponse.json({ error: "Self-edge is not allowed" }, { status: 400 });
  }

  const [sourceExists, targetExists] = await Promise.all([
    prisma.goal.count({ where: { id: sourceId } }),
    prisma.goal.count({ where: { id: targetId } }),
  ]);

  if (!sourceExists || !targetExists) {
    return NextResponse.json(
      { error: "Source or target goal does not exist" },
      { status: 400 },
    );
  }

  try {
    const edge = await prisma.goalEdge.create({
      data: {
        sourceId,
        targetId,
        type,
      },
    });

    return NextResponse.json(edge, { status: 201 });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      return NextResponse.json({ error: "Duplicate edge" }, { status: 409 });
    }

    throw error;
  }
}
