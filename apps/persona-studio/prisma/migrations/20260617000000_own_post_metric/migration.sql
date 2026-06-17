-- Module D · Measure (Мастер-ТЗ §6): суточные снимки метрик опубликованных постов.

-- CreateTable
CREATE TABLE "OwnPostMetric" (
    "postTargetId" TEXT NOT NULL,
    "capturedAt" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnPostMetric_pkey" PRIMARY KEY ("postTargetId","capturedAt")
);

-- AddForeignKey
ALTER TABLE "OwnPostMetric" ADD CONSTRAINT "OwnPostMetric_postTargetId_fkey" FOREIGN KEY ("postTargetId") REFERENCES "PostTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
