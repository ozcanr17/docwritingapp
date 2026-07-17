ALTER TABLE "retest_package_items" ALTER COLUMN "sourceRowIds" SET NOT NULL;
ALTER TABLE "retest_packages" ADD CONSTRAINT "retest_packages_impactDepth_check" CHECK ("impactDepth" BETWEEN 1 AND 3);
ALTER TABLE "retest_packages" ADD CONSTRAINT "retest_packages_name_check" CHECK (length(btrim("name")) > 0);
