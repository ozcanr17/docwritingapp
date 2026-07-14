-- DropIndex
DROP INDEX "requirement_links_organizationId_idx";

-- AlterTable
ALTER TABLE "requirement_links" ADD COLUMN     "suspect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspectReason" TEXT,
ADD COLUMN     "suspectSince" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "requirement_links_sourceRowId_deletedAt_idx" ON "requirement_links"("sourceRowId", "deletedAt");

-- CreateIndex
CREATE INDEX "requirement_links_organizationId_suspect_idx" ON "requirement_links"("organizationId", "suspect");
