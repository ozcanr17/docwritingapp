-- CreateEnum
CREATE TYPE "ProjectKeyStrategy" AS ENUM ('unified', 'per_type');

-- AlterTable
ALTER TABLE "projects"
  ADD COLUMN "nextRecordNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "nextTestNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "keyStrategy" "ProjectKeyStrategy" NOT NULL DEFAULT 'unified',
  ADD COLUMN "testCode" TEXT;

-- AlterTable
ALTER TABLE "documents"
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "key" TEXT;

-- AlterTable
ALTER TABLE "test_executions"
  ADD COLUMN "projectId" UUID,
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "key" TEXT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the unified counter past every key already issued for work items and test plans
UPDATE "projects" p
SET "nextRecordNumber" = GREATEST(
  COALESCE((SELECT MAX(w."sequence") FROM "work_items" w WHERE w."projectId" = p."id"), 0),
  COALESCE((SELECT MAX(t."sequence") FROM "test_plans" t WHERE t."projectId" = p."id"), 0)
) + 1;

-- Attach every existing document to a project in its workspace, preferring the SYS project,
-- and issue keys from the unified counter in stable creation order
WITH target AS (
  SELECT
    d."id" AS document_id,
    p."id" AS project_id,
    p."code" AS project_code,
    p."nextRecordNumber" AS start_number,
    ROW_NUMBER() OVER (PARTITION BY p."id" ORDER BY d."createdAt", d."id") AS offset_number
  FROM "documents" d
  JOIN LATERAL (
    SELECT p2."id", p2."code", p2."nextRecordNumber"
    FROM "projects" p2
    WHERE p2."workspaceId" = d."workspaceId" AND p2."deletedAt" IS NULL
    ORDER BY (p2."code" = 'SYS') DESC, p2."createdAt" ASC
    LIMIT 1
  ) p ON TRUE
  WHERE d."projectId" IS NULL
)
UPDATE "documents" d
SET
  "projectId" = t.project_id,
  "sequence" = t.start_number + t.offset_number - 1,
  "key" = t.project_code || '-' || (t.start_number + t.offset_number - 1)
FROM target t
WHERE d."id" = t.document_id;

-- Advance the unified counter past the keys just issued to documents
UPDATE "projects" p
SET "nextRecordNumber" = GREATEST(
  p."nextRecordNumber",
  COALESCE((SELECT MAX(d."sequence") FROM "documents" d WHERE d."projectId" = p."id"), 0) + 1
);

-- Keep the per-type test counter aligned with the unified counter as a safe starting point
UPDATE "projects" p SET "nextTestNumber" = p."nextRecordNumber";

-- CreateIndex
CREATE UNIQUE INDEX "documents_projectId_key_key" ON "documents"("projectId", "key");

-- CreateIndex
CREATE INDEX "documents_projectId_deletedAt_idx" ON "documents"("projectId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "test_executions_projectId_key_key" ON "test_executions"("projectId", "key");
