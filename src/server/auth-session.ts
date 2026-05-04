import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
}
