ALTER TABLE "work_item_artifact_links"
ADD COLUMN "testStepExecutionId" UUID;

ALTER TABLE "work_item_artifact_links"
DROP CONSTRAINT "work_item_artifact_exactly_one_target";

ALTER TABLE "work_item_artifact_links"
ADD CONSTRAINT "work_item_artifact_exactly_one_target"
CHECK (num_nonnulls("documentId", "rowId", "testExecutionId", "testStepExecutionId") = 1);

CREATE INDEX "work_item_artifact_links_testStepExecutionId_idx"
ON "work_item_artifact_links" ("testStepExecutionId");

CREATE UNIQUE INDEX "work_item_artifact_step_execution_unique"
ON "work_item_artifact_links" ("workItemId", "testStepExecutionId", "role")
WHERE "testStepExecutionId" IS NOT NULL;

ALTER TABLE "work_item_artifact_links"
ADD CONSTRAINT "work_item_artifact_links_testStepExecutionId_fkey"
FOREIGN KEY ("testStepExecutionId") REFERENCES "test_step_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "test_plan_items"
ADD COLUMN "deletedAt" TIMESTAMPTZ(6),
ADD COLUMN "deletedById" UUID;

DROP INDEX "test_plan_items_testPlanId_testCaseRowId_iteration_key";

DROP INDEX "test_plan_items_testPlanId_rank_idx";

CREATE INDEX "test_plan_items_testPlanId_rank_deletedAt_idx"
ON "test_plan_items" ("testPlanId", "rank", "deletedAt");

CREATE UNIQUE INDEX "test_plan_items_active_case_iteration_unique"
ON "test_plan_items" ("testPlanId", "testCaseRowId", COALESCE("iteration", ''))
WHERE "deletedAt" IS NULL;
