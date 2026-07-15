import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DocumentType, Prisma, RowType } from "@docsys/database";
import { randomUUID } from "crypto";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { rankBetween } from "../common/rank";
import { PrismaService } from "../prisma/prisma.service";
import { validateCustomFields } from "./custom-field.validator";

export interface CreateRowInput {
  documentId: string;
  parentId: string | null;
  afterRowId?: string;
  rowType: RowType;
  title: string;
  description?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateRowInput {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  customFields?: Record<string, unknown>;
  requirementDetail?: { requirementNo?: string | null; status?: string; priority?: string | null; rationale?: string | null };
  testCaseDetail?: { status?: string; priority?: string | null; assigneeId?: string | null; tags?: string[] };
  testStepDetail?: { action?: string | null; expectedResult?: string | null; testResult?: string | null };
}

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async createRow(actorId: string, input: CreateRowInput) {
    const document = await this.requireDocument(input.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    this.assertRowTypeAllowed(document.documentType, input.rowType);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      let ancestorPath = "";
      let depth = 0;
      if (input.parentId) {
        const parent = await tx.documentRow.findFirst({
          where: { id: input.parentId, documentId: document.id, deletedAt: null },
        });
        if (!parent) throw new NotFoundException("Parent row not found");
        this.assertParentAllowed(input.rowType, parent.rowType);
        ancestorPath = `${parent.ancestorPath}${parent.id}/`;
        depth = parent.depth + 1;
      } else if (input.rowType === "test_step") {
        throw new UnprocessableEntityException("Test steps must be created under a test case");
      }
      const rank = await this.computeInsertRank(tx, document.id, input.parentId, input.afterRowId);
      const customFields = input.customFields
        ? validateCustomFields(await this.fieldDefinitions(tx, document.id), input.customFields)
        : {};
      const created = await tx.documentRow.create({
        data: {
          organizationId: document.organizationId,
          documentId: document.id,
          parentId: input.parentId,
          rank,
          ancestorPath,
          depth,
          rowType: input.rowType,
          title: input.title,
          description: input.description ?? null,
          customFields: customFields as Prisma.InputJsonValue,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      if (input.rowType === "requirement") {
        const existingNumbers = new Set(
          (await tx.requirementDetail.findMany({
            where: { row: { documentId: document.id } },
            select: { requirementNo: true },
          })).map((detail) => detail.requirementNo),
        );
        let sequence = existingNumbers.size + 1;
        while (existingNumbers.has(`REQ-${String(sequence).padStart(3, "0")}`)) sequence += 1;
        await tx.requirementDetail.create({
          data: { rowId: created.id, requirementNo: `REQ-${String(sequence).padStart(3, "0")}` },
        });
      } else if (input.rowType === "test_case") {
        await tx.testCaseDetail.create({ data: { rowId: created.id } });
      } else if (input.rowType === "test_step") {
        await tx.testStepDetail.create({ data: { rowId: created.id } });
      }
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.created",
        entityType: "document_row",
        entityId: created.id,
        documentId: document.id,
        nextData: { rowType: input.rowType, title: input.title, parentId: input.parentId },
      });
      return created;
    });
    await this.events.publish({
      type: "row.created",
      documentId: document.id,
      organizationId: document.organizationId,
      entityId: row.id,
      version: row.version,
      actorId,
    });
    return row;
  }

  async listChildren(actorId: string, documentId: string, parentId: string | null, limit: number, offset: number) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const rows = await this.prisma.documentRow.findMany({
      where: { documentId, parentId, deletedAt: null },
      orderBy: { rank: "asc" },
      take: limit,
      skip: offset,
      include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true },
    });
    const readable = await this.access.readableRowIds(actorId, rows.map((row) => row.id));
    return rows.filter((row) => readable.has(row.id));
  }

  async outline(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const rows = await this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      select: {
        id: true,
        parentId: true,
        rank: true,
        depth: true,
        rowType: true,
        title: true,
        description: true,
        customFields: true,
        version: true,
        requirementDetail: { select: { requirementNo: true, status: true, priority: true } },
        testCaseDetail: { select: { status: true, priority: true, tags: true } },
        testStepDetail: { select: { action: true, expectedResult: true, testResult: true } },
        outgoingLinks: {
          where: { deletedAt: null },
          select: {
            targetRow: {
              select: {
                id: true,
                rowType: true,
                title: true,
                description: true,
                requirementDetail: { select: { requirementNo: true } },
                document: { select: { title: true } },
              },
            },
          },
        },
        incomingLinks: {
          where: { deletedAt: null },
          select: {
            sourceRow: {
              select: {
                id: true,
                rowType: true,
                title: true,
                description: true,
                requirementDetail: { select: { requirementNo: true } },
                document: { select: { title: true } },
              },
            },
          },
        },
      },
    });
    const readable = await this.access.readableRowIds(actorId, rows.map((row) => row.id));
    const flattened = rows.filter((row) => readable.has(row.id)).map((row) => {
      const linked = [...row.outgoingLinks.map((link) => link.targetRow), ...row.incomingLinks.map((link) => link.sourceRow)]
        .filter((linkedRow) => linkedRow.rowType === "requirement")
        .filter((linkedRow, index, all) => all.findIndex((candidate) => candidate.id === linkedRow.id) === index)
        .sort((a, b) =>
          (a.requirementDetail?.requirementNo ?? a.title).localeCompare(
            b.requirementDetail?.requirementNo ?? b.title,
          ),
        )
        .map((linkedRow) => ({
          id: linkedRow.id,
          requirementNo: linkedRow.requirementDetail?.requirementNo ?? null,
          title: linkedRow.title,
          description: linkedRow.description,
          documentTitle: linkedRow.document.title,
        }));
      return {
        id: row.id,
        parentId: row.parentId,
        rank: row.rank,
        depth: row.depth,
        rowType: row.rowType,
        title: row.title,
        description: row.description,
        customFields: row.customFields as Record<string, unknown>,
        version: row.version,
        requirementNo: row.requirementDetail?.requirementNo ?? null,
        status: row.requirementDetail?.status ?? row.testCaseDetail?.status ?? null,
        priority: row.requirementDetail?.priority ?? row.testCaseDetail?.priority ?? null,
        tags: row.testCaseDetail?.tags ?? [],
        action: row.testStepDetail?.action ?? null,
        expectedResult: row.testStepDetail?.expectedResult ?? null,
        testResult: row.testStepDetail?.testResult ?? null,
        linkedRequirements: linked,
        linkCount: row.outgoingLinks.length + row.incomingLinks.length,
      };
    });
    return this.numberRows(flattened);
  }

  async getRow(actorId: string, rowId: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    await this.access.assertRowAccess(actorId, rowId, "read");
    return this.prisma.documentRow.findUniqueOrThrow({
      where: { id: rowId },
      include: {
        requirementDetail: true,
        testCaseDetail: true,
        testStepDetail: true,
        outgoingLinks: {
          where: { deletedAt: null },
          include: {
            targetRow: {
              select: {
                id: true,
                title: true,
                rowType: true,
                requirementDetail: { select: { requirementNo: true } },
                document: { select: { id: true, title: true, documentType: true } },
              },
            },
          },
        },
        incomingLinks: {
          where: { deletedAt: null },
          include: {
            sourceRow: {
              select: {
                id: true,
                title: true,
                rowType: true,
                requirementDetail: { select: { requirementNo: true } },
                document: { select: { id: true, title: true, documentType: true } },
              },
            },
          },
        },
        rowProjects: { where: { deletedAt: null } },
      },
    });
  }

  async linkCandidates(actorId: string, documentId: string, query: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const normalized = query.trim();
    return this.prisma.documentRow.findMany({
      where: {
        organizationId: document.organizationId,
        deletedAt: null,
        document: { workspaceId: document.workspaceId, deletedAt: null },
        rowType: { in: ["requirement", "test_case", "test_step"] },
        ...(normalized
          ? {
              OR: [
                { title: { contains: normalized, mode: "insensitive" } },
                { description: { contains: normalized, mode: "insensitive" } },
                { document: { title: { contains: normalized, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ document: { title: "asc" } }, { depth: "asc" }, { rank: "asc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        description: true,
        rowType: true,
        requirementDetail: { select: { requirementNo: true } },
        document: { select: { id: true, title: true, documentType: true } },
      },
    });
  }

  async updateRow(actorId: string, rowId: string, input: UpdateRowInput) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    await this.access.assertRowAccess(actorId, rowId, "write");
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.requirementDetail?.requirementNo !== undefined && row.rowType === "requirement") {
        const requirementNo = input.requirementDetail.requirementNo?.trim() || null;
        input.requirementDetail.requirementNo = requirementNo;
        if (requirementNo) {
          const duplicate = await tx.requirementDetail.findFirst({
            where: {
              requirementNo: { equals: requirementNo, mode: "insensitive" },
              rowId: { not: rowId },
              row: { documentId: document.id, deletedAt: null },
            },
            select: { rowId: true },
          });
          if (duplicate) throw new UnprocessableEntityException("Requirement number must be unique in the document");
        }
      }
      const customFields =
        input.customFields !== undefined
          ? validateCustomFields(await this.fieldDefinitions(tx, document.id), {
              ...(row.customFields as Record<string, unknown>),
              ...input.customFields,
            })
          : undefined;
      const result = await tx.documentRow.updateMany({
        where: { id: rowId, version: input.expectedVersion, deletedAt: null },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(customFields !== undefined ? { customFields: customFields as Prisma.InputJsonValue } : {}),
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (result.count === 0) {
        const current = await tx.documentRow.findFirst({ where: { id: rowId } });
        throw new ConflictException(current);
      }
      if (input.requirementDetail && row.rowType === "requirement") {
        await tx.requirementDetail.update({ where: { rowId }, data: input.requirementDetail });
      }
      if (input.testCaseDetail && row.rowType === "test_case") {
        await tx.testCaseDetail.update({ where: { rowId }, data: input.testCaseDetail });
      }
      if (input.testStepDetail && row.rowType === "test_step") {
        await tx.testStepDetail.update({ where: { rowId }, data: input.testStepDetail });
      }
      const suspectResult = await tx.requirementLink.updateMany({
        where: {
          deletedAt: null,
          suspect: false,
          OR: [{ sourceRowId: rowId }, { targetRowId: rowId }],
        },
        data: { suspect: true, suspectSince: new Date(), suspectReason: "linked row changed" },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.updated",
        entityType: "document_row",
        entityId: rowId,
        documentId: document.id,
        previousData: { title: row.title, version: row.version },
        nextData: { title: input.title ?? row.title, suspectLinksMarked: suspectResult.count },
      });
      return tx.documentRow.findUniqueOrThrow({
        where: { id: rowId },
        include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true },
      });
    });
    await this.events.publish({
      type: "row.updated",
      documentId: document.id,
      organizationId: document.organizationId,
      entityId: rowId,
      version: updated.version,
      actorId,
    });
    return updated;
  }

  async moveRow(
    actorId: string,
    rowId: string,
    newParentId: string | null,
    afterRowId: string | undefined,
    expectedVersion: number,
  ) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    await this.access.assertRowAccess(actorId, rowId, "write");
    const moved = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const current = await tx.documentRow.findFirst({ where: { id: rowId, deletedAt: null } });
      if (!current) throw new NotFoundException("Row not found");
      if (current.version !== expectedVersion) throw new ConflictException(current);
      const oldPrefix = `${current.ancestorPath}${current.id}/`;
      let newAncestorPath = "";
      let newDepth = 0;
      if (newParentId) {
        const parent = await tx.documentRow.findFirst({
          where: { id: newParentId, documentId: document.id, deletedAt: null },
        });
        if (!parent) throw new NotFoundException("Target parent not found");
        this.assertParentAllowed(current.rowType, parent.rowType);
        if (parent.id === current.id || `${parent.ancestorPath}${parent.id}/`.startsWith(oldPrefix)) {
          throw new UnprocessableEntityException("Move would create a cycle");
        }
        newAncestorPath = `${parent.ancestorPath}${parent.id}/`;
        newDepth = parent.depth + 1;
      } else if (current.rowType === "test_step") {
        throw new UnprocessableEntityException("Test steps must stay under a test case");
      }
      const rank = await this.computeInsertRank(tx, document.id, newParentId, afterRowId, current.id);
      await tx.documentRow.update({
        where: { id: current.id },
        data: {
          parentId: newParentId,
          ancestorPath: newAncestorPath,
          depth: newDepth,
          rank,
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      const newPrefix = `${newAncestorPath}${current.id}/`;
      const depthDelta = newDepth - current.depth;
      await tx.$executeRaw`
        UPDATE document_rows
        SET "ancestorPath" = ${newPrefix} || substring("ancestorPath" from ${oldPrefix.length + 1}::int),
            depth = depth + ${depthDelta}::int
        WHERE "documentId" = ${document.id}::uuid
          AND "ancestorPath" LIKE ${oldPrefix} || '%'`;
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.moved",
        entityType: "document_row",
        entityId: current.id,
        documentId: document.id,
        previousData: { parentId: current.parentId, rank: current.rank },
        nextData: { parentId: newParentId, rank },
      });
      return tx.documentRow.findUniqueOrThrow({ where: { id: current.id } });
    });
    await this.events.publish({
      type: "row.moved",
      documentId: document.id,
      organizationId: document.organizationId,
      entityId: rowId,
      version: moved.version,
      actorId,
    });
    return moved;
  }

  async deleteRow(actorId: string, rowId: string, reason?: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    await this.access.assertRowAccess(actorId, rowId, "write");
    const correlationId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      const prefix = `${row.ancestorPath}${row.id}/`;
      await tx.documentRow.updateMany({
        where: {
          documentId: document.id,
          deletedAt: null,
          OR: [{ id: row.id }, { ancestorPath: { startsWith: prefix } }],
        },
        data: { deletedAt, deletedById: actorId, deletionReason: reason ?? null },
      });
      await tx.requirementLink.updateMany({
        where: {
          deletedAt: null,
          OR: [{ sourceRowId: row.id }, { targetRowId: row.id }],
        },
        data: { deletedAt, deletedById: actorId },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.deleted",
        entityType: "document_row",
        entityId: row.id,
        documentId: document.id,
        correlationId,
        metadata: { reason: reason ?? null },
      });
    });
    await this.events.publish({
      type: "row.deleted",
      documentId: document.id,
      organizationId: document.organizationId,
      entityId: rowId,
      actorId,
    });
    return { ok: true, correlationId };
  }

  async restoreRow(actorId: string, rowId: string) {
    const row = await this.prisma.documentRow.findFirst({ where: { id: rowId } });
    if (!row || !row.deletedAt) throw new NotFoundException("Deleted row not found");
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const deletedAt = row.deletedAt;
    await this.prisma.$transaction(async (tx) => {
      if (row.parentId) {
        const parent = await tx.documentRow.findFirst({ where: { id: row.parentId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException("Parent row is deleted; restore the parent first");
      }
      const prefix = `${row.ancestorPath}${row.id}/`;
      await tx.documentRow.updateMany({
        where: {
          documentId: document.id,
          deletedAt,
          OR: [{ id: row.id }, { ancestorPath: { startsWith: prefix } }],
        },
        data: { deletedAt: null, deletedById: null, deletionReason: null },
      });
      await tx.requirementLink.updateMany({
        where: { deletedAt, OR: [{ sourceRowId: row.id }, { targetRowId: row.id }] },
        data: { deletedAt: null, deletedById: null },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.restored",
        entityType: "document_row",
        entityId: row.id,
        documentId: document.id,
      });
    });
    await this.events.publish({
      type: "row.restored",
      documentId: document.id,
      organizationId: document.organizationId,
      entityId: rowId,
      actorId,
    });
    return { ok: true };
  }

  async copyRows(actorId: string, documentId: string, rowIds: string[], newParentId: string | null) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const selected = await this.prisma.documentRow.findMany({
      where: { id: { in: rowIds }, documentId, deletedAt: null },
    });
    if (selected.length !== new Set(rowIds).size) throw new NotFoundException("One or more rows were not found");
    const selectedSet = new Set(rowIds);
    const roots = selected.filter((row) => {
      const ancestors = row.ancestorPath.split("/").filter(Boolean);
      return !ancestors.some((ancestorId) => selectedSet.has(ancestorId));
    });
    if (newParentId) {
      const parent = await this.prisma.documentRow.findFirst({ where: { id: newParentId, documentId, deletedAt: null } });
      if (!parent) throw new NotFoundException("Target parent not found");
      for (const root of roots) this.assertParentAllowed(root.rowType, parent.rowType);
    } else if (roots.some((row) => row.rowType === "test_step")) {
      throw new UnprocessableEntityException("Test steps must stay under a test case");
    }
    const sourceRows = await this.prisma.documentRow.findMany({
      where: {
        documentId,
        deletedAt: null,
        OR: roots.flatMap((root) => [
          { id: root.id },
          { ancestorPath: { startsWith: `${root.ancestorPath}${root.id}/` } },
        ]),
      },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const idMap = new Map<string, { id: string; ancestorPath: string; depth: number }>();
      let requirementSequence = await tx.requirementDetail.count({ where: { row: { documentId } } });
      let afterRowId: string | undefined;
      for (const source of sourceRows) {
        const isRoot = roots.some((root) => root.id === source.id);
        const mappedParent = source.parentId ? idMap.get(source.parentId) : undefined;
        const parentId = isRoot ? newParentId : mappedParent?.id ?? null;
        const parent = parentId
          ? mappedParent ?? (await tx.documentRow.findUnique({ where: { id: parentId }, select: { id: true, ancestorPath: true, depth: true } })) ?? undefined
          : undefined;
        const rank = isRoot
          ? await this.computeInsertRank(tx, documentId, newParentId, afterRowId)
          : source.rank;
        const created = await tx.documentRow.create({
          data: {
            organizationId: document.organizationId,
            documentId,
            parentId,
            rank,
            ancestorPath: parent ? `${parent.ancestorPath}${parent.id}/` : "",
            depth: parent ? parent.depth + 1 : 0,
            rowType: source.rowType,
            title: source.title,
            description: source.description,
            customFields: source.customFields as Prisma.InputJsonValue,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        idMap.set(source.id, { id: created.id, ancestorPath: created.ancestorPath, depth: created.depth });
        if (isRoot) afterRowId = created.id;
        if (source.rowType === "requirement") {
          requirementSequence += 1;
          await tx.requirementDetail.create({
            data: {
              rowId: created.id,
              requirementNo: `REQ-${String(requirementSequence).padStart(3, "0")}`,
              status: source.requirementDetail?.status,
              priority: source.requirementDetail?.priority,
              rationale: source.requirementDetail?.rationale,
              verificationMethod: source.requirementDetail?.verificationMethod,
            },
          });
        } else if (source.rowType === "test_case") {
          await tx.testCaseDetail.create({
            data: {
              rowId: created.id,
              status: source.testCaseDetail?.status,
              priority: source.testCaseDetail?.priority,
              assigneeId: source.testCaseDetail?.assigneeId,
              tags: source.testCaseDetail?.tags,
            },
          });
        } else if (source.rowType === "test_step") {
          await tx.testStepDetail.create({
            data: {
              rowId: created.id,
              action: source.testStepDetail?.action,
              expectedResult: source.testStepDetail?.expectedResult,
              testResult: source.testStepDetail?.testResult,
            },
          });
        }
      }
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "rows.copied",
        entityType: "document",
        entityId: document.id,
        documentId,
        metadata: { sourceRowIds: roots.map((row) => row.id), copiedRows: idMap.size, newParentId },
      });
      return { copiedRows: idMap.size, rootIds: roots.map((root) => idMap.get(root.id)?.id).filter(Boolean) };
    });
  }

  async createLink(actorId: string, sourceRowId: string, targetRowId: string, linkType: "verifies" | "relates_to" | "derives_from" | "duplicates") {
    const source = await this.requireRow(sourceRowId);
    const target = await this.requireRow(targetRowId);
    const sourceDoc = await this.requireDocument(source.documentId);
    const targetDoc = await this.requireDocument(target.documentId);
    if (sourceDoc.organizationId !== targetDoc.organizationId) {
      throw new UnprocessableEntityException("Cross-organization links are not allowed");
    }
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: sourceDoc.organizationId,
      workspaceId: sourceDoc.workspaceId,
    });
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: targetDoc.organizationId,
      workspaceId: targetDoc.workspaceId,
    });
    await this.access.assertRowAccess(actorId, sourceRowId, "write");
    await this.access.assertRowAccess(actorId, targetRowId, "read");
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.requirementLink.upsert({
        where: { sourceRowId_targetRowId_linkType: { sourceRowId, targetRowId, linkType } },
        update: { deletedAt: null, deletedById: null },
        create: {
          organizationId: sourceDoc.organizationId,
          sourceRowId,
          targetRowId,
          linkType,
          createdById: actorId,
        },
      });
      await this.audit.record(tx, {
        organizationId: sourceDoc.organizationId,
        actorId,
        action: "link.created",
        entityType: "requirement_link",
        entityId: link.id,
        documentId: sourceDoc.id,
        nextData: { sourceRowId, targetRowId, linkType },
      });
      return link;
    });
  }

  async deleteLink(actorId: string, linkId: string) {
    const link = await this.prisma.requirementLink.findFirst({ where: { id: linkId, deletedAt: null } });
    if (!link) throw new NotFoundException("Link not found");
    const source = await this.requireRow(link.sourceRowId);
    const sourceDoc = await this.requireDocument(source.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: sourceDoc.organizationId,
      workspaceId: sourceDoc.workspaceId,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.requirementLink.update({
        where: { id: linkId },
        data: { deletedAt: new Date(), deletedById: actorId },
      });
      await this.audit.record(tx, {
        organizationId: link.organizationId,
        actorId,
        action: "link.deleted",
        entityType: "requirement_link",
        entityId: linkId,
      });
    });
    return { ok: true };
  }

  async acknowledgeLink(actorId: string, linkId: string) {
    const link = await this.prisma.requirementLink.findFirst({ where: { id: linkId, deletedAt: null } });
    if (!link) throw new NotFoundException("Link not found");
    const source = await this.requireRow(link.sourceRowId);
    const sourceDoc = await this.requireDocument(source.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: sourceDoc.organizationId,
      workspaceId: sourceDoc.workspaceId,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.requirementLink.update({
        where: { id: linkId },
        data: { suspect: false, suspectSince: null, suspectReason: null },
      });
      await this.audit.record(tx, {
        organizationId: link.organizationId,
        actorId,
        action: "link.acknowledged",
        entityType: "requirement_link",
        entityId: linkId,
      });
    });
    return { ok: true };
  }

  async listSuspectLinks(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    return this.prisma.requirementLink.findMany({
      where: {
        deletedAt: null,
        suspect: true,
        OR: [{ sourceRow: { documentId } }, { targetRow: { documentId } }],
      },
      include: {
        sourceRow: { select: { id: true, title: true, documentId: true } },
        targetRow: { select: { id: true, title: true, documentId: true } },
      },
      orderBy: { suspectSince: "desc" },
    });
  }

  async coverage(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const requirements = await this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null, rowType: "requirement" },
      select: {
        id: true,
        title: true,
        incomingLinks: {
          where: { deletedAt: null, linkType: "verifies" },
          select: { id: true, suspect: true },
        },
      },
    });
    const covered = requirements.filter((r) => r.incomingLinks.length > 0);
    const suspect = requirements.filter((r) => r.incomingLinks.some((l) => l.suspect));
    return {
      totalRequirements: requirements.length,
      covered: covered.length,
      uncovered: requirements.length - covered.length,
      suspect: suspect.length,
      uncoveredRows: requirements
        .filter((r) => r.incomingLinks.length === 0)
        .map((r) => ({ id: r.id, title: r.title })),
    };
  }

  async traceabilityMatrix(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const requirements = await this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null, rowType: "requirement" },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      select: {
        id: true,
        title: true,
        incomingLinks: {
          where: { deletedAt: null },
          select: {
            id: true,
            suspect: true,
            linkType: true,
            sourceRow: { select: { id: true, title: true, rowType: true } },
          },
        },
      },
    });
    return requirements.map((requirement) => ({
      id: requirement.id,
      title: requirement.title,
      links: requirement.incomingLinks.map((link) => ({
        linkId: link.id,
        suspect: link.suspect,
        linkType: link.linkType,
        sourceId: link.sourceRow.id,
        sourceTitle: link.sourceRow.title,
        sourceType: link.sourceRow.rowType,
      })),
    }));
  }

  async assignProject(actorId: string, rowId: string, projectId: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: document.organizationId, deletedAt: null },
    });
    if (!project) throw new NotFoundException("Project not found");
    return this.prisma.rowProject.upsert({
      where: { rowId_projectId: { rowId, projectId } },
      update: { deletedAt: null },
      create: { organizationId: document.organizationId, rowId, projectId, createdById: actorId },
    });
  }

  async removeProject(actorId: string, rowId: string, projectId: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    await this.prisma.rowProject.updateMany({
      where: { rowId, projectId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async createFieldDefinition(
    actorId: string,
    documentId: string,
    input: {
      fieldKey: string;
      displayName: string;
      fieldType: string;
      isRequired?: boolean;
      isSearchable?: boolean;
      allowedValues?: string[];
      displayOrder?: number;
    },
  ) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    return this.prisma.customFieldDefinition.create({
      data: {
        organizationId: document.organizationId,
        documentId,
        fieldKey: input.fieldKey,
        displayName: input.displayName,
        fieldType: input.fieldType as never,
        isRequired: input.isRequired ?? false,
        isSearchable: input.isSearchable ?? false,
        allowedValues: (input.allowedValues ?? []) as Prisma.InputJsonValue,
        displayOrder: input.displayOrder ?? 0,
        createdById: actorId,
      },
    });
  }

  async listFieldDefinitions(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    return this.prisma.customFieldDefinition.findMany({
      where: { documentId, deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
  }

  private async computeInsertRank(
    tx: Prisma.TransactionClient,
    documentId: string,
    parentId: string | null,
    afterRowId: string | undefined,
    excludeRowId?: string,
  ): Promise<string> {
    const siblings = await tx.documentRow.findMany({
      where: { documentId, parentId, deletedAt: null, ...(excludeRowId ? { id: { not: excludeRowId } } : {}) },
      orderBy: { rank: "asc" },
      select: { id: true, rank: true },
    });
    if (!afterRowId) {
      const last = siblings[siblings.length - 1];
      return rankBetween(last?.rank ?? null, null);
    }
    const index = siblings.findIndex((s) => s.id === afterRowId);
    if (index === -1) throw new NotFoundException("Reference sibling not found");
    const prev = siblings[index];
    const next = siblings[index + 1];
    return rankBetween(prev?.rank ?? null, next?.rank ?? null);
  }

  private async fieldDefinitions(tx: Prisma.TransactionClient, documentId: string) {
    return tx.customFieldDefinition.findMany({ where: { documentId, deletedAt: null } });
  }

  private assertRowTypeAllowed(documentType: DocumentType, rowType: RowType) {
    const allowed: Record<DocumentType, RowType[]> = {
      requirement: ["heading", "requirement", "note"],
      test: ["heading", "test_case", "test_step", "note"],
      general_document: [],
    };
    if (!allowed[documentType].includes(rowType)) {
      throw new UnprocessableEntityException("Row type is not allowed in this document type");
    }
  }

  private assertParentAllowed(rowType: RowType, parentType: RowType) {
    const valid =
      rowType === "test_step"
        ? parentType === "test_case"
        : rowType === "heading"
          ? parentType === "heading"
          : rowType === "requirement"
            ? parentType === "heading" || parentType === "requirement"
            : rowType === "test_case"
              ? parentType === "heading"
            : true;
    if (!valid) throw new UnprocessableEntityException("Row type is not allowed under this parent");
  }

  private numberRows<T extends { id: string; parentId: string | null; rank: string }>(rows: T[]) {
    const childrenByParent = new Map<string | null, T[]>();
    for (const row of rows) {
      const list = childrenByParent.get(row.parentId) ?? [];
      list.push(row);
      childrenByParent.set(row.parentId, list);
    }
    const result: Array<T & { displayNumber: string }> = [];
    const visit = (parentId: string | null, prefix: string) => {
      const children = (childrenByParent.get(parentId) ?? []).sort((a, b) => (a.rank < b.rank ? -1 : 1));
      children.forEach((child, index) => {
        const displayNumber = prefix === "" ? `${index + 1}` : `${prefix}.${index + 1}`;
        result.push({ ...child, displayNumber });
        visit(child.id, displayNumber);
      });
    };
    visit(null, "");
    return result;
  }

  private async requireDocument(documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  private async requireRow(rowId: string) {
    const row = await this.prisma.documentRow.findFirst({ where: { id: rowId, deletedAt: null } });
    if (!row) throw new NotFoundException("Row not found");
    return row;
  }
}
