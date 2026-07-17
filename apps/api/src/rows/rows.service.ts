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
import { resolveTestScenario } from "../common/test-scenarios";
import { PrismaService } from "../prisma/prisma.service";
import { validateCustomFields } from "./custom-field.validator";
import { testTemplateCopy, TestTemplateLocale } from "./test-template-copy";

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
  numberingStart?: number | null;
  title?: string;
  description?: string | null;
  customFields?: Record<string, unknown>;
  requirementDetail?: { requirementNo?: string | null; status?: string; priority?: string | null; rationale?: string | null };
  testCaseDetail?: { status?: string; priority?: string | null; assigneeId?: string | null; tags?: string[] };
  testStepDetail?: { stepNumber?: number | null; action?: string | null; expectedResult?: string | null; testResult?: string | null };
}

interface RowAuthoringSnapshot {
  snapshotVersion: 1;
  version: number;
  title: string;
  description: string | null;
  numberingStart: number | null;
  customFields: Prisma.JsonValue;
  requirementDetail: Prisma.JsonValue | null;
  testCaseDetail: Prisma.JsonValue | null;
  testStepDetail: Prisma.JsonValue | null;
}

function authoringSnapshot(row: {
  version: number;
  title: string;
  description: string | null;
  numberingStart: number | null;
  customFields: Prisma.JsonValue;
  requirementDetail: unknown;
  testCaseDetail: unknown;
  testStepDetail: unknown;
}): RowAuthoringSnapshot {
  const requirement = row.requirementDetail as { requirementNo?: string | null; status?: string; priority?: string | null; rationale?: string | null; verificationMethod?: string | null } | null;
  const testCase = row.testCaseDetail as { status?: string; priority?: string | null; assigneeId?: string | null; tags?: string[] } | null;
  const testStep = row.testStepDetail as { stepNumber?: number | null; action?: string | null; expectedResult?: string | null; testResult?: string | null } | null;
  return {
    snapshotVersion: 1,
    version: row.version,
    title: row.title,
    description: row.description,
    numberingStart: row.numberingStart,
    customFields: row.customFields,
    requirementDetail: requirement ? { requirementNo: requirement.requirementNo ?? null, status: requirement.status ?? "draft", priority: requirement.priority ?? null, rationale: requirement.rationale ?? null, verificationMethod: requirement.verificationMethod ?? null } : null,
    testCaseDetail: testCase ? { status: testCase.status ?? "draft", priority: testCase.priority ?? null, assigneeId: testCase.assigneeId ?? null, tags: testCase.tags ?? [] } : null,
    testStepDetail: testStep ? { stepNumber: testStep.stepNumber ?? null, action: testStep.action ?? null, expectedResult: testStep.expectedResult ?? null, testResult: testStep.testResult ?? null } : null,
  };
}

function isAuthoringSnapshot(value: Prisma.JsonValue | null): value is RowAuthoringSnapshot & Prisma.JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.snapshotVersion === 1 && typeof value.version === "number");
}

export interface TemplateRowSnapshot {
  key: string;
  parentKey: string | null;
  rank: string;
  rowType: RowType;
  title: string;
  description: string | null;
  numberingStart: number | null;
  customFields: Record<string, unknown>;
  requirementDetail?: { status?: string; priority?: string | null; rationale?: string | null; verificationMethod?: string | null } | null;
  testCaseDetail?: { status?: string; priority?: string | null; tags?: string[] } | null;
  testStepDetail?: { stepNumber?: number | null; action?: string | null; expectedResult?: string | null } | null;
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
      documentId: document.id,
    });
    this.assertRowTypeAllowed(document.documentType, input.rowType);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const counter = await tx.document.update({
        where: { id: document.id },
        data: { nextObjectNumber: { increment: 1 } },
        select: { nextObjectNumber: true },
      });
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
      }
      const rank = await this.computeInsertRank(tx, document.id, input.parentId, input.afterRowId);
      const customFields = input.customFields
        ? validateCustomFields(await this.fieldDefinitions(tx, document.id), input.customFields)
        : {};
      const created = await tx.documentRow.create({
        data: {
          organizationId: document.organizationId,
          documentId: document.id,
          objectNumber: counter.nextObjectNumber - 1,
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
        const nextRequirementNo = await this.requirementNumberGenerator(tx, document.id, document.requirementPrefix);
        await tx.requirementDetail.create({
          data: { rowId: created.id, requirementNo: nextRequirementNo() },
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

  async createTestTemplate(
    actorId: string,
    documentId: string,
    name: string,
    parentId: string | null,
    locale: TestTemplateLocale,
    legacySectionTitles?: string[],
    legacyDefaultContent?: string,
  ) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
    });
    if (document.documentType !== "test") throw new UnprocessableEntityException("Test templates require a test document");
    const localizedCopy = testTemplateCopy(locale);
    const sectionTitles = legacySectionTitles ?? localizedCopy.sectionTitles;
    const defaultContent = legacyDefaultContent ?? localizedCopy.defaultContent;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      let rootPath = "";
      let rootDepth = 0;
      if (parentId) {
        const parent = await tx.documentRow.findFirst({ where: { id: parentId, documentId, deletedAt: null } });
        if (!parent) throw new NotFoundException("Parent row not found");
        if (parent.rowType !== "heading") throw new UnprocessableEntityException("Test templates can only be nested under headings");
        rootPath = `${parent.ancestorPath}${parent.id}/`;
        rootDepth = parent.depth + 1;
      }
      const counter = await tx.document.update({
        where: { id: documentId },
        data: { nextObjectNumber: { increment: 9 } },
        select: { nextObjectNumber: true },
      });
      let objectNumber = counter.nextObjectNumber - 9;
      const rootRank = await this.computeInsertRank(tx, documentId, parentId, undefined);
      const root = await tx.documentRow.create({
        data: {
          organizationId: document.organizationId,
          documentId,
          objectNumber: objectNumber++,
          parentId,
          rank: rootRank,
          ancestorPath: rootPath,
          depth: rootDepth,
          rowType: "heading",
          title: name,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      let previousRank: string | null = null;
      const sections = [];
      for (const title of sectionTitles) {
        const rank = rankBetween(previousRank, null);
        const section = await tx.documentRow.create({
          data: {
            organizationId: document.organizationId,
            documentId,
            objectNumber: objectNumber++,
            parentId: root.id,
            rank,
            ancestorPath: `${root.ancestorPath}${root.id}/`,
            depth: root.depth + 1,
            rowType: "heading",
            title,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        sections.push(section);
        previousRank = rank;
      }
      const placeholderRows = [];
      for (const section of sections.slice(0, 3)) {
        const placeholder = await tx.documentRow.create({
          data: {
            organizationId: document.organizationId,
            documentId,
            objectNumber: objectNumber++,
            parentId: section.id,
            rank: rankBetween(null, null),
            ancestorPath: `${section.ancestorPath}${section.id}/`,
            depth: section.depth + 1,
            rowType: "note",
            title: defaultContent,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        placeholderRows.push(placeholder);
      }
      const stepParent = sections.at(-1) as (typeof sections)[number];
      const step = await tx.documentRow.create({
        data: {
          organizationId: document.organizationId,
          documentId,
          objectNumber,
          parentId: stepParent.id,
          rank: rankBetween(null, null),
          ancestorPath: `${stepParent.ancestorPath}${stepParent.id}/`,
          depth: stepParent.depth + 1,
          rowType: "test_step",
          title: "",
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await tx.testStepDetail.create({ data: { rowId: step.id } });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "test_template.created",
        entityType: "document_row",
        entityId: root.id,
        documentId,
        nextData: { name, parentId, sectionTitles, defaultContent, stepId: step.id },
      });
      return { root, sections, placeholderRows, step };
    });
    await this.events.publish({
      type: "row.created",
      documentId,
      organizationId: document.organizationId,
      entityId: created.root.id,
      version: created.root.version,
      actorId,
    });
    return created;
  }

  async listChildren(actorId: string, documentId: string, parentId: string | null, limit: number, offset: number) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
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
      documentId: document.id,
    });
    const [rows, latestBaseline] = await Promise.all([this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      select: {
        id: true,
        objectNumber: true,
        numberingStart: true,
        parentId: true,
        rank: true,
        depth: true,
        rowType: true,
        title: true,
        description: true,
        customFields: true,
        version: true,
        updatedAt: true,
        updatedById: true,
        requirementDetail: { select: { requirementNo: true, status: true, priority: true } },
        testCaseDetail: { select: { status: true, priority: true, tags: true } },
        testStepDetail: { select: { stepNumber: true, action: true, expectedResult: true, testResult: true } },
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
                testStepDetail: { select: { action: true, expectedResult: true } },
                document: { select: { id: true, title: true, documentType: true } },
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
                testStepDetail: { select: { action: true, expectedResult: true } },
                document: { select: { id: true, title: true, documentType: true } },
              },
            },
          },
        },
      },
    }), this.prisma.documentRevision.findFirst({
      where: { documentId },
      orderBy: { revisionNumber: "desc" },
      select: { createdAt: true, summary: true },
    })]);
    const baselineRowIds = new Set(
      ((latestBaseline?.summary as { rows?: Array<{ id?: string }> } | undefined)?.rows ?? [])
        .flatMap((snapshot) => typeof snapshot.id === "string" ? [snapshot.id] : []),
    );
    const readable = await this.access.readableRowIds(actorId, rows.map((row) => row.id));
    const linkedRowIds = rows.flatMap((row) => [
      ...row.outgoingLinks.map((link) => link.targetRow.id),
      ...row.incomingLinks.map((link) => link.sourceRow.id),
    ]);
    const readableLinked = await this.access.readableRowIds(actorId, linkedRowIds);
    const flattened = rows.filter((row) => readable.has(row.id)).map((row) => {
      const linkedObjects = [...row.outgoingLinks.map((link) => link.targetRow), ...row.incomingLinks.map((link) => link.sourceRow)]
        .filter((linkedRow) => readableLinked.has(linkedRow.id))
        .filter((linkedRow, index, all) => all.findIndex((candidate) => candidate.id === linkedRow.id) === index)
        .map((linkedRow) => ({
          id: linkedRow.id,
          rowType: linkedRow.rowType,
          requirementNo: linkedRow.requirementDetail?.requirementNo ?? null,
          title: linkedRow.title,
          description: linkedRow.description,
          action: linkedRow.testStepDetail?.action ?? null,
          expectedResult: linkedRow.testStepDetail?.expectedResult ?? null,
          document: linkedRow.document,
        }));
      const linked = linkedObjects
        .filter((linkedRow) => linkedRow.rowType === "requirement")
        .sort((a, b) =>
          (a.requirementNo ?? a.title).localeCompare(
            b.requirementNo ?? b.title,
          ),
        )
        .map((linkedRow) => ({
          id: linkedRow.id,
          requirementNo: linkedRow.requirementNo,
          title: linkedRow.title,
          description: linkedRow.description,
          documentTitle: linkedRow.document.title,
        }));
      return {
        id: row.id,
        objectNumber: row.objectNumber,
        numberingStart: row.numberingStart,
        parentId: row.parentId,
        rank: row.rank,
        depth: row.depth,
        rowType: row.rowType,
        title: row.title,
        description: row.description,
        customFields: row.customFields as Record<string, unknown>,
        version: row.version,
        updatedAt: row.updatedAt,
        updatedById: row.updatedById,
        changeState: latestBaseline && baselineRowIds.has(row.id) && row.updatedAt <= latestBaseline.createdAt
          ? "baseline"
          : row.updatedById === actorId
            ? "saved_self"
            : "saved_other",
        requirementNo: row.requirementDetail?.requirementNo ?? null,
        status: row.requirementDetail?.status ?? row.testCaseDetail?.status ?? null,
        priority: row.requirementDetail?.priority ?? row.testCaseDetail?.priority ?? null,
        tags: row.testCaseDetail?.tags ?? [],
        action: row.testStepDetail?.action ?? null,
        expectedResult: row.testStepDetail?.expectedResult ?? null,
        testResult: row.testStepDetail?.testResult ?? null,
        configuredStepNumber: row.testStepDetail?.stepNumber ?? null,
        linkedRequirements: linked,
        linkedObjects,
        linkCount: linkedObjects.length,
      };
    });
    const numbered = this.numberRows(flattened);
    const stepNumbers = new Map<string, number>();
    return numbered.map((row) => {
      const { configuredStepNumber, ...result } = row;
      if (row.rowType !== "test_step") return { ...result, stepNumber: configuredStepNumber };
      const key = row.parentId ?? "root";
      const derivedStepNumber = (stepNumbers.get(key) ?? 0) + 1;
      const stepNumber = configuredStepNumber ?? derivedStepNumber;
      stepNumbers.set(key, stepNumber);
      return { ...result, stepNumber };
    });
  }

  async getRow(actorId: string, rowId: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
    });
    await this.access.assertRowAccess(actorId, rowId, "read");
    const result = await this.prisma.documentRow.findUniqueOrThrow({
      where: { id: rowId },
      include: {
        document: { select: { id: true, title: true, documentType: true } },
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
    const readableLinked = await this.access.readableRowIds(actorId, [
      ...result.outgoingLinks.map((link) => link.targetRow.id),
      ...result.incomingLinks.map((link) => link.sourceRow.id),
    ]);
    return {
      ...result,
      outgoingLinks: result.outgoingLinks.filter((link) => readableLinked.has(link.targetRow.id)),
      incomingLinks: result.incomingLinks.filter((link) => readableLinked.has(link.sourceRow.id)),
    };
  }

  async rowHistory(actorId: string, rowId: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.read", { organizationId: document.organizationId, workspaceId: document.workspaceId, documentId: document.id });
    await this.access.assertRowAccess(actorId, rowId, "read");
    const events = await this.prisma.auditEvent.findMany({
      where: { entityType: "document_row", entityId: rowId, action: { in: ["row.updated", "row.version_restored"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, actorId: true, previousData: true, nextData: true, createdAt: true },
    });
    const actorIds = [...new Set(events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, email: true } }) : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const entries = events.flatMap((event, index) => {
      const snapshots: Array<{ side: "before" | "after"; snapshot: RowAuthoringSnapshot }> = [];
      if (isAuthoringSnapshot(event.nextData)) snapshots.push({ side: "after", snapshot: event.nextData });
      if (index === events.length - 1 && isAuthoringSnapshot(event.previousData)) snapshots.push({ side: "before", snapshot: event.previousData });
      return snapshots.map(({ side, snapshot }) => ({
        id: `${event.id}:${side}`,
        eventId: event.id,
        side,
        action: event.action,
        version: snapshot.version,
        createdAt: event.createdAt,
        actor: event.actorId ? actorById.get(event.actorId) ?? null : null,
        snapshot,
        current: snapshot.version === row.version,
      }));
    });
    return entries.sort((left, right) => right.version - left.version);
  }

  async documentHistory(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.read", { organizationId: document.organizationId, workspaceId: document.workspaceId, documentId });
    const events = await this.prisma.auditEvent.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: { id: true, action: true, entityType: true, entityId: true, actorId: true, metadata: true, createdAt: true },
    });
    const actorIds = [...new Set(events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))];
    const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, email: true } }) : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const rowIds = [...new Set(events.filter((event) => event.entityType === "document_row").map((event) => event.entityId))];
    const rows = rowIds.length ? await this.prisma.documentRow.findMany({ where: { id: { in: rowIds } }, select: { id: true, objectNumber: true, title: true, rowType: true } }) : [];
    const rowById = new Map(rows.map((item) => [item.id, item]));
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      createdAt: event.createdAt,
      actor: event.actorId ? actorById.get(event.actorId) ?? null : null,
      row: event.entityType === "document_row" ? rowById.get(event.entityId) ?? null : null,
      metadata: event.metadata,
    }));
  }

  async restoreRowVersion(actorId: string, rowId: string, eventId: string, expectedVersion: number, side: "before" | "after") {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", { organizationId: document.organizationId, workspaceId: document.workspaceId, documentId: document.id });
    await this.access.assertRowAccess(actorId, rowId, "write");
    const event = await this.prisma.auditEvent.findFirst({ where: { id: eventId, entityType: "document_row", entityId: rowId } });
    const snapshotValue = side === "before" ? event?.previousData ?? null : event?.nextData ?? null;
    if (!event || !isAuthoringSnapshot(snapshotValue)) throw new UnprocessableEntityException("This history entry cannot be restored");
    const target = snapshotValue;
    const restored = await this.prisma.$transaction(async (tx) => {
      const current = await tx.documentRow.findUniqueOrThrow({ where: { id: rowId }, include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true } });
      if (current.version !== expectedVersion) throw new ConflictException(current);
      const validatedCustomFields = validateCustomFields(await this.fieldDefinitions(tx, document.id), target.customFields as Record<string, unknown>);
      const requirement = target.requirementDetail as { requirementNo?: string | null; status?: string; priority?: string | null; rationale?: string | null; verificationMethod?: string | null } | null;
      if (requirement?.requirementNo) {
        const duplicate = await tx.requirementDetail.findFirst({ where: { requirementNo: { equals: requirement.requirementNo, mode: "insensitive" }, rowId: { not: rowId }, row: { documentId: document.id, deletedAt: null } }, select: { rowId: true } });
        if (duplicate) throw new UnprocessableEntityException("Historical requirement number is already in use");
      }
      await tx.documentRow.update({
        where: { id: rowId },
        data: { title: target.title, description: target.description, numberingStart: target.numberingStart, customFields: validatedCustomFields as Prisma.InputJsonValue, version: { increment: 1 }, updatedById: actorId },
      });
      if (requirement) {
        const data = { requirementNo: requirement.requirementNo ?? null, status: requirement.status ?? "draft", priority: requirement.priority ?? null, rationale: requirement.rationale ?? null, verificationMethod: requirement.verificationMethod ?? null };
        await tx.requirementDetail.upsert({ where: { rowId }, create: { rowId, ...data }, update: data });
      }
      const testCase = target.testCaseDetail as { status?: string; priority?: string | null; assigneeId?: string | null; tags?: string[] } | null;
      if (testCase) {
        const data = { status: testCase.status ?? "draft", priority: testCase.priority ?? null, assigneeId: testCase.assigneeId ?? null, tags: testCase.tags ?? [] };
        await tx.testCaseDetail.upsert({ where: { rowId }, create: { rowId, ...data }, update: data });
      }
      const testStep = target.testStepDetail as { stepNumber?: number | null; action?: string | null; expectedResult?: string | null; testResult?: string | null } | null;
      if (testStep) {
        const data = { stepNumber: testStep.stepNumber ?? null, action: testStep.action ?? null, expectedResult: testStep.expectedResult ?? null, testResult: testStep.testResult ?? null };
        await tx.testStepDetail.upsert({ where: { rowId }, create: { rowId, ...data }, update: data });
      }
      const suspectResult = await tx.requirementLink.updateMany({ where: { deletedAt: null, suspect: false, OR: [{ sourceRowId: rowId }, { targetRowId: rowId }] }, data: { suspect: true, suspectSince: new Date(), suspectReason: "historical row version restored" } });
      const next = await tx.documentRow.findUniqueOrThrow({ where: { id: rowId }, include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true } });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.version_restored",
        entityType: "document_row",
        entityId: rowId,
        documentId: document.id,
        previousData: authoringSnapshot(current) as unknown as Prisma.InputJsonValue,
        nextData: authoringSnapshot(next) as unknown as Prisma.InputJsonValue,
        metadata: { sourceEventId: eventId, sourceSide: side, restoredVersion: target.version, suspectLinksMarked: suspectResult.count },
      });
      return next;
    });
    await this.events.publish({ type: "row.updated", documentId: document.id, organizationId: document.organizationId, entityId: rowId, version: restored.version, actorId });
    return restored;
  }

  async linkCandidates(actorId: string, documentId: string, query: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId,
    });
    const normalized = query.trim();
    const candidates = await this.prisma.documentRow.findMany({
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
    const readable = await this.access.readableRowIds(actorId, candidates.map((candidate) => candidate.id));
    return candidates.filter((candidate) => readable.has(candidate.id));
  }

  async updateRow(actorId: string, rowId: string, input: UpdateRowInput) {
    const row = await this.requireRow(rowId);
    const rowWithDetails = await this.prisma.documentRow.findUniqueOrThrow({
      where: { id: rowId },
      include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true },
    });
    const beforeSnapshot = authoringSnapshot(rowWithDetails);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
    });
    await this.access.assertRowAccess(actorId, rowId, "write");
    if (input.numberingStart !== undefined && row.rowType !== "heading" && row.rowType !== "test_case") {
      throw new UnprocessableEntityException("Only headings and test cases can start numbering");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.requirementDetail?.requirementNo !== undefined) {
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
          ...(input.numberingStart !== undefined ? { numberingStart: input.numberingStart } : {}),
          ...(customFields !== undefined ? { customFields: customFields as Prisma.InputJsonValue } : {}),
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (result.count === 0) {
        const current = await tx.documentRow.findFirst({ where: { id: rowId } });
        throw new ConflictException(current);
      }
      if (input.requirementDetail) {
        await tx.requirementDetail.upsert({ where: { rowId }, create: { rowId, ...input.requirementDetail }, update: input.requirementDetail });
      }
      if (input.testCaseDetail) {
        const nextAssigneeId = input.testCaseDetail.assigneeId;
        const currentTestCase = nextAssigneeId === undefined ? null : await tx.testCaseDetail.findUnique({ where: { rowId }, select: { assigneeId: true } });
        if (nextAssigneeId !== undefined && nextAssigneeId !== currentTestCase?.assigneeId && nextAssigneeId) {
          const member = await tx.organizationMember.findFirst({ where: { organizationId: document.organizationId, userId: nextAssigneeId, deletedAt: null }, select: { userId: true } });
          if (!member) throw new UnprocessableEntityException("Assignee must be an organization member");
          if (nextAssigneeId !== actorId) {
            await tx.notification.create({
              data: {
                organizationId: document.organizationId,
                recipientId: nextAssigneeId,
                type: "assignment",
                payload: { rowId, documentId: document.id, title: input.title ?? row.title, documentTitle: document.title } as Prisma.InputJsonValue,
              },
            });
          }
        }
        await tx.testCaseDetail.upsert({ where: { rowId }, create: { rowId, ...input.testCaseDetail }, update: input.testCaseDetail });
      }
      if (input.testStepDetail) {
        await tx.testStepDetail.upsert({ where: { rowId }, create: { rowId, ...input.testStepDetail }, update: input.testStepDetail });
      }
      const suspectResult = await tx.requirementLink.updateMany({
        where: {
          deletedAt: null,
          suspect: false,
          OR: [{ sourceRowId: rowId }, { targetRowId: rowId }],
        },
        data: { suspect: true, suspectSince: new Date(), suspectReason: "linked row changed" },
      });
      const nextRow = await tx.documentRow.findUniqueOrThrow({
        where: { id: rowId },
        include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "row.updated",
        entityType: "document_row",
        entityId: rowId,
        documentId: document.id,
        previousData: beforeSnapshot as unknown as Prisma.InputJsonValue,
        nextData: authoringSnapshot(nextRow) as unknown as Prisma.InputJsonValue,
        metadata: { suspectLinksMarked: suspectResult.count },
      });
      return nextRow;
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
      documentId: document.id,
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

  async deleteRow(
    actorId: string,
    rowId: string,
    reason?: string,
    childStrategy: "delete_subtree" | "promote_children" = "delete_subtree",
  ) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
    });
    await this.access.assertRowAccess(actorId, rowId, "write");
    const correlationId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const deletedAt = new Date();
      const prefix = `${row.ancestorPath}${row.id}/`;
      const affected = await tx.documentRow.findMany({
        where: {
          documentId: document.id,
          deletedAt: null,
          OR: [{ id: row.id }, { ancestorPath: { startsWith: prefix } }],
        },
        select: { id: true },
      });
      if (childStrategy === "promote_children") {
        await tx.documentRow.update({
          where: { id: row.id },
          data: { deletedAt, deletedById: actorId, deletionReason: reason ?? null },
        });
        const children = await tx.documentRow.findMany({
          where: { documentId: document.id, parentId: row.id, deletedAt: null },
          orderBy: { rank: "asc" },
          select: { id: true },
        });
        await tx.documentRow.updateMany({
          where: { documentId: document.id, parentId: row.id, deletedAt: null },
          data: { parentId: row.parentId, version: { increment: 1 }, updatedById: actorId },
        });
        await tx.$executeRaw`
          UPDATE document_rows
          SET "ancestorPath" = ${row.ancestorPath} || substring("ancestorPath" from ${prefix.length + 1}::int),
              depth = depth - 1
          WHERE "documentId" = ${document.id}::uuid
            AND "ancestorPath" LIKE ${prefix} || '%'
            AND "deletedAt" IS NULL`;
        const siblings = await tx.documentRow.findMany({
          where: { documentId: document.id, parentId: row.parentId, deletedAt: null },
          orderBy: { rank: "asc" },
          select: { id: true, rank: true },
        });
        const childIds = new Set(children.map((child) => child.id));
        const ordered = siblings.filter((sibling) => !childIds.has(sibling.id));
        const deletedIndex = ordered.findIndex((sibling) => sibling.rank > row.rank);
        ordered.splice(deletedIndex < 0 ? ordered.length : deletedIndex, 0, ...children.map((child) => ({ ...child, rank: "" })));
        let previousRank: string | null = null;
        for (const sibling of ordered) {
          const rank = rankBetween(previousRank, null);
          await tx.documentRow.update({ where: { id: sibling.id }, data: { rank, version: { increment: 1 }, updatedById: actorId } });
          previousRank = rank;
        }
      } else {
        await tx.documentRow.updateMany({
          where: { id: { in: affected.map((entry) => entry.id) } },
          data: { deletedAt, deletedById: actorId, deletionReason: reason ?? null },
        });
      }
      const deletedIds = childStrategy === "delete_subtree" ? affected.map((entry) => entry.id) : [row.id];
      await tx.requirementLink.updateMany({
        where: {
          deletedAt: null,
          OR: [{ sourceRowId: { in: deletedIds } }, { targetRowId: { in: deletedIds } }],
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
        metadata: { reason: reason ?? null, childStrategy },
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
      documentId: document.id,
    });
    const deletedAt = row.deletedAt;
    await this.prisma.$transaction(async (tx) => {
      if (row.parentId) {
        const parent = await tx.documentRow.findFirst({ where: { id: row.parentId, deletedAt: null } });
        if (!parent) throw new UnprocessableEntityException("Parent row is deleted; restore the parent first");
      }
      const prefix = `${row.ancestorPath}${row.id}/`;
      const restoredRows = await tx.documentRow.findMany({
        where: {
          documentId: document.id,
          deletedAt,
          OR: [{ id: row.id }, { ancestorPath: { startsWith: prefix } }],
        },
        select: { id: true },
      });
      await tx.documentRow.updateMany({
        where: {
          documentId: document.id,
          deletedAt,
          OR: [{ id: row.id }, { ancestorPath: { startsWith: prefix } }],
        },
        data: { deletedAt: null, deletedById: null, deletionReason: null },
      });
      await tx.requirementLink.updateMany({
        where: {
          deletedAt,
          OR: [
            { sourceRowId: { in: restoredRows.map((entry) => entry.id) } },
            { targetRowId: { in: restoredRows.map((entry) => entry.id) } },
          ],
        },
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
      documentId,
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
      const counter = await tx.document.update({
        where: { id: document.id },
        data: { nextObjectNumber: { increment: sourceRows.length } },
        select: { nextObjectNumber: true },
      });
      let objectNumber = counter.nextObjectNumber - sourceRows.length;
      const nextRequirementNo = await this.requirementNumberGenerator(tx, documentId, document.requirementPrefix);
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
            objectNumber,
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
        objectNumber += 1;
        idMap.set(source.id, { id: created.id, ancestorPath: created.ancestorPath, depth: created.depth });
        if (isRoot) afterRowId = created.id;
        if (source.rowType === "requirement") {
          await tx.requirementDetail.create({
            data: {
              rowId: created.id,
              requirementNo: nextRequirementNo(),
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

  async applyTemplateSnapshot(actorId: string, documentId: string, parentId: string | null, snapshot: TemplateRowSnapshot[]) {
    if (snapshot.length === 0 || snapshot.length > 2000) throw new UnprocessableEntityException("Template must contain between 1 and 2000 rows");
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId,
    });
    for (const source of snapshot) this.assertRowTypeAllowed(document.documentType, source.rowType);
    const keys = new Set(snapshot.map((source) => source.key));
    if (keys.size !== snapshot.length || snapshot.some((source) => source.parentKey && !keys.has(source.parentKey))) {
      throw new UnprocessableEntityException("Template hierarchy is invalid");
    }
    const targetParent = parentId
      ? await this.prisma.documentRow.findFirst({ where: { id: parentId, documentId, deletedAt: null } })
      : null;
    if (parentId && !targetParent) throw new NotFoundException("Target parent not found");
    for (const source of snapshot.filter((candidate) => !candidate.parentKey)) {
      if (targetParent) this.assertParentAllowed(source.rowType, targetParent.rowType);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const definitions = await this.fieldDefinitions(tx, documentId);
      const allowedFieldKeys = new Set(definitions.map((definition) => definition.fieldKey));
      const idMap = new Map<string, { id: string; ancestorPath: string; depth: number }>();
      const lastSibling = new Map<string, string>();
      const counter = await tx.document.update({
        where: { id: document.id },
        data: { nextObjectNumber: { increment: snapshot.length } },
        select: { nextObjectNumber: true },
      });
      let objectNumber = counter.nextObjectNumber - snapshot.length;
      const nextRequirementNo = await this.requirementNumberGenerator(tx, documentId, document.requirementPrefix);
      const rootIds: string[] = [];
      for (const source of snapshot) {
        const mappedParent = source.parentKey ? idMap.get(source.parentKey) : undefined;
        if (source.parentKey && !mappedParent) throw new UnprocessableEntityException("Template rows are not ordered by hierarchy");
        const destinationParent = mappedParent ?? (source.parentKey ? undefined : targetParent ?? undefined);
        const destinationParentId = destinationParent?.id ?? null;
        const siblingKey = destinationParentId ?? "root";
        const rank = await this.computeInsertRank(tx, documentId, destinationParentId, lastSibling.get(siblingKey));
        const filteredFields = Object.fromEntries(Object.entries(source.customFields ?? {}).filter(([key]) => allowedFieldKeys.has(key)));
        const customFields = validateCustomFields(definitions, filteredFields);
        const created = await tx.documentRow.create({
          data: {
            organizationId: document.organizationId,
            documentId,
            objectNumber,
            parentId: destinationParentId,
            rank,
            ancestorPath: destinationParent ? `${destinationParent.ancestorPath}${destinationParent.id}/` : "",
            depth: destinationParent ? destinationParent.depth + 1 : 0,
            rowType: source.rowType,
            title: source.title,
            description: source.description,
            numberingStart: source.numberingStart,
            customFields: customFields as Prisma.InputJsonValue,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        objectNumber += 1;
        idMap.set(source.key, { id: created.id, ancestorPath: created.ancestorPath, depth: created.depth });
        lastSibling.set(siblingKey, created.id);
        if (!source.parentKey) rootIds.push(created.id);
        if (source.rowType === "requirement") {
          await tx.requirementDetail.create({
            data: {
              rowId: created.id,
              requirementNo: nextRequirementNo(),
              status: source.requirementDetail?.status,
              priority: source.requirementDetail?.priority,
              rationale: source.requirementDetail?.rationale,
              verificationMethod: source.requirementDetail?.verificationMethod,
            },
          });
        } else if (source.rowType === "test_case") {
          await tx.testCaseDetail.create({ data: { rowId: created.id, status: "draft", priority: source.testCaseDetail?.priority, tags: source.testCaseDetail?.tags } });
        } else if (source.rowType === "test_step") {
          await tx.testStepDetail.create({
            data: {
              rowId: created.id,
              stepNumber: source.testStepDetail?.stepNumber,
              action: source.testStepDetail?.action,
              expectedResult: source.testStepDetail?.expectedResult,
              testResult: null,
            },
          });
        }
      }
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "document_template.applied",
        entityType: "document",
        entityId: document.id,
        documentId,
        metadata: { parentId, rowsCreated: snapshot.length, rootIds },
      });
      return { rowsCreated: snapshot.length, rootIds };
    });
    for (const rootId of result.rootIds) {
      await this.events.publish({ type: "row.created", documentId, organizationId: document.organizationId, entityId: rootId, actorId });
    }
    return result;
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
      documentId: sourceDoc.id,
    });
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: targetDoc.organizationId,
      workspaceId: targetDoc.workspaceId,
      documentId: targetDoc.id,
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
      documentId: sourceDoc.id,
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
      documentId: sourceDoc.id,
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
      documentId,
    });
    const links = await this.prisma.requirementLink.findMany({
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
    const readable = await this.access.readableRowIds(actorId, links.flatMap((link) => [link.sourceRow.id, link.targetRow.id]));
    return links.filter((link) => readable.has(link.sourceRow.id) && readable.has(link.targetRow.id));
  }

  async coverage(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId,
    });
    const rows = await this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      select: {
        id: true,
        parentId: true,
        objectNumber: true,
        rowType: true,
        title: true,
        description: true,
        customFields: true,
        requirementDetail: { select: { requirementNo: true } },
        document: { select: { id: true, title: true, documentType: true } },
      },
    });
    const rowIds = rows.map((row) => row.id);
    const rawLinks = rowIds.length === 0 ? [] : await this.prisma.requirementLink.findMany({
      where: {
        deletedAt: null,
        linkType: "verifies",
        OR: [{ sourceRowId: { in: rowIds } }, { targetRowId: { in: rowIds } }],
      },
      select: {
        suspect: true,
        sourceRow: { select: { id: true, rowType: true } },
        targetRow: { select: { id: true, rowType: true } },
      },
    });
    const readableLinked = await this.access.readableRowIds(actorId, rawLinks.flatMap((link) => [link.sourceRow.id, link.targetRow.id]));
    const links = rawLinks.filter((link) => readableLinked.has(link.sourceRow.id) && readableLinked.has(link.targetRow.id));
    if (document.documentType === "test") {
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const scenarios = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        if (row.rowType !== "test_case" && row.rowType !== "test_step") continue;
        const scenario = resolveTestScenario(row.id, rowsById);
        if (scenario) scenarios.set(scenario.id, rowsById.get(scenario.id) ?? row);
      }
      const linkedScenarioIds = new Set<string>();
      const suspectScenarioIds = new Set<string>();
      for (const link of links) {
        const testRow = [link.sourceRow, link.targetRow].find((row) => row.rowType === "test_case" || row.rowType === "test_step");
        const requirementRow = [link.sourceRow, link.targetRow].find((row) => row.rowType === "requirement");
        if (!testRow || !requirementRow || !rowsById.has(testRow.id)) continue;
        const scenario = resolveTestScenario(testRow.id, rowsById);
        if (!scenario) continue;
        linkedScenarioIds.add(scenario.id);
        if (link.suspect) suspectScenarioIds.add(scenario.id);
      }
      const uncoveredRows = [...scenarios.values()].filter((row) => !linkedScenarioIds.has(row.id));
      return {
        mode: "test",
        totalItems: scenarios.size,
        totalRequirements: scenarios.size,
        covered: linkedScenarioIds.size,
        uncovered: uncoveredRows.length,
        suspect: suspectScenarioIds.size,
        uncoveredRows: uncoveredRows.map((row) => ({ id: row.id, objectNumber: row.objectNumber, title: row.title })),
      };
    }
    const requirements = rows.filter((row) => row.rowType === "requirement");
    const requirementIds = new Set(requirements.map((row) => row.id));
    const linkedRequirementIds = new Set<string>();
    const suspectRequirementIds = new Set<string>();
    for (const link of links) {
      const testRow = [link.sourceRow, link.targetRow].find((row) => row.rowType === "test_case" || row.rowType === "test_step");
      const requirementRow = [link.sourceRow, link.targetRow].find((row) => row.rowType === "requirement");
      if (!testRow || !requirementRow || !requirementIds.has(requirementRow.id)) continue;
      linkedRequirementIds.add(requirementRow.id);
      if (link.suspect) suspectRequirementIds.add(requirementRow.id);
    }
    const uncoveredRows = requirements.filter((row) => !linkedRequirementIds.has(row.id));
    return {
      mode: "requirement",
      totalItems: requirements.length,
      totalRequirements: requirements.length,
      covered: linkedRequirementIds.size,
      uncovered: uncoveredRows.length,
      suspect: suspectRequirementIds.size,
      uncoveredRows: uncoveredRows.map((row) => ({ id: row.id, objectNumber: row.objectNumber, title: row.title })),
    };
  }

  async traceabilityMatrix(actorId: string, documentId: string, direction: "requirement_to_test" | "test_to_requirement" = "requirement_to_test") {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId,
    });
    const currentRows = await this.prisma.documentRow.findMany({
      where: { documentId, deletedAt: null },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      select: {
        id: true,
        parentId: true,
        objectNumber: true,
        rowType: true,
        title: true,
        description: true,
        customFields: true,
        requirementDetail: { select: { requirementNo: true } },
        document: { select: { id: true, title: true, documentType: true } },
      },
    });
    const currentRowIds = currentRows.map((row) => row.id);
    const rawLinks = currentRowIds.length === 0 ? [] : await this.prisma.requirementLink.findMany({
      where: {
        deletedAt: null,
        OR: [{ sourceRowId: { in: currentRowIds } }, { targetRowId: { in: currentRowIds } }],
      },
      select: {
        id: true,
        suspect: true,
        linkType: true,
        sourceRow: {
          select: { id: true, rowType: true, documentId: true, document: { select: { id: true, title: true, documentType: true } } },
        },
        targetRow: {
          select: { id: true, rowType: true, documentId: true, document: { select: { id: true, title: true, documentType: true } } },
        },
      },
    });
    const readableLinked = await this.access.readableRowIds(actorId, rawLinks.flatMap((link) => [link.sourceRow.id, link.targetRow.id]));
    const links = rawLinks.filter((link) => readableLinked.has(link.sourceRow.id) && readableLinked.has(link.targetRow.id));
    const testDocumentIds = [...new Set([
      ...(document.documentType === "test" ? [document.id] : []),
      ...links.flatMap((link) => [link.sourceRow, link.targetRow])
        .filter((row) => row.rowType === "test_case" || row.rowType === "test_step")
        .map((row) => row.documentId),
    ])];
    const hierarchyRows = testDocumentIds.length === 0 ? [] : await this.prisma.documentRow.findMany({
      where: { documentId: { in: testDocumentIds }, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        objectNumber: true,
        rowType: true,
        title: true,
        customFields: true,
        document: { select: { id: true, title: true, documentType: true } },
      },
    });
    const testRowsById = new Map(hierarchyRows.map((row) => [row.id, row]));
    const requirementRows = document.documentType === "requirement"
      ? currentRows.filter((row) => row.rowType === "requirement")
      : await this.prisma.documentRow.findMany({
        where: {
          deletedAt: null,
          rowType: "requirement",
          id: { in: links.flatMap((link) => [link.sourceRow, link.targetRow]).filter((row) => row.rowType === "requirement").map((row) => row.id) },
        },
        orderBy: [{ depth: "asc" }, { rank: "asc" }],
        select: {
          id: true,
          parentId: true,
          objectNumber: true,
          rowType: true,
          title: true,
          description: true,
          customFields: true,
          requirementDetail: { select: { requirementNo: true } },
          document: { select: { id: true, title: true, documentType: true } },
        },
      });
    if (direction === "test_to_requirement") {
      const requirementsById = new Map(requirementRows.map((row) => [row.id, row]));
      const scenarios = new Map<string, typeof hierarchyRows[number]>();
      for (const row of hierarchyRows) {
        if (row.rowType !== "test_case" && row.rowType !== "test_step") continue;
        const scenario = resolveTestScenario(row.id, testRowsById);
        if (scenario) scenarios.set(scenario.id, testRowsById.get(scenario.id) ?? row);
      }
      return [...scenarios.values()]
        .sort((a, b) => a.document.title.localeCompare(b.document.title) || (a.objectNumber ?? 0) - (b.objectNumber ?? 0))
        .map((scenario) => {
          const normalized = new Map<string, {
            linkId: string;
            suspect: boolean;
            linkType: string;
            requirementId: string;
            requirementNo: string | null;
            requirementTitle: string;
            requirementDescription: string | null;
            requirementDocument: { id: string; title: string; documentType: string };
          }>();
          for (const link of links) {
            const testRow = [link.sourceRow, link.targetRow].find((row) => row.rowType === "test_case" || row.rowType === "test_step");
            const requirementRef = [link.sourceRow, link.targetRow].find((row) => row.rowType === "requirement");
            if (!testRow || !requirementRef || resolveTestScenario(testRow.id, testRowsById)?.id !== scenario.id) continue;
            const requirement = requirementsById.get(requirementRef.id);
            if (!requirement) continue;
            const existing = normalized.get(requirement.id);
            normalized.set(requirement.id, {
              linkId: existing?.linkId ?? link.id,
              suspect: Boolean(existing?.suspect || link.suspect),
              linkType: link.linkType,
              requirementId: requirement.id,
              requirementNo: requirement.requirementDetail?.requirementNo ?? null,
              requirementTitle: requirement.title,
              requirementDescription: requirement.description,
              requirementDocument: requirement.document,
            });
          }
          return {
            id: scenario.id,
            objectNumber: scenario.objectNumber,
            title: scenario.title,
            document: scenario.document,
            requirements: [...normalized.values()].sort((a, b) => (a.requirementNo ?? a.requirementTitle).localeCompare(b.requirementNo ?? b.requirementTitle, undefined, { numeric: true })),
          };
        });
    }
    return requirementRows.map((requirement) => {
      const related = links.filter((link) => link.sourceRow.id === requirement.id || link.targetRow.id === requirement.id);
      const normalized = new Map<string, {
        linkId: string;
        suspect: boolean;
        linkType: string;
        sourceId: string;
        sourceScenarioId: string;
        sourceObjectNumber: number | null;
        sourceTitle: string;
        sourceType: string;
        sourceDocument: { id: string; title: string; documentType: string };
      }>();
      for (const link of related) {
        const testRow = [link.sourceRow, link.targetRow].find((row) => row.rowType === "test_case" || row.rowType === "test_step");
        if (!testRow) continue;
        const scenario = resolveTestScenario(testRow.id, testRowsById);
        if (!scenario) continue;
        const existing = normalized.get(scenario.id);
        normalized.set(scenario.id, {
          linkId: existing?.linkId ?? link.id,
          suspect: Boolean(existing?.suspect || link.suspect),
          linkType: link.linkType,
          sourceId: testRow.id,
          sourceScenarioId: scenario.id,
          sourceObjectNumber: testRowsById.get(scenario.id)?.objectNumber ?? null,
          sourceTitle: scenario.title,
          sourceType: scenario.rowType,
          sourceDocument: testRow.document,
        });
      }
      return {
        id: requirement.id,
        objectNumber: requirement.objectNumber,
        requirementNo: requirement.requirementDetail?.requirementNo ?? null,
        title: requirement.title,
        links: [...normalized.values()],
      };
    });
  }

  async assignProject(actorId: string, rowId: string, projectId: string) {
    const row = await this.requireRow(rowId);
    const document = await this.requireDocument(row.documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
      documentId: document.id,
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
      documentId: document.id,
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
      documentId,
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
      documentId,
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

  private async requirementNumberGenerator(tx: Prisma.TransactionClient, documentId: string, prefix: string) {
    const existingNumbers = new Set((await tx.requirementDetail.findMany({
      where: { row: { documentId } },
      select: { requirementNo: true },
    })).flatMap((detail) => detail.requirementNo ? [detail.requirementNo.toUpperCase()] : []));
    let sequence = 1;
    return () => {
      let value = `${prefix}-${String(sequence).padStart(3, "0")}`;
      while (existingNumbers.has(value)) {
        sequence += 1;
        value = `${prefix}-${String(sequence).padStart(3, "0")}`;
      }
      existingNumbers.add(value);
      sequence += 1;
      return value;
    };
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
        ? parentType === "test_case" || parentType === "heading"
        : rowType === "heading"
          ? parentType === "heading" || parentType === "test_case"
          : rowType === "requirement"
            ? parentType === "heading" || parentType === "requirement"
            : rowType === "test_case"
              ? parentType === "heading"
            : true;
    if (!valid) throw new UnprocessableEntityException("Row type is not allowed under this parent");
  }

  private numberRows<T extends { id: string; parentId: string | null; rank: string; numberingStart: number | null }>(rows: T[]) {
    const childrenByParent = new Map<string | null, T[]>();
    for (const row of rows) {
      const list = childrenByParent.get(row.parentId) ?? [];
      list.push(row);
      childrenByParent.set(row.parentId, list);
    }
    const result: Array<T & { displayNumber: string }> = [];
    const visit = (parentId: string | null, prefix: string) => {
      const children = (childrenByParent.get(parentId) ?? []).sort((a, b) => (a.rank < b.rank ? -1 : 1));
      let nextSegment = 1;
      children.forEach((child) => {
        const segment = child.numberingStart ?? nextSegment;
        const displayNumber = prefix === "" ? `${segment}` : `${prefix}.${segment}`;
        nextSegment = segment + 1;
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
