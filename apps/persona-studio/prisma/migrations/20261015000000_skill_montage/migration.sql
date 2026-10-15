-- Монтаж по скиллам (montazh-rils / YouTube «Монтаж ЭМ») — собственный движок
-- на ffmpeg. См. model Montage в schema.prisma.

-- CreateTable
CREATE TABLE "Montage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoGenerationId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT '9:16',
    "hookTitle" TEXT,
    "ctaWord" TEXT,
    "options" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transcript" JSONB,
    "resultUrl" TEXT,
    "durationSec" DOUBLE PRECISION,
    "tokensCost" INTEGER NOT NULL DEFAULT 20,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Montage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Montage_userId_createdAt_idx" ON "Montage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Montage_videoGenerationId_idx" ON "Montage"("videoGenerationId");

-- AddForeignKey
ALTER TABLE "Montage" ADD CONSTRAINT "Montage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Montage" ADD CONSTRAINT "Montage_videoGenerationId_fkey" FOREIGN KEY ("videoGenerationId") REFERENCES "VideoGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
