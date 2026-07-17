ALTER TABLE "documents" ADD COLUMN "requirementPrefix" TEXT NOT NULL DEFAULT 'REQ';

ALTER TABLE "documents" ADD CONSTRAINT "documents_requirementPrefix_format" CHECK ("requirementPrefix" ~ '^[A-Z][A-Z0-9]{0,19}$');
