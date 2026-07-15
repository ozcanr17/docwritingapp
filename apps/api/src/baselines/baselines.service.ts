import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@docsys/database";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

interface SnapshotRow {
  id: string;
  objectNumber: number;
  numberingStart: number | null;
  parentId: string | null;
  rank: string;
  rowType: string;
  title: string;
  description: string | null;
  status: string | null;
  customFields: Prisma.JsonValue;
  requirementDetail: Prisma.JsonValue | null;
  testCaseDetail: Prisma.JsonValue | null;
  testStepDetail: Prisma.JsonValue | null;
  outgoingLinks: Prisma.JsonValue;
  incomingLinks: Prisma.JsonValue;
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item !== null && typeof item === "object") {
      if (item instanceof Date) return item.toISOString();
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, normalize(nested)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

@Injectable()
export class BaselinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async createBaseline(actorId: string, documentId: string, label?: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const rows = await this.snapshotRows(documentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${documentId}::text, 0))`;
      const last = await tx.documentRevision.findFirst({
        where: { documentId },
        orderBy: { revisionNumber: "desc" },
        select: { revisionNumber: true, semanticVersion: true },
      });
      const revisionNumber = (last?.revisionNumber ?? 0) + 1;
      const previousMinor = Number(last?.semanticVersion.split(".")[1] ?? -1);
      const semanticVersion = `1.${Number.isFinite(previousMinor) ? previousMinor + 1 : revisionNumber - 1}`;
      const revision = await tx.documentRevision.create({
        data: {
          organizationId: document.organizationId,
          documentId,
          revisionNumber,
          semanticVersion,
          label: label?.trim() || null,
          createdById: actorId,
          summary: { rowCount: rows.length, rows } as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "baseline.created",
        entityType: "document_revision",
        entityId: revision.id,
        documentId,
        metadata: { revisionNumber, semanticVersion, label, rowCount: rows.length },
      });
      return { id: revision.id, revisionNumber, semanticVersion, label: revision.label, rowCount: rows.length, createdAt: revision.createdAt };
    });
  }

  async listBaselines(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const revisions = await this.prisma.documentRevision.findMany({
      where: { documentId },
      orderBy: { revisionNumber: "desc" },
      select: { id: true, revisionNumber: true, semanticVersion: true, label: true, createdAt: true, summary: true },
    });
    return revisions.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      semanticVersion: r.semanticVersion,
      label: r.label,
      createdAt: r.createdAt,
      rowCount: (r.summary as { rowCount?: number }).rowCount ?? 0,
    }));
  }

  async diff(actorId: string, documentId: string, revisionNumber: number) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const revision = await this.prisma.documentRevision.findFirst({
      where: { documentId, revisionNumber },
    });
    if (!revision) throw new NotFoundException("Baseline not found");
    const baselineRows = ((revision.summary as { rows?: SnapshotRow[] }).rows ?? []) as SnapshotRow[];
    const currentRows = await this.snapshotRows(documentId);

    const baselineById = new Map(baselineRows.map((r) => [r.id, r]));
    const currentById = new Map(currentRows.map((r) => [r.id, r]));

    const added = currentRows.filter((r) => !baselineById.has(r.id)).map((r) => ({ id: r.id, title: r.title }));
    const removed = baselineRows.filter((r) => !currentById.has(r.id)).map((r) => ({ id: r.id, title: r.title }));
    const modified = currentRows
      .filter((r) => {
        const old = baselineById.get(r.id);
        return old && stableJson(old) !== stableJson(r);
      })
      .map((r) => {
        const old = baselineById.get(r.id) as SnapshotRow;
        return { id: r.id, before: old.title, after: r.title };
      });

    return {
      revisionNumber,
      semanticVersion: revision.semanticVersion,
      label: revision.label,
      added,
      removed,
      modified,
      summary: { added: added.length, removed: removed.length, modified: modified.length },
    };
  }

  private async snapshotRows(documentId: string): Promise<SnapshotRow[]> {
    const rows = await this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      select: {
        id: true,
        objectNumber: true,
        numberingStart: true,
        parentId: true,
        rank: true,
        rowType: true,
        title: true,
        description: true,
        customFields: true,
        requirementDetail: { select: { requirementNo: true, status: true, priority: true, rationale: true, verificationMethod: true } },
        testCaseDetail: { select: { status: true, priority: true, assigneeId: true, tags: true } },
        testStepDetail: { select: { stepNumber: true, action: true, expectedResult: true, testResult: true } },
        outgoingLinks: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: { id: true, targetRowId: true, linkType: true, suspect: true, suspectSince: true } },
        incomingLinks: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: { id: true, sourceRowId: true, linkType: true, suspect: true, suspectSince: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      objectNumber: r.objectNumber,
      numberingStart: r.numberingStart,
      parentId: r.parentId,
      rank: r.rank,
      rowType: r.rowType,
      title: r.title,
      description: r.description,
      status: r.requirementDetail?.status ?? r.testCaseDetail?.status ?? null,
      customFields: r.customFields,
      requirementDetail: r.requirementDetail as unknown as Prisma.JsonValue | null,
      testCaseDetail: r.testCaseDetail as unknown as Prisma.JsonValue | null,
      testStepDetail: r.testStepDetail as unknown as Prisma.JsonValue | null,
      outgoingLinks: r.outgoingLinks as unknown as Prisma.JsonValue,
      incomingLinks: r.incomingLinks as unknown as Prisma.JsonValue,
    }));
  }

  private async requireDocument(documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }
}
