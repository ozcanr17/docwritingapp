CREATE TABLE "document_access_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "accessLevel" "RowAccessLevel" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_access_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_access_grants_documentId_userId_key" ON "document_access_grants"("documentId", "userId");
CREATE INDEX "document_access_grants_userId_accessLevel_idx" ON "document_access_grants"("userId", "accessLevel");

ALTER TABLE "document_access_grants" ADD CONSTRAINT "document_access_grants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_access_grants" ADD CONSTRAINT "document_access_grants_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_access_grants" ADD CONSTRAINT "document_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
