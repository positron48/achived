import { GoalGraphClient } from "@/components/GoalGraphClient";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { dbEdgeRowToApiEdge, type BoardSummary } from "@/lib/graph-types";
import { getUserBoardRole } from "@/server/board-access";
import { getSessionUser } from "@/server/auth-session";
import { ensureUserHasBoard } from "@/server/boards";
import { prisma } from "@/server/db";
import { getNextGoals } from "@/server/domain";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{
    boardId?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#101211] text-[#F2EEE6]">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#171918] p-8 text-center">
          <h1 className="text-2xl font-semibold">GoalGraph</h1>
          <p className="mt-3 text-sm text-[#B8B0A3]">Войдите через Google, чтобы работать с личными и общими досками.</p>
          <GoogleSignInButton />
        </div>
      </main>
    );
  }

  const boards = await ensureUserHasBoard(user.id);
  const params = await searchParams;
  let selectedBoard = boards.find((board) => board.id === params.boardId) ?? null;

  if (!selectedBoard) {
    const boardIds = boards.map((board) => board.id);
    const goalCounts = await prisma.goal.groupBy({
      by: ["boardId"],
      where: {
        boardId: {
          in: boardIds,
        },
      },
      _count: {
        _all: true,
      },
    });

    const countByBoardId = new Map(
      goalCounts.map((item) => [item.boardId ?? "", item._count._all]),
    );
    selectedBoard =
      boards
        .slice()
        .sort((a, b) => (countByBoardId.get(b.id) ?? 0) - (countByBoardId.get(a.id) ?? 0))[0] ??
      boards[0];
  }

  const role = await getUserBoardRole(selectedBoard.id, user.id);
  const resolvedRole = role ?? ("VIEWER" as BoardSummary["role"]);

  const [goals, edges] = await Promise.all([
    prisma.goal.findMany({
      where: { boardId: selectedBoard.id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        type: true,
        x: true,
        y: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.goalEdge.findMany({
      where: { boardId: selectedBoard.id },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        type: true,
        waypoints: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);
  const apiEdges = edges.map(dbEdgeRowToApiEdge);
  const initialNext = getNextGoals(goals, apiEdges);

  return (
    <main className="flex h-screen w-full flex-col">
      <GoalGraphClient
        boards={boards}
        currentBoardId={selectedBoard.id}
        currentBoardRole={resolvedRole}
        currentUserEmail={user.email}
        initialGraph={{ goals, edges: apiEdges }}
        initialNext={initialNext}
      />
    </main>
  );
}
