import { NextResponse } from "next/server";

import type { ApiEdge, ApiGoal } from "@/lib/graph-types";
import { getNextGoals } from "@/server/domain";
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

  const next = getNextGoals(goals as ApiGoal[], edges as ApiEdge[]);
  return NextResponse.json(next);
}
