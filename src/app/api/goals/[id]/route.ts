import { NextResponse } from "next/server";

import { boardRoleSatisfies, getBoardIdFromRequest, getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { updateGoalSchema } from "@/server/validation";

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

  const boardId = getBoardIdFromRequest(request);
  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }

  const role = await getUserBoardRole(boardId, user.id);
  if (!role || !boardRoleSatisfies(role, "EDITOR")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

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
  const { id } = await params;
  const before = await prisma.goal.findFirst({ where: { id, boardId } });
  if (!before) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if ("startsOn" in data) {
    const v = data.startsOn;
    data.startsOn = v === null || v === undefined ? null : new Date(String(v));
  }

  const updatedCount = await prisma.goal.updateMany({ where: { id, boardId }, data });
  if (updatedCount.count === 0) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }
  const updated = await prisma.goal.findFirst({ where: { id, boardId } });
  if (!updated) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }
  const changedFields: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  const maybePush = (field: string, oldValue: unknown, newValue: unknown) => {
    const oldStr = oldValue == null ? null : String(oldValue);
    const newStr = newValue == null ? null : String(newValue);
    if (oldStr !== newStr) changedFields.push({ field, oldValue: oldStr, newValue: newStr });
  };
  if ("title" in data) maybePush("title", before.title, updated.title);
  if ("description" in data) maybePush("description", before.description, updated.description);
  if ("status" in data) maybePush("status", before.status, updated.status);
  if ("priority" in data) maybePush("priority", before.priority, updated.priority);
  if ("type" in data) maybePush("type", before.type, updated.type);
  if ("startsOn" in data) maybePush("startsOn", before.startsOn?.toISOString().slice(0, 10), updated.startsOn?.toISOString().slice(0, 10));
  if (changedFields.length > 0) {
    await (prisma as unknown as { goalChange?: { createMany: (args: unknown) => Promise<unknown> } }).goalChange?.createMany({
      data: changedFields.map((entry) => ({
        goalId: id,
        boardId,
        userId: user.id,
        userEmail: user.email,
        changedField: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
      })),
    });
  }
  return NextResponse.json(updated);
}

export async function DELETE(request: Request, { params }: Context) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const boardId = getBoardIdFromRequest(request);
  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }

  const role = await getUserBoardRole(boardId, user.id);
  if (!role || !boardRoleSatisfies(role, "EDITOR")) {
    return NextResponse.json({ error: "Board not found or access denied" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await prisma.goal.deleteMany({
    where: { id, boardId },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
