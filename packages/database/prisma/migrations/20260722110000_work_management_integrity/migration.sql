ALTER TABLE "work_item_artifact_links"
ADD CONSTRAINT "work_item_artifact_exactly_one_target"
CHECK (num_nonnulls("documentId", "rowId", "testExecutionId") = 1);

CREATE UNIQUE INDEX "work_item_artifact_document_unique"
ON "work_item_artifact_links" ("workItemId", "documentId", "role")
WHERE "documentId" IS NOT NULL;

CREATE UNIQUE INDEX "work_item_artifact_row_unique"
ON "work_item_artifact_links" ("workItemId", "rowId", "role")
WHERE "rowId" IS NOT NULL;

CREATE UNIQUE INDEX "work_item_artifact_execution_unique"
ON "work_item_artifact_links" ("workItemId", "testExecutionId", "role")
WHERE "testExecutionId" IS NOT NULL;
