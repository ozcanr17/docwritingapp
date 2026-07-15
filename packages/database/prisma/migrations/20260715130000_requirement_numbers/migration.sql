ALTER TABLE "requirement_details" ADD COLUMN "requirementNo" TEXT;

WITH numbered AS (
  SELECT rd."rowId", row_number() OVER (
    PARTITION BY r."documentId"
    ORDER BY r."createdAt", r.id
  ) AS sequence
  FROM "requirement_details" rd
  JOIN "document_rows" r ON r.id = rd."rowId"
)
UPDATE "requirement_details" rd
SET "requirementNo" = 'REQ-' || lpad(numbered.sequence::text, 3, '0')
FROM numbered
WHERE numbered."rowId" = rd."rowId";
