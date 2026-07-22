-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('epic', 'story', 'task', 'bug', 'risk');

-- CreateEnum
CREATE TYPE "WorkItemStatus" AS ENUM ('backlog', 'ready', 'in_progress', 'in_review', 'done', 'canceled');

-- CreateEnum
CREATE TYPE "WorkItemPriority" AS ENUM ('lowest', 'low', 'medium', 'high', 'highest', 'critical');

-- CreateEnum
CREATE TYPE "WorkItemRelationType" AS ENUM ('blocks', 'duplicates', 'relates_to', 'causes');

-- CreateEnum
CREATE TYPE "WorkItemArtifactRole" AS ENUM ('relates_to', 'affects', 'found_in', 'verifies');

-- CreateEnum
CREATE TYPE "TestPlanStatus" AS ENUM ('draft', 'active', 'completed', 'canceled');

-- AlterTable
ALTER TABLE "document_access_grants" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "nextTestPlanNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextWorkItemNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "test_executions" ADD COLUMN     "testPlanItemId" UUID;

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "type" "WorkItemType" NOT NULL,
    "status" "WorkItemStatus" NOT NULL DEFAULT 'backlog',
    "priority" "WorkItemPriority" NOT NULL DEFAULT 'medium',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reporterId" UUID NOT NULL,
    "assigneeId" UUID,
    "parentId" UUID,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dueAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),
    "rank" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_relations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sourceId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "relationType" "WorkItemRelationType" NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_artifact_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workItemId" UUID NOT NULL,
    "documentId" UUID,
    "rowId" UUID,
    "testExecutionId" UUID,
    "role" "WorkItemArtifactRole" NOT NULL DEFAULT 'relates_to',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_artifact_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "work_item_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TestPlanStatus" NOT NULL DEFAULT 'draft',
    "ownerId" UUID NOT NULL,
    "environment" TEXT,
    "buildReference" TEXT,
    "startsAt" TIMESTAMPTZ(6),
    "endsAt" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,

    CONSTRAINT "test_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_plan_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "testPlanId" UUID NOT NULL,
    "testCaseRowId" UUID NOT NULL,
    "assigneeId" UUID,
    "environment" TEXT,
    "iteration" TEXT,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_items_projectId_status_rank_idx" ON "work_items"("projectId", "status", "rank");

-- CreateIndex
CREATE INDEX "work_items_workspaceId_assigneeId_deletedAt_idx" ON "work_items"("workspaceId", "assigneeId", "deletedAt");

-- CreateIndex
CREATE INDEX "work_items_organizationId_type_deletedAt_idx" ON "work_items"("organizationId", "type", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "work_items_projectId_sequence_key" ON "work_items"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "work_items_organizationId_key_key" ON "work_items"("organizationId", "key");

-- CreateIndex
CREATE INDEX "work_item_relations_targetId_relationType_idx" ON "work_item_relations"("targetId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_relations_sourceId_targetId_relationType_key" ON "work_item_relations"("sourceId", "targetId", "relationType");

-- CreateIndex
CREATE INDEX "work_item_artifact_links_workItemId_createdAt_idx" ON "work_item_artifact_links"("workItemId", "createdAt");

-- CreateIndex
CREATE INDEX "work_item_artifact_links_documentId_idx" ON "work_item_artifact_links"("documentId");

-- CreateIndex
CREATE INDEX "work_item_artifact_links_rowId_idx" ON "work_item_artifact_links"("rowId");

-- CreateIndex
CREATE INDEX "work_item_artifact_links_testExecutionId_idx" ON "work_item_artifact_links"("testExecutionId");

-- CreateIndex
CREATE INDEX "work_item_comments_workItemId_deletedAt_createdAt_idx" ON "work_item_comments"("workItemId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "test_plans_projectId_status_deletedAt_idx" ON "test_plans"("projectId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "test_plans_projectId_sequence_key" ON "test_plans"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "test_plans_organizationId_key_key" ON "test_plans"("organizationId", "key");

-- CreateIndex
CREATE INDEX "test_plan_items_testPlanId_rank_idx" ON "test_plan_items"("testPlanId", "rank");

-- CreateIndex
CREATE INDEX "test_plan_items_testCaseRowId_idx" ON "test_plan_items"("testCaseRowId");

-- CreateIndex
CREATE UNIQUE INDEX "test_plan_items_testPlanId_testCaseRowId_iteration_key" ON "test_plan_items"("testPlanId", "testCaseRowId", "iteration");

-- CreateIndex
CREATE INDEX "test_executions_testPlanItemId_createdAt_idx" ON "test_executions"("testPlanItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_testPlanItemId_fkey" FOREIGN KEY ("testPlanItemId") REFERENCES "test_plan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_relations" ADD CONSTRAINT "work_item_relations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_relations" ADD CONSTRAINT "work_item_relations_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_artifact_links" ADD CONSTRAINT "work_item_artifact_links_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_artifact_links" ADD CONSTRAINT "work_item_artifact_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_artifact_links" ADD CONSTRAINT "work_item_artifact_links_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_artifact_links" ADD CONSTRAINT "work_item_artifact_links_testExecutionId_fkey" FOREIGN KEY ("testExecutionId") REFERENCES "test_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_items" ADD CONSTRAINT "test_plan_items_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "test_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_items" ADD CONSTRAINT "test_plan_items_testCaseRowId_fkey" FOREIGN KEY ("testCaseRowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_items" ADD CONSTRAINT "test_plan_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
