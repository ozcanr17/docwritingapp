CREATE TYPE "ReleaseStatus" AS ENUM ('planned', 'active', 'released');
CREATE TYPE "IterationStatus" AS ENUM ('planned', 'active', 'completed');

CREATE TABLE "project_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'planned',
    "releaseDate" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,

    CONSTRAINT "project_releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_iterations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "status" "IterationStatus" NOT NULL DEFAULT 'planned',
    "startDate" TIMESTAMPTZ(6),
    "endDate" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,

    CONSTRAINT "project_iterations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_releases_projectId_deletedAt_idx" ON "project_releases"("projectId", "deletedAt");
CREATE INDEX "project_iterations_projectId_deletedAt_idx" ON "project_iterations"("projectId", "deletedAt");

ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_releases" ADD CONSTRAINT "project_releases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_iterations" ADD CONSTRAINT "project_iterations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_iterations" ADD CONSTRAINT "project_iterations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items" ADD COLUMN "releaseId" UUID;
ALTER TABLE "work_items" ADD COLUMN "iterationId" UUID;
ALTER TABLE "test_plan_items" ADD COLUMN "iterationId" UUID;
ALTER TABLE "test_executions" ADD COLUMN "iterationId" UUID;

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "project_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "project_iterations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_plan_items" ADD CONSTRAINT "test_plan_items_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "project_iterations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "project_iterations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "work_items_releaseId_idx" ON "work_items"("releaseId");
CREATE INDEX "work_items_iterationId_idx" ON "work_items"("iterationId");
CREATE INDEX "test_plan_items_iterationId_idx" ON "test_plan_items"("iterationId");
CREATE INDEX "test_executions_iterationId_idx" ON "test_executions"("iterationId");

-- A project may not hold two live releases or iterations under the same name.
-- Prisma cannot express a partial unique index, so it is created directly and
-- must be preserved: it still permits re-adding a name that was archived.
CREATE UNIQUE INDEX "project_releases_projectId_name_active_key" ON "project_releases"("projectId", "name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "project_iterations_projectId_name_active_key" ON "project_iterations"("projectId", "name") WHERE "deletedAt" IS NULL;

-- Convert the iteration free text that test plan items and executions already
-- carry into real iterations, then repoint those rows. The legacy text column is
-- deliberately kept so nothing is lost and reports can still fall back to it.
-- Backfilled iterations are created as active because their true state is not
-- recorded anywhere; an administrator can complete them afterwards.
INSERT INTO "project_iterations" ("organizationId", "projectId", "name", "status", "updatedAt")
SELECT projects."organizationId", source."projectId", source."name", 'active'::"IterationStatus", CURRENT_TIMESTAMP
FROM (
    SELECT plans."projectId" AS "projectId", btrim(items."iteration") AS "name"
    FROM "test_plan_items" items
    JOIN "test_plans" plans ON plans."id" = items."testPlanId"
    WHERE items."iteration" IS NOT NULL AND btrim(items."iteration") <> ''
    UNION
    SELECT executions."projectId", btrim(executions."iteration")
    FROM "test_executions" executions
    WHERE executions."projectId" IS NOT NULL AND executions."iteration" IS NOT NULL AND btrim(executions."iteration") <> ''
) source
JOIN "projects" projects ON projects."id" = source."projectId";

UPDATE "test_plan_items" items
SET "iterationId" = iterations."id"
FROM "test_plans" plans, "project_iterations" iterations
WHERE plans."id" = items."testPlanId"
  AND iterations."projectId" = plans."projectId"
  AND iterations."name" = btrim(items."iteration")
  AND items."iteration" IS NOT NULL
  AND btrim(items."iteration") <> '';

UPDATE "test_executions" executions
SET "iterationId" = iterations."id"
FROM "project_iterations" iterations
WHERE iterations."projectId" = executions."projectId"
  AND iterations."name" = btrim(executions."iteration")
  AND executions."iteration" IS NOT NULL
  AND btrim(executions."iteration") <> '';
