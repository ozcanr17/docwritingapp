ALTER TABLE "document_templates"
ADD COLUMN "templateKind" TEXT NOT NULL DEFAULT 'document',
ADD COLUMN "contentSnapshot" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "row_comments"
ADD COLUMN "anchor" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "suggestedReplacement" TEXT;
