import { NextResponse } from "next/server";

import { getSessionUser } from "@/server/auth-session";
import { prisma } from "@/server/db";
import { updateUserSettingsSchema } from "@/server/validation";

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateUserSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      graphGridSnapEnabled: parsed.data.graphGridSnapEnabled ?? false,
      graphLeftSidebarOpen: parsed.data.graphLeftSidebarOpen ?? true,
      graphRightSidebarOpen: parsed.data.graphRightSidebarOpen ?? true,
    },
    update: parsed.data,
  });

  return NextResponse.json(updated);
}
