ALTER TABLE "document_revisions" ADD COLUMN "semanticVersion" TEXT;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "documentId" ORDER BY "revisionNumber") - 1 AS minor
  FROM "document_revisions"
)
UPDATE "document_revisions" revision
SET "semanticVersion" = '1.' || numbered.minor::text
FROM numbered
WHERE revision."id" = numbered."id";

ALTER TABLE "document_revisions" ALTER COLUMN "semanticVersion" SET NOT NULL;
CREATE UNIQUE INDEX "document_revisions_documentId_semanticVersion_key" ON "document_revisions"("documentId", "semanticVersion");
