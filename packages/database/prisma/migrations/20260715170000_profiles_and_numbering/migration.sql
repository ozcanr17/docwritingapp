ALTER TABLE "users"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "jobTitle" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "bio" TEXT;

ALTER TABLE "document_rows"
ADD COLUMN "numberingStart" INTEGER;

ALTER TABLE "document_rows"
ADD CONSTRAINT "document_rows_numberingStart_check"
CHECK ("numberingStart" IS NULL OR "numberingStart" > 0);
