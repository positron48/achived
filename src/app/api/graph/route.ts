import { NextResponse } from "next/server";

import { prisma } from "@/server/db";

export async function GET() {
  const [goals, edges] = await Promise.all([
    prisma.goal.findMany({
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.goalEdge.findMany({
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  return NextResponse.json({ goals, edges });
}
