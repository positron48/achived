import type { BoardRole } from "@/lib/graph-types";
import { prisma } from "@/server/db";

const ROLE_WEIGHT: Record<BoardRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  OWNER: 2,
};

export function boardRoleSatisfies(actual: BoardRole, required: BoardRole) {
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required];
}

export async function getUserBoardRole(boardId: string, userId: string): Promise<BoardRole | null> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      ownerId: true,
      members: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!board) {
    return null;
  }

  if (board.ownerId === userId) {
    return "OWNER";
  }

  const memberRole = board.members[0]?.role;
  if (!memberRole) {
    return null;
  }

  return memberRole;
}

export function getBoardIdFromRequest(request: Request) {
  const boardId = new URL(request.url).searchParams.get("boardId");
  return boardId?.trim() || null;
}
