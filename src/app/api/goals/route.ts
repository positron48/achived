import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { createGoalSchema } from "@/server/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createGoalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const goal = await prisma.goal.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      type: parsed.data.type ?? "TASK",
      priority: parsed.data.priority ?? 3,
      x: parsed.data.x ?? 0,
      y: parsed.data.y ?? 0,
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
