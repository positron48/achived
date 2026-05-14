CREATE TABLE "GoalChange" (
  "id" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userEmail" TEXT,
  "changedField" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoalChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoalChange_goalId_createdAt_idx" ON "GoalChange"("goalId", "createdAt");
CREATE INDEX "GoalChange_boardId_createdAt_idx" ON "GoalChange"("boardId", "createdAt");

ALTER TABLE "GoalChange"
ADD CONSTRAINT "GoalChange_goalId_fkey"
FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
