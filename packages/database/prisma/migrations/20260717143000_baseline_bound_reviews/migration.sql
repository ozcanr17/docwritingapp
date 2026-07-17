ALTER TABLE "reviews" ADD COLUMN "baselineRevisionNumber" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "baselineSemanticVersion" TEXT;
ALTER TABLE "reviews" ADD COLUMN "contentHash" TEXT;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_baseline_binding_consistency" CHECK (
  ("baselineRevisionNumber" IS NULL AND "baselineSemanticVersion" IS NULL AND "contentHash" IS NULL)
  OR
  ("baselineRevisionNumber" IS NOT NULL AND "baselineSemanticVersion" IS NOT NULL AND "contentHash" IS NOT NULL)
);
