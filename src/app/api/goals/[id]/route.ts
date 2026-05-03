import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { hasPrismaCode } from "@/server/prisma-errors";
import { updateGoalSchema } from "@/server/validation";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateGoalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "At least one field must be provided" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.goal.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    throw error;
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const { id } = await params;

  try {
    await prisma.goal.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    throw error;
  }
}
