import { GoalGraphClient } from "@/components/GoalGraphClient";
import { dbEdgeRowToApiEdge } from "@/lib/graph-types";
import { prisma } from "@/server/db";
import { getNextGoals } from "@/server/domain";

type SharePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  const board = await prisma.board.findFirst({
    where: {
      publicShareToken: token,
      isPublicReadOnly: true,
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!board) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#101211] text-[#F2EEE6]">
        <p className="text-sm text-[#B8B0A3]">Публичная доска не найдена или доступ отключен.</p>
      </main>
    );
  }

  const [goals, edgeRows] = await Promise.all([
    prisma.goal.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goalEdge.findMany({
      where: { boardId: board.id },
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        type: true,
        waypoints: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const edges = edgeRows.map(dbEdgeRowToApiEdge);
  const initialNext = getNextGoals(goals, edges);

  return (
    <main className="flex h-screen w-full flex-col">
      <GoalGraphClient
        boards={[]}
        currentBoardId={board.id}
        currentBoardRole="VIEWER"
        currentUserEmail={null}
        isPublicView
        publicBoardTitle={board.title}
        initialGraph={{ goals, edges }}
        initialNext={initialNext}
      />
    </main>
  );
}
