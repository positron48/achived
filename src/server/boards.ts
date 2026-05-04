import { randomBytes } from "node:crypto";

import type { BoardSummary } from "@/lib/graph-types";
import { prisma } from "@/server/db";

export const LEGACY_BOARD_ID = "legacy_unassigned_board";

function roleFromBoard(ownerId: string | null, currentUserId: string, memberRole?: "EDITOR" | "VIEWER"): BoardSummary["role"] {
  if (ownerId === currentUserId) {
    return "OWNER";
  }
  return memberRole ?? "VIEWER";
}

export async function ensureLegacyDataClaimedByFirstUser(userId: string) {
  await prisma.$transaction(async (tx) => {
    const [unassignedGoalsCount, unassignedEdgesCount] = await Promise.all([
      tx.goal.count({ where: { boardId: null } }),
      tx.goalEdge.count({ where: { boardId: null } }),
    ]);

    let legacyBoard = await tx.board.findUnique({
      where: { id: LEGACY_BOARD_ID },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!legacyBoard && (unassignedGoalsCount > 0 || unassignedEdgesCount > 0)) {
      legacyBoard = await tx.board.create({
        data: {
          id: LEGACY_BOARD_ID,
          title: "My First Board",
          isLegacyUnclaimed: true,
        },
        select: {
          id: true,
          ownerId: true,
        },
      });
    }

    if (!legacyBoard) {
      return;
    }

    if (unassignedGoalsCount > 0) {
      await tx.goal.updateMany({
        where: { boardId: null },
        data: { boardId: LEGACY_BOARD_ID },
      });
    }

    if (unassignedEdgesCount > 0) {
      await tx.goalEdge.updateMany({
        where: {
          boardId: null,
          source: {
            boardId: LEGACY_BOARD_ID,
          },
        },
        data: {
          boardId: LEGACY_BOARD_ID,
        },
      });

      await tx.goalEdge.updateMany({
        where: {
          boardId: null,
        },
        data: {
          boardId: LEGACY_BOARD_ID,
        },
      });
    }

    if (!legacyBoard.ownerId) {
      await tx.board.update({
        where: { id: LEGACY_BOARD_ID },
        data: {
          ownerId: userId,
          isLegacyUnclaimed: false,
          title: "My First Board",
        },
      });
    }

    await tx.boardMember.upsert({
      where: {
        boardId_userId: {
          boardId: LEGACY_BOARD_ID,
          userId,
        },
      },
      update: {
        role: "EDITOR",
      },
      create: {
        boardId: LEGACY_BOARD_ID,
        userId,
        role: "EDITOR",
      },
    });
  });
}

export async function listBoardsForUser(userId: string): Promise<BoardSummary[]> {
  const boards = await prisma.board.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    include: {
      members: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return boards.map((board) => ({
    id: board.id,
    title: board.title,
    role: roleFromBoard(board.ownerId, userId, board.members[0]?.role),
    isPublicReadOnly: board.isPublicReadOnly,
    publicShareToken: board.publicShareToken,
  }));
}

export async function ensureUserHasBoard(userId: string) {
  await ensureLegacyDataClaimedByFirstUser(userId);

  const boards = await listBoardsForUser(userId);
  if (boards.length > 0) {
    return boards;
  }

  const created = await prisma.board.create({
    data: {
      title: "My First Board",
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "EDITOR",
        },
      },
    },
  });

  return [
    {
      id: created.id,
      title: created.title,
      role: "OWNER" as const,
      isPublicReadOnly: created.isPublicReadOnly,
      publicShareToken: created.publicShareToken,
    },
  ];
}

export function createPublicShareToken() {
  return randomBytes(24).toString("hex");
}
