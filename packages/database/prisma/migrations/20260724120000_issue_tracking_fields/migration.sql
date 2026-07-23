ALTER TABLE "work_items"
ADD COLUMN "stepsToReproduce" TEXT,
ADD COLUMN "expectedResult" TEXT,
ADD COLUMN "actualResult" TEXT,
ADD COLUMN "environment" TEXT,
ADD COLUMN "affectedVersion" TEXT;
