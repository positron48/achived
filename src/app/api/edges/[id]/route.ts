import { NextResponse } from "next/server";

import { prisma } from "@/server/db";
import { hasPrismaCode } from "@/server/prisma-errors";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_: Request, { params }: Context) {
  const { id } = await params;

  try {
    await prisma.goalEdge.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (hasPrismaCode(error, "P2025")) {
      return NextResponse.json({ error: "Edge not found" }, { status: 404 });
    }

    throw error;
  }
}
