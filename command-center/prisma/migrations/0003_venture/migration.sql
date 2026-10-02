-- AlterTable
ALTER TABLE "GameState" ADD COLUMN     "ventureAlerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Venture" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "foundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTickAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "soldAt" TIMESTAMP(3),
    "salePrice" DOUBLE PRECISION,
    "exitCoins" INTEGER,
    "peakStaff" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Venture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentureLog" (
    "id" TEXT NOT NULL,
    "ventureId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentureLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Venture_status_idx" ON "Venture"("status");

-- CreateIndex
CREATE INDEX "VentureLog_ventureId_at_idx" ON "VentureLog"("ventureId", "at");

-- AddForeignKey
ALTER TABLE "VentureLog" ADD CONSTRAINT "VentureLog_ventureId_fkey" FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
