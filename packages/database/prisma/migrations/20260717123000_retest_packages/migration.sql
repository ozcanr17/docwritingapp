CREATE TYPE "RetestPackageStatus" AS ENUM ('draft', 'active', 'completed', 'canceled');

CREATE TABLE "retest_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RetestPackageStatus" NOT NULL DEFAULT 'draft',
    "sourceRevisionNumber" INTEGER,
    "impactDepth" INTEGER NOT NULL DEFAULT 1,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "completedAt" TIMESTAMPTZ(6),
    "canceledAt" TIMESTAMPTZ(6),
    CONSTRAINT "retest_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retest_package_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "packageId" UUID NOT NULL,
    "testRowId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceRowIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "retest_package_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "test_executions" ADD COLUMN "retestPackageItemId" UUID;

CREATE INDEX "retest_packages_sourceDocumentId_createdAt_idx" ON "retest_packages"("sourceDocumentId", "createdAt");
CREATE INDEX "retest_packages_workspaceId_status_createdAt_idx" ON "retest_packages"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "retest_package_items_packageId_testRowId_key" ON "retest_package_items"("packageId", "testRowId");
CREATE INDEX "retest_package_items_testRowId_createdAt_idx" ON "retest_package_items"("testRowId", "createdAt");
CREATE INDEX "test_executions_retestPackageItemId_createdAt_idx" ON "test_executions"("retestPackageItemId", "createdAt");

ALTER TABLE "retest_packages" ADD CONSTRAINT "retest_packages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retest_packages" ADD CONSTRAINT "retest_packages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retest_packages" ADD CONSTRAINT "retest_packages_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retest_packages" ADD CONSTRAINT "retest_packages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retest_package_items" ADD CONSTRAINT "retest_package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "retest_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retest_package_items" ADD CONSTRAINT "retest_package_items_testRowId_fkey" FOREIGN KEY ("testRowId") REFERENCES "document_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_executions" ADD CONSTRAINT "test_executions_retestPackageItemId_fkey" FOREIGN KEY ("retestPackageItemId") REFERENCES "retest_package_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
