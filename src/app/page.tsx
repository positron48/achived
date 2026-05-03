import { GoalGraphClient } from "@/components/GoalGraphClient";
import { prisma } from "@/server/db";
import { getNextGoals } from "@/server/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [goals, edges] = await Promise.all([
    prisma.goal.findMany({
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
      select: {
        id: true,
        sourceId: true,
        targetId: true,
        type: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);
  const initialNext = getNextGoals(goals, edges);

  return (
    <main className="flex h-screen w-full flex-col">
      <GoalGraphClient initialGraph={{ goals, edges }} initialNext={initialNext} />
    </main>
  );
}
