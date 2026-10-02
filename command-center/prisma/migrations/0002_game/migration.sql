-- AlterTable
ALTER TABLE "DailyPlan" ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "frozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "splits" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "dodges" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dodges" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GameState" (
    "id" TEXT NOT NULL DEFAULT 'me',
    "freezes" INTEGER NOT NULL DEFAULT 0,
    "unlocks" JSONB NOT NULL DEFAULT '[]',
    "soundOn" BOOLEAN NOT NULL DEFAULT true,
    "hapticsOn" BOOLEAN NOT NULL DEFAULT true,
    "sprintMinutes" INTEGER NOT NULL DEFAULT 25,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinEvent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSprint" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT,
    "refId" TEXT,
    "minutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FocusSprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "params" JSONB NOT NULL DEFAULT '{}',
    "reward" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL DEFAULT 'heuristic',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "key" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PersonalRecord" (
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "previous" DOUBLE PRECISION,
    "detail" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎁',
    "cost" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoinEvent_key_key" ON "CoinEvent"("key");

-- CreateIndex
CREATE INDEX "CoinEvent_createdAt_idx" ON "CoinEvent"("createdAt");

-- CreateIndex
CREATE INDEX "FocusSprint_startedAt_idx" ON "FocusSprint"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_weekStart_key" ON "Challenge"("weekStart");

