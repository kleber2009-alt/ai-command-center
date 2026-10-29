-- Монтаж по стилям Студии Кадрика: id задачи в боте и строка прогресса.

-- AlterTable
ALTER TABLE "Montage" ADD COLUMN "externalId" TEXT,
ADD COLUMN "progress" TEXT;
