DROP INDEX IF EXISTS "document_rows_documentId_ancestorPath_idx";
DROP INDEX IF EXISTS "folders_workspaceId_ancestorPath_idx";

CREATE INDEX "document_rows_documentId_ancestorPath_idx"
  ON "document_rows" ("documentId", "ancestorPath" text_pattern_ops);

CREATE INDEX "folders_workspaceId_ancestorPath_idx"
  ON "folders" ("workspaceId", "ancestorPath" text_pattern_ops);
