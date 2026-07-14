import { PrismaClient } from "@reqtrack/database";

export interface PurgeResult {
  purgedRows: number;
  purgedDocuments: number;
  purgedFolders: number;
  skippedForLegalHold: number;
}

const BATCH_SIZE = 500;

export async function runPurge(prisma: PrismaClient, retentionDays: number): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result: PurgeResult = { purgedRows: 0, purgedDocuments: 0, purgedFolders: 0, skippedForLegalHold: 0 };

  for (;;) {
    const rows = await prisma.documentRow.findMany({
      where: { deletedAt: { not: null, lt: cutoff } },
      orderBy: [{ deletedAt: "asc" }, { depth: "desc" }],
      take: BATCH_SIZE,
      select: { id: true, organizationId: true, documentId: true, rowType: true },
    });
    if (rows.length === 0) break;
    const holds = await activeHoldScopes(prisma, rows.map((r) => r.organizationId), rows.map((r) => r.documentId));
    const purgeable = rows.filter((r) => !holds.orgIds.has(r.organizationId) && !holds.documentIds.has(r.documentId));
    result.skippedForLegalHold += rows.length - purgeable.length;
    if (purgeable.length === 0) break;
    const ids = purgeable.map((r) => r.id);
    await prisma.$transaction(async (tx) => {
      await tx.requirementLink.deleteMany({
        where: { OR: [{ sourceRowId: { in: ids } }, { targetRowId: { in: ids } }] },
      });
      await tx.rowProject.deleteMany({ where: { rowId: { in: ids } } });
      await tx.attachment.deleteMany({ where: { rowId: { in: ids } } });
      await tx.requirementDetail.deleteMany({ where: { rowId: { in: ids } } });
      await tx.testCaseDetail.deleteMany({ where: { rowId: { in: ids } } });
      await tx.testStepDetail.deleteMany({ where: { rowId: { in: ids } } });
      await tx.documentRow.deleteMany({ where: { id: { in: ids } } });
      for (const row of purgeable) {
        await tx.auditEvent.create({
          data: {
            organizationId: row.organizationId,
            action: "row.purged",
            entityType: "document_row",
            entityId: row.id,
            documentId: row.documentId,
            metadata: { rowType: row.rowType, retentionDays },
          },
        });
      }
    });
    result.purgedRows += purgeable.length;
    if (rows.length < BATCH_SIZE) break;
  }

  for (;;) {
    const documents = await prisma.document.findMany({
      where: { deletedAt: { not: null, lt: cutoff }, rows: { none: {} } },
      take: BATCH_SIZE,
      select: { id: true, organizationId: true },
    });
    if (documents.length === 0) break;
    const holds = await activeHoldScopes(prisma, documents.map((d) => d.organizationId), documents.map((d) => d.id));
    const purgeable = documents.filter((d) => !holds.orgIds.has(d.organizationId) && !holds.documentIds.has(d.id));
    result.skippedForLegalHold += documents.length - purgeable.length;
    if (purgeable.length === 0) break;
    const ids = purgeable.map((d) => d.id);
    await prisma.$transaction(async (tx) => {
      await tx.customFieldDefinition.deleteMany({ where: { documentId: { in: ids } } });
      await tx.collaborationUpdate.deleteMany({ where: { documentId: { in: ids } } });
      await tx.collaborationSnapshot.deleteMany({ where: { documentId: { in: ids } } });
      await tx.documentRevision.deleteMany({ where: { documentId: { in: ids } } });
      await tx.attachment.deleteMany({ where: { documentId: { in: ids } } });
      await tx.exportJob.deleteMany({ where: { documentId: { in: ids } } });
      await tx.document.deleteMany({ where: { id: { in: ids } } });
      for (const doc of purgeable) {
        await tx.auditEvent.create({
          data: {
            organizationId: doc.organizationId,
            action: "document.purged",
            entityType: "document",
            entityId: doc.id,
            metadata: { retentionDays },
          },
        });
      }
    });
    result.purgedDocuments += purgeable.length;
    if (documents.length < BATCH_SIZE) break;
  }

  for (;;) {
    const folders = await prisma.folder.findMany({
      where: { deletedAt: { not: null, lt: cutoff }, children: { none: {} }, documents: { none: {} } },
      take: BATCH_SIZE,
      select: { id: true, organizationId: true },
    });
    if (folders.length === 0) break;
    const holds = await activeHoldScopes(prisma, folders.map((f) => f.organizationId), []);
    const purgeable = folders.filter((f) => !holds.orgIds.has(f.organizationId));
    result.skippedForLegalHold += folders.length - purgeable.length;
    if (purgeable.length === 0) break;
    const ids = purgeable.map((f) => f.id);
    await prisma.$transaction(async (tx) => {
      await tx.folder.deleteMany({ where: { id: { in: ids } } });
      for (const folder of purgeable) {
        await tx.auditEvent.create({
          data: {
            organizationId: folder.organizationId,
            action: "folder.purged",
            entityType: "folder",
            entityId: folder.id,
            metadata: { retentionDays },
          },
        });
      }
    });
    result.purgedFolders += purgeable.length;
    if (folders.length < BATCH_SIZE) break;
  }

  return result;
}

async function activeHoldScopes(
  prisma: PrismaClient,
  organizationIds: string[],
  documentIds: string[],
): Promise<{ orgIds: Set<string>; documentIds: Set<string> }> {
  const holds = await prisma.legalHold.findMany({
    where: {
      releasedAt: null,
      OR: [
        { scopeType: "organization", scopeId: { in: organizationIds } },
        { scopeType: "document", scopeId: { in: documentIds } },
      ],
    },
    select: { scopeType: true, scopeId: true },
  });
  return {
    orgIds: new Set(holds.filter((h) => h.scopeType === "organization").map((h) => h.scopeId)),
    documentIds: new Set(holds.filter((h) => h.scopeType === "document").map((h) => h.scopeId)),
  };
}

export async function compactSnapshots(prisma: PrismaClient, keepLatest: number): Promise<number> {
  const documents = await prisma.collaborationSnapshot.groupBy({
    by: ["documentId"],
    _count: { documentId: true },
    having: { documentId: { _count: { gt: keepLatest } } },
  });
  let removed = 0;
  for (const doc of documents) {
    const keep = await prisma.collaborationSnapshot.findMany({
      where: { documentId: doc.documentId },
      orderBy: { sequence: "desc" },
      take: keepLatest,
      select: { id: true },
    });
    const result = await prisma.collaborationSnapshot.deleteMany({
      where: { documentId: doc.documentId, id: { notIn: keep.map((k) => k.id) } },
    });
    removed += result.count;
  }
  return removed;
}
