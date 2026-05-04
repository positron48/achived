import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.boardMember.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.goalEdge.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.board.deleteMany();
  await prisma.user.deleteMany();

  const owner = await prisma.user.create({
    data: {
      email: "owner@example.com",
      name: "Owner",
    },
  });

  const collaborator = await prisma.user.create({
    data: {
      email: "viewer@example.com",
      name: "Viewer",
    },
  });

  const board = await prisma.board.create({
    data: {
      id: "seed-main-board",
      title: "Переезд и карьера",
      ownerId: owner.id,
      members: {
        create: [
          {
            userId: owner.id,
            role: "EDITOR",
          },
          {
            userId: collaborator.id,
            role: "VIEWER",
          },
        ],
      },
    },
  });

  const goals = await Promise.all([
    prisma.goal.create({
      data: {
        id: "seed-update-cv",
        boardId: board.id,
        title: "Обновить CV",
        type: "TASK",
        priority: 1,
        status: "DONE",
        x: 120,
        y: 120,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-apply-jobs",
        boardId: board.id,
        title: "Податься на вакансии",
        type: "TASK",
        priority: 1,
        status: "ACTIVE",
        x: 420,
        y: 120,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-offer",
        boardId: board.id,
        title: "Получить оффер",
        type: "MILESTONE",
        priority: 2,
        status: "TODO",
        x: 720,
        y: 120,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-docs",
        boardId: board.id,
        title: "Собрать документы",
        type: "TASK",
        priority: 2,
        status: "TODO",
        x: 120,
        y: 300,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-visa",
        boardId: board.id,
        title: "Податься на визу",
        type: "MILESTONE",
        priority: 1,
        status: "TODO",
        x: 720,
        y: 300,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-relocation",
        boardId: board.id,
        title: "Переезд",
        type: "EPIC",
        priority: 1,
        status: "TODO",
        x: 980,
        y: 300,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-taxes",
        boardId: board.id,
        title: "Разобраться с налогами",
        type: "TASK",
        priority: 3,
        status: "TODO",
        x: 120,
        y: 500,
      },
    }),
    prisma.goal.create({
      data: {
        id: "seed-finance-plan",
        boardId: board.id,
        title: "Финансовый план",
        type: "TASK",
        priority: 2,
        status: "TODO",
        x: 420,
        y: 500,
      },
    }),
  ]);

  await prisma.goalEdge.createMany({
    data: [
      { boardId: board.id, sourceId: "seed-update-cv", targetId: "seed-apply-jobs", type: "REQUIRES" },
      { boardId: board.id, sourceId: "seed-apply-jobs", targetId: "seed-offer", type: "REQUIRES" },
      { boardId: board.id, sourceId: "seed-docs", targetId: "seed-visa", type: "REQUIRES" },
      { boardId: board.id, sourceId: "seed-offer", targetId: "seed-visa", type: "REQUIRES" },
      { boardId: board.id, sourceId: "seed-visa", targetId: "seed-relocation", type: "REQUIRES" },
      { boardId: board.id, sourceId: "seed-taxes", targetId: "seed-finance-plan", type: "REQUIRES" },
      { boardId: board.id, sourceId: "seed-finance-plan", targetId: "seed-relocation", type: "REQUIRES" },
    ],
  });

  console.log(`Seeded ${goals.length} goals for board ${board.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
