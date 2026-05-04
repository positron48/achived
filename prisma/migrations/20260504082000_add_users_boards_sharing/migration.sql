CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "expiresAt" INTEGER,
  "tokenType" TEXT,
  "scope" TEXT,
  "idToken" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Board" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT,
  "title" TEXT NOT NULL,
  "isPublicReadOnly" BOOLEAN NOT NULL DEFAULT false,
  "publicShareToken" TEXT,
  "isLegacyUnclaimed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BoardMember" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoardMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Goal"
ADD COLUMN "boardId" TEXT;

ALTER TABLE "GoalEdge"
ADD COLUMN "boardId" TEXT;

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount" ("provider", "providerAccountId");
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount" ("userId");
CREATE UNIQUE INDEX "Board_publicShareToken_key" ON "Board" ("publicShareToken");
CREATE INDEX "Board_ownerId_idx" ON "Board" ("ownerId");
CREATE UNIQUE INDEX "BoardMember_boardId_userId_key" ON "BoardMember" ("boardId", "userId");
CREATE INDEX "BoardMember_userId_idx" ON "BoardMember" ("userId");
CREATE INDEX "Goal_boardId_idx" ON "Goal" ("boardId");
CREATE INDEX "GoalEdge_boardId_idx" ON "GoalEdge" ("boardId");

ALTER TABLE "GoalEdge"
DROP CONSTRAINT IF EXISTS "GoalEdge_sourceId_targetId_type_key";

CREATE UNIQUE INDEX "GoalEdge_boardId_sourceId_targetId_type_key" ON "GoalEdge" ("boardId", "sourceId", "targetId", "type");

ALTER TABLE "AuthAccount"
ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Board"
ADD CONSTRAINT "Board_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BoardMember"
ADD CONSTRAINT "BoardMember_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardMember"
ADD CONSTRAINT "BoardMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal"
ADD CONSTRAINT "Goal_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GoalEdge"
ADD CONSTRAINT "GoalEdge_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  legacy_board_id TEXT := 'legacy_unassigned_board';
BEGIN
  INSERT INTO "Board" ("id", "title", "isLegacyUnclaimed", "createdAt", "updatedAt")
  VALUES (legacy_board_id, 'Legacy Board', true, NOW(), NOW())
  ON CONFLICT ("id") DO NOTHING;

  UPDATE "Goal"
  SET "boardId" = legacy_board_id
  WHERE "boardId" IS NULL;

  UPDATE "GoalEdge" edge
  SET "boardId" = goal."boardId"
  FROM "Goal" goal
  WHERE edge."sourceId" = goal."id"
    AND edge."boardId" IS NULL;

  UPDATE "GoalEdge"
  SET "boardId" = legacy_board_id
  WHERE "boardId" IS NULL;
END $$;
