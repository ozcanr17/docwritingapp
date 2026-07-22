ALTER TABLE "roles" DROP COLUMN "nextTestPlanNumber",
DROP COLUMN "nextWorkItemNumber";

ALTER TABLE "projects" ADD COLUMN "nextTestPlanNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "nextWorkItemNumber" INTEGER NOT NULL DEFAULT 1;
