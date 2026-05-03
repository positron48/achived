import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.goalEdge.deleteMany();
  await prisma.goal.deleteMany();

  const goals = await Promise.all([
    prisma.goal.create({
      data: {
        id: "seed-update-cv",
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
      { sourceId: "seed-update-cv", targetId: "seed-apply-jobs", type: "REQUIRES" },
      { sourceId: "seed-apply-jobs", targetId: "seed-offer", type: "REQUIRES" },
      { sourceId: "seed-docs", targetId: "seed-visa", type: "REQUIRES" },
      { sourceId: "seed-offer", targetId: "seed-visa", type: "REQUIRES" },
      { sourceId: "seed-visa", targetId: "seed-relocation", type: "REQUIRES" },
      { sourceId: "seed-taxes", targetId: "seed-finance-plan", type: "REQUIRES" },
      { sourceId: "seed-finance-plan", targetId: "seed-relocation", type: "REQUIRES" },
    ],
  });

  console.log(`Seeded ${goals.length} goals`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
