ALTER TABLE "documents"
ADD COLUMN "nextObjectNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "document_rows"
ADD COLUMN "objectNumber" INTEGER;

WITH numbered_rows AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "documentId"
      ORDER BY "createdAt", "id"
    )::INTEGER AS "objectNumber"
  FROM "document_rows"
)
UPDATE "document_rows" AS target
SET "objectNumber" = numbered_rows."objectNumber"
FROM numbered_rows
WHERE target."id" = numbered_rows."id";

ALTER TABLE "document_rows"
ALTER COLUMN "objectNumber" SET NOT NULL;

CREATE UNIQUE INDEX "document_rows_documentId_objectNumber_key"
ON "document_rows"("documentId", "objectNumber");

UPDATE "documents" AS document
SET "nextObjectNumber" = COALESCE(
  (
    SELECT MAX(row."objectNumber") + 1
    FROM "document_rows" AS row
    WHERE row."documentId" = document."id"
  ),
  1
);
