ALTER TYPE "ExportJobType" ADD VALUE 'reqif';

-- CreateEnum
CREATE TYPE "SavedViewScope" AS ENUM ('personal', 'team');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('not_run', 'running', 'passed', 'failed', 'blocked', 'skipped');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('draft', 'active', 'approved', 'changes_requested', 'canceled');

-- CreateEnum
CREATE TYPE "ReviewDecisionType" AS ENUM ('approved', 'rejected', 'changes_requested');

-- CreateEnum
CREATE TYPE "ChangeProposalStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'applied');

-- CreateEnum
CREATE TYPE "ConfigurationKind" AS ENUM ('stream', 'baseline', 'variant');

-- CreateEnum
CREATE TYPE "RowAccessLevel" AS ENUM ('read', 'write', 'manage');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('webhook', 'jira', 'azure_devops', 'github', 'generic_rest', 'assistant');

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "SavedViewScope" NOT NULL DEFAULT 'personal',
    "filters" JSONB NOT NULL DEFAULT '[]',
    "sorting" JSONB NOT NULL DEFAULT '[]',
    "visibleColumns" JSONB NOT NULL DEFAULT '[]',
    "frozenColumns" JSONB NOT NULL DEFAULT '[]',
    "linkProjection" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "row_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "rowId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "row_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "testCaseRowId" UUID NOT NULL,
    "executedById" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'not_run',
    "environment" TEXT,
    "buildReference" TEXT,
    "iteration" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_step_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "executionId" UUID NOT NULL,
    "testStepRowId" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'not_run',
    "actualResult" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "executedAt" TIMESTAMPTZ(6),

    CONSTRAINT "test_step_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'draft',
    "reviewerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dueAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "decision" "ReviewDecisionType" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "rowId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "decidedById" UUID,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "proposedPatch" JSONB NOT NULL,
    "status" "ChangeProposalStatus" NOT NULL DEFAULT 'draft',
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "decidedAt" TIMESTAMPTZ(6),

    CONSTRAINT "change_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_configurations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "documentId" UUID,
    "parentId" UUID,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ConfigurationKind" NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "lockedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuration_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "configurationId" UUID NOT NULL,
    "rowId" UUID NOT NULL,
    "rowVersion" INTEGER NOT NULL,
    "applicability" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "configuration_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "row_access_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "rowId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accessLevel" "RowAccessLevel" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "row_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "integrationType" "IntegrationType" NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "integration_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_views_documentId_scope_deletedAt_idx" ON "saved_views"("documentId", "scope", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_documentId_ownerId_name_key" ON "saved_views"("documentId", "ownerId", "name");

-- CreateIndex
CREATE INDEX "row_comments_rowId_deletedAt_createdAt_idx" ON "row_comments"("rowId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "test_executions_testCaseRowId_createdAt_idx" ON "test_executions"("testCaseRowId", "createdAt");

-- CreateIndex
CREATE INDEX "test_executions_organizationId_status_idx" ON "test_executions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "test_step_executions_testStepRowId_idx" ON "test_step_executions"("testStepRowId");

-- CreateIndex
CREATE UNIQUE INDEX "test_step_executions_executionId_testStepRowId_key" ON "test_step_executions"("executionId", "testStepRowId");

-- CreateIndex
CREATE INDEX "reviews_documentId_status_createdAt_idx" ON "reviews"("documentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_decisions_reviewId_reviewerId_key" ON "review_decisions"("reviewId", "reviewerId");

-- CreateIndex
CREATE INDEX "change_proposals_rowId_status_createdAt_idx" ON "change_proposals"("rowId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "product_configurations_documentId_kind_idx" ON "product_configurations"("documentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "product_configurations_workspaceId_name_key" ON "product_configurations"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "configuration_items_rowId_idx" ON "configuration_items"("rowId");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_items_configurationId_rowId_key" ON "configuration_items"("configurationId", "rowId");

-- CreateIndex
CREATE INDEX "row_access_grants_userId_accessLevel_idx" ON "row_access_grants"("userId", "accessLevel");

-- CreateIndex
CREATE UNIQUE INDEX "row_access_grants_rowId_userId_key" ON "row_access_grants"("rowId", "userId");

-- CreateIndex
CREATE INDEX "integration_endpoints_organizationId_integrationType_enable_idx" ON "integration_endpoints"("organizationId", "integrationType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "integration_endpoints_organizationId_name_key" ON "integration_endpoints"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_comments" ADD CONSTRAINT "row_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_comments" ADD CONSTRAINT "row_comments_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_comments" ADD CONSTRAINT "row_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_testCaseRowId_fkey" FOREIGN KEY ("testCaseRowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_step_executions" ADD CONSTRAINT "test_step_executions_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "test_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_step_executions" ADD CONSTRAINT "test_step_executions_testStepRowId_fkey" FOREIGN KEY ("testStepRowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_proposals" ADD CONSTRAINT "change_proposals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_configurations" ADD CONSTRAINT "product_configurations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_configurations" ADD CONSTRAINT "product_configurations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_configurations" ADD CONSTRAINT "product_configurations_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_configurations" ADD CONSTRAINT "product_configurations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_configurations" ADD CONSTRAINT "product_configurations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "product_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration_items" ADD CONSTRAINT "configuration_items_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_access_grants" ADD CONSTRAINT "row_access_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_access_grants" ADD CONSTRAINT "row_access_grants_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "row_access_grants" ADD CONSTRAINT "row_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_endpoints" ADD CONSTRAINT "integration_endpoints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
