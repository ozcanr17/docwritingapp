-- CreateTable
CREATE TABLE "work_item_type_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseType" "WorkItemType" NOT NULL,
    "color" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "work_item_type_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "projectId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "fieldType" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "appliesToKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "archivedAt" TIMESTAMPTZ(6),

    CONSTRAINT "work_item_field_definitions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "work_items"
  ADD COLUMN "typeDefinitionId" UUID,
  ADD COLUMN "customFields" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "work_item_type_definitions_projectId_key_key" ON "work_item_type_definitions"("projectId", "key");

-- CreateIndex
CREATE INDEX "work_item_type_definitions_projectId_archivedAt_displayOrder_idx" ON "work_item_type_definitions"("projectId", "archivedAt", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_field_definitions_projectId_key_key" ON "work_item_field_definitions"("projectId", "key");

-- CreateIndex
CREATE INDEX "work_item_field_definitions_projectId_archivedAt_displayOrde_idx" ON "work_item_field_definitions"("projectId", "archivedAt", "displayOrder");

-- AddForeignKey
ALTER TABLE "work_item_type_definitions" ADD CONSTRAINT "work_item_type_definitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_field_definitions" ADD CONSTRAINT "work_item_field_definitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_typeDefinitionId_fkey" FOREIGN KEY ("typeDefinitionId") REFERENCES "work_item_type_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the five built-in work item types for every existing project
INSERT INTO "work_item_type_definitions" ("projectId", "key", "name", "baseType", "displayOrder", "isSystem", "updatedAt")
SELECT p."id", seed.key, seed.name, seed.key::"WorkItemType", seed.display_order, true, CURRENT_TIMESTAMP
FROM "projects" p
CROSS JOIN (VALUES
  ('epic', 'Epic', 0),
  ('story', 'Story', 1),
  ('task', 'Task', 2),
  ('bug', 'Bug', 3),
  ('risk', 'Risk', 4)
) AS seed(key, name, display_order)
ON CONFLICT ("projectId", "key") DO NOTHING;

-- Point existing work items at their matching seeded type definition
UPDATE "work_items" w
SET "typeDefinitionId" = d."id"
FROM "work_item_type_definitions" d
WHERE d."projectId" = w."projectId" AND d."key" = w."type"::TEXT AND w."typeDefinitionId" IS NULL;
