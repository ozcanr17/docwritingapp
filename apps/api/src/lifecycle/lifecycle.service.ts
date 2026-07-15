import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import {
  ChangeProposalStatus,
  ConfigurationKind,
  ExecutionStatus,
  IntegrationType,
  Prisma,
  ReviewDecisionType,
  RowAccessLevel,
  SavedViewScope,
} from "@docsys/database";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RowsService, UpdateRowInput } from "../rows/rows.service";
import { StorageService } from "../storage/storage.service";
import { randomUUID } from "crypto";

interface SavedViewInput {
  name: string;
  scope: SavedViewScope;
  filters: Record<string, unknown>[];
  sorting: Record<string, unknown>[];
  visibleColumns: string[];
  frozenColumns: string[];
  linkProjection: Record<string, unknown>;
  isDefault: boolean;
}

interface ExecutionInput {
  environment?: string;
  buildReference?: string;
  iteration?: string;
  notes?: string;
}

interface ReviewInput {
  title: string;
  description?: string;
  reviewerIds: string[];
  dueAt?: string;
  activate: boolean;
}

interface ProposalInput {
  title: string;
  reason?: string;
  proposedPatch: Record<string, unknown>;
  submit: boolean;
}

interface ConfigurationInput {
  name: string;
  kind: ConfigurationKind;
  documentId?: string | null;
  parentId?: string | null;
  description?: string;
  rules: Record<string, unknown>;
}

@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly rows: RowsService,
    private readonly storage: StorageService,
  ) {}

  async listViews(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    return this.prisma.savedView.findMany({
      where: { documentId, deletedAt: null, OR: [{ ownerId: actorId }, { scope: "team" }] },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async createView(actorId: string, documentId: string, input: SavedViewInput) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, input.scope === "team" ? "document.write" : "document.read");
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.savedView.updateMany({ where: { documentId, ownerId: actorId }, data: { isDefault: false } });
      const view = await tx.savedView.create({
        data: {
          organizationId: document.organizationId,
          documentId,
          ownerId: actorId,
          name: input.name,
          scope: input.scope,
          filters: input.filters as Prisma.InputJsonValue,
          sorting: input.sorting as Prisma.InputJsonValue,
          visibleColumns: input.visibleColumns,
          frozenColumns: input.frozenColumns,
          linkProjection: input.linkProjection as Prisma.InputJsonValue,
          isDefault: input.isDefault,
        },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "saved_view.created",
        entityType: "saved_view",
        entityId: view.id,
        documentId,
        nextData: { name: input.name, scope: input.scope },
      });
      return view;
    });
  }

  async deleteView(actorId: string, viewId: string) {
    const view = await this.prisma.savedView.findFirst({ where: { id: viewId, deletedAt: null }, include: { document: true } });
    if (!view) throw new NotFoundException("Saved view not found");
    if (view.ownerId !== actorId) throw new ForbiddenException("Only the view owner can delete it");
    await this.prisma.savedView.update({ where: { id: viewId }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  async search(actorId: string, workspaceId: string, query: string, limit: number) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    await this.access.assertPermission(actorId, "row.read", { organizationId: workspace.organizationId, workspaceId });
    const normalized = query.trim().toLocaleLowerCase("en");
    if (normalized.length < 2) return [];
    const candidates = await this.prisma.documentRow.findMany({
      where: { document: { workspaceId, deletedAt: null }, deletedAt: null },
      take: 2000,
      orderBy: { updatedAt: "desc" },
      include: {
        document: { select: { id: true, title: true, documentType: true } },
        requirementDetail: { select: { requirementNo: true } },
        outgoingLinks: {
          where: { deletedAt: null },
          select: { targetRow: { select: { title: true, description: true } } },
        },
        incomingLinks: {
          where: { deletedAt: null },
          select: { sourceRow: { select: { title: true, description: true } } },
        },
      },
    });
    const readable = await this.access.readableRowIds(actorId, candidates.map((row) => row.id));
    return candidates
      .filter((row) => readable.has(row.id))
      .map((row) => {
        const linkedText = [
          ...row.outgoingLinks.map((link) => `${link.targetRow.title} ${link.targetRow.description ?? ""}`),
          ...row.incomingLinks.map((link) => `${link.sourceRow.title} ${link.sourceRow.description ?? ""}`),
        ].join(" ");
        const searchable = [
          row.title,
          row.description ?? "",
          row.requirementDetail?.requirementNo ?? "",
          JSON.stringify(row.customFields),
          row.document.title,
          linkedText,
        ].join(" ").toLocaleLowerCase("en");
        return searchable.includes(normalized)
          ? {
              id: row.id,
              rowType: row.rowType,
              title: row.title,
              description: row.description,
              requirementNo: row.requirementDetail?.requirementNo ?? null,
              document: row.document,
              updatedAt: row.updatedAt,
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .slice(0, limit);
  }

  async quality(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    const requirements = await this.prisma.documentRow.findMany({
      where: { documentId, rowType: "requirement", deletedAt: null },
      include: {
        requirementDetail: true,
        outgoingLinks: { where: { deletedAt: null }, select: { targetRow: { select: { rowType: true } } } },
        incomingLinks: { where: { deletedAt: null }, select: { sourceRow: { select: { rowType: true } } } },
      },
    });
    const counts = new Map<string, number>();
    for (const row of requirements) {
      const key = row.requirementDetail?.requirementNo?.trim().toLocaleLowerCase("en");
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const issues = requirements.flatMap((row) => {
      const rowIssues: { rule: string; severity: "error" | "warning"; rowId: string; title: string }[] = [];
      const requirementNo = row.requirementDetail?.requirementNo?.trim();
      if (!requirementNo) rowIssues.push({ rule: "missing_number", severity: "error", rowId: row.id, title: row.title });
      if (requirementNo && (counts.get(requirementNo.toLocaleLowerCase("en")) ?? 0) > 1) {
        rowIssues.push({ rule: "duplicate_number", severity: "error", rowId: row.id, title: row.title });
      }
      if (!row.title.trim()) rowIssues.push({ rule: "empty_description", severity: "error", rowId: row.id, title: row.title });
      const linkedTypes = [
        ...row.outgoingLinks.map((link) => link.targetRow.rowType),
        ...row.incomingLinks.map((link) => link.sourceRow.rowType),
      ];
      if (!linkedTypes.some((type) => type === "test_case" || type === "test_step")) {
        rowIssues.push({ rule: "untested_requirement", severity: "warning", rowId: row.id, title: row.title });
      }
      return rowIssues;
    });
    return {
      totalRequirements: requirements.length,
      score: requirements.length === 0 ? 100 : Math.max(0, Math.round(100 - (issues.length / requirements.length) * 25)),
      issues,
      summary: {
        missingNumber: issues.filter((issue) => issue.rule === "missing_number").length,
        duplicateNumber: issues.filter((issue) => issue.rule === "duplicate_number").length,
        emptyDescription: issues.filter((issue) => issue.rule === "empty_description").length,
        untestedRequirement: issues.filter((issue) => issue.rule === "untested_requirement").length,
      },
    };
  }

  async dashboard(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    const [quality, suspectLinks, rows, latestExecutions] = await Promise.all([
      this.quality(actorId, documentId),
      this.prisma.requirementLink.count({
        where: {
          suspect: true,
          deletedAt: null,
          OR: [{ sourceRow: { documentId } }, { targetRow: { documentId } }],
        },
      }),
      this.prisma.documentRow.findMany({
        where: { documentId, deletedAt: null },
        select: { id: true, rowType: true, testStepDetail: { select: { action: true, expectedResult: true } } },
      }),
      this.prisma.testExecution.findMany({
        where: { testCaseRow: { documentId } },
        orderBy: { createdAt: "desc" },
        distinct: ["testCaseRowId"],
        select: { testCaseRowId: true, status: true },
      }),
    ]);
    const requirements = rows.filter((row) => row.rowType === "requirement").length;
    const incompleteTests = rows.filter(
      (row) => row.rowType === "test_step" && (!row.testStepDetail?.action?.trim() || !row.testStepDetail.expectedResult?.trim()),
    ).length;
    return {
      qualityScore: quality.score,
      qualityIssues: quality.issues.length,
      requirements,
      coveredRequirements: requirements - quality.summary.untestedRequirement,
      suspectLinks,
      incompleteTests,
      executions: {
        total: latestExecutions.length,
        passed: latestExecutions.filter((execution) => execution.status === "passed").length,
        failed: latestExecutions.filter((execution) => execution.status === "failed").length,
        blocked: latestExecutions.filter((execution) => execution.status === "blocked").length,
      },
    };
  }

  async assistantSuggestions(actorId: string, documentId: string) {
    const quality = await this.quality(actorId, documentId);
    const guidance: Record<string, string> = {
      missing_number: "Assign a stable, unique requirement number.",
      duplicate_number: "Rename one requirement number and repair incoming references.",
      empty_description: "Write a measurable statement with actor, behavior and acceptance condition.",
      untested_requirement: "Create or link a test case and define observable expected results.",
    };
    return quality.issues.map((issue) => ({ ...issue, recommendation: guidance[issue.rule] ?? "Review this artifact." }));
  }

  async listComments(actorId: string, rowId: string) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    return this.prisma.rowComment.findMany({
      where: { rowId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, displayName: true, email: true } } },
    });
  }

  async addComment(actorId: string, rowId: string, body: string, mentionUserIds: string[]) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    const mentionedEmails = [...body.matchAll(/@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map((match) => match[1]!.toLowerCase());
    const mentionedUsers = mentionedEmails.length === 0
      ? []
      : await this.prisma.user.findMany({
          where: {
            email: { in: mentionedEmails, mode: "insensitive" },
            organizationMemberships: { some: { organizationId: context.document.organizationId, deletedAt: null } },
          },
          select: { id: true },
        });
    const allMentionIds = [...new Set([...mentionUserIds, ...mentionedUsers.map((user) => user.id)])];
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.rowComment.create({
        data: {
          organizationId: context.document.organizationId,
          rowId,
          authorId: actorId,
          body,
          mentions: allMentionIds,
        },
        include: { author: { select: { id: true, displayName: true, email: true } } },
      });
      const recipients = allMentionIds.filter((id) => id !== actorId);
      if (recipients.length > 0) {
        await tx.notification.createMany({
          data: recipients.map((recipientId) => ({
            organizationId: context.document.organizationId,
            recipientId,
            type: "mention" as const,
            payload: { rowId, documentId: context.document.id, commentId: comment.id, body } as Prisma.InputJsonValue,
          })),
        });
      }
      await this.audit.record(tx, {
        organizationId: context.document.organizationId,
        workspaceId: context.document.workspaceId,
        actorId,
        action: "row.comment.created",
        entityType: "row_comment",
        entityId: comment.id,
        documentId: context.document.id,
        nextData: { rowId, mentions: recipients },
      });
      return comment;
    });
  }

  async resolveComment(actorId: string, commentId: string) {
    const comment = await this.prisma.rowComment.findFirst({
      where: { id: commentId, deletedAt: null },
      include: { row: { include: { document: true } } },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    await this.assertDocument(actorId, comment.row.document, "row.write");
    return this.prisma.rowComment.update({ where: { id: commentId }, data: { resolvedAt: new Date() } });
  }

  async listAttachments(actorId: string, rowId: string) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    const attachments = await this.prisma.attachment.findMany({ where: { rowId, deletedAt: null }, orderBy: { createdAt: "desc" } });
    return attachments.map((attachment) => ({ ...attachment, sizeBytes: Number(attachment.sizeBytes) }));
  }

  async createAttachment(
    actorId: string,
    rowId: string,
    input: { fileName: string; contentType: string; sizeBytes: number; checksum?: string },
  ) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.write");
    const fileName = [...input.fileName]
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("")
      .replace(/[/\\]/g, "-")
      .trim()
      .slice(0, 255);
    if (!fileName || fileName === "." || fileName === "..") throw new BadRequestException("Invalid file name");
    const storageKey = `attachments/${context.document.organizationId}/${rowId}/${randomUUID()}`;
    const attachment = await this.prisma.attachment.create({
      data: {
        organizationId: context.document.organizationId,
        documentId: context.document.id,
        rowId,
        fileName,
        contentType: input.contentType,
        sizeBytes: BigInt(input.sizeBytes),
        storageKey,
        checksum: input.checksum,
        uploadedById: actorId,
      },
    });
    return {
      id: attachment.id,
      uploadUrl: await this.storage.presignedUploadUrl(storageKey),
      storageKey,
    };
  }

  async completeAttachment(actorId: string, attachmentId: string) {
    const attachment = await this.requireAttachment(actorId, attachmentId, "document.write");
    await this.assertAttachmentObject(attachment.storageKey, Number(attachment.sizeBytes), attachment.contentType, attachment.checksum);
    return { ok: true };
  }

  async downloadAttachment(actorId: string, attachmentId: string) {
    const attachment = await this.requireAttachment(actorId, attachmentId, "document.read");
    await this.assertAttachmentObject(attachment.storageKey, Number(attachment.sizeBytes), attachment.contentType, attachment.checksum);
    return { url: await this.storage.presignedDownloadUrl(attachment.storageKey, attachment.fileName) };
  }

  private async requireAttachment(actorId: string, attachmentId: string, permission: "document.read" | "document.write") {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      include: { row: { include: { document: true } }, document: true },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    const document = attachment.row?.document ?? attachment.document;
    if (!document) throw new NotFoundException("Attachment document not found");
    await this.assertDocument(actorId, document, permission);
    return attachment;
  }

  private async assertAttachmentObject(storageKey: string, expectedSize: number, expectedContentType: string, checksum: string | null): Promise<void> {
    let stat: Awaited<ReturnType<StorageService["statObject"]>>;
    try {
      stat = await this.storage.statObject(storageKey);
    } catch {
      throw new UnprocessableEntityException("Attachment upload is incomplete");
    }
    const actualType = String(stat.metaData?.["content-type"] ?? "application/octet-stream").toLowerCase();
    if (stat.size !== expectedSize || actualType !== expectedContentType.toLowerCase()) {
      await this.storage.removeObject(storageKey).catch(() => undefined);
      throw new UnprocessableEntityException("Uploaded attachment does not match its declaration");
    }
    if (checksum && await this.storage.sha256Object(storageKey) !== checksum.toLowerCase()) {
      await this.storage.removeObject(storageKey).catch(() => undefined);
      throw new UnprocessableEntityException("Uploaded attachment checksum does not match");
    }
  }

  async deleteAttachment(actorId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      include: { row: { include: { document: true } }, document: true },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    const document = attachment.row?.document ?? attachment.document;
    if (!document) throw new NotFoundException("Attachment document not found");
    await this.assertDocument(actorId, document, "document.write");
    await this.prisma.attachment.update({ where: { id: attachmentId }, data: { deletedAt: new Date(), deletedById: actorId } });
    await this.storage.removeObject(attachment.storageKey).catch(() => undefined);
    return { ok: true };
  }

  notifications(actorId: string) {
    return this.prisma.notification.findMany({
      where: { recipientId: actorId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async readNotification(actorId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId: actorId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Notification not found");
    return { ok: true };
  }

  async listExecutions(actorId: string, testCaseRowId: string) {
    const context = await this.requireRowContext(testCaseRowId);
    await this.assertDocument(actorId, context.document, "row.read");
    return this.prisma.testExecution.findMany({
      where: { testCaseRowId },
      orderBy: { createdAt: "desc" },
      include: {
        executedBy: { select: { id: true, displayName: true } },
        steps: { include: { testStepRow: { select: { id: true, title: true, testStepDetail: true } } } },
      },
    });
  }

  async listDocumentExecutions(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "row.read");
    return this.prisma.testExecution.findMany({
      where: { testCaseRow: { documentId, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      include: {
        testCaseRow: { select: { id: true, title: true, objectNumber: true } },
        executedBy: { select: { id: true, displayName: true } },
        steps: { include: { testStepRow: { select: { id: true, title: true, testStepDetail: true } } } },
      },
    });
  }

  async createExecution(actorId: string, testCaseRowId: string, input: ExecutionInput) {
    const context = await this.requireRowContext(testCaseRowId);
    await this.assertDocument(actorId, context.document, "row.write");
    if (context.document.documentType !== "test" || (context.row.rowType !== "heading" && context.row.rowType !== "test_case")) {
      throw new UnprocessableEntityException("Executions can only be created for test headings");
    }
    const steps = await this.prisma.documentRow.findMany({
      where: {
        documentId: context.document.id,
        rowType: "test_step",
        deletedAt: null,
        OR: [{ parentId: testCaseRowId }, { ancestorPath: { startsWith: `${context.row.ancestorPath}${testCaseRowId}/` } }],
      },
      orderBy: { rank: "asc" },
    });
    if (steps.length === 0) throw new UnprocessableEntityException("The test heading does not contain test steps");
    return this.prisma.$transaction(async (tx) => {
      const execution = await tx.testExecution.create({
        data: {
          organizationId: context.document.organizationId,
          testCaseRowId,
          executedById: actorId,
          status: "running",
          environment: input.environment,
          buildReference: input.buildReference,
          iteration: input.iteration,
          notes: input.notes,
          startedAt: new Date(),
          steps: { create: steps.map((step) => ({ testStepRowId: step.id })) },
        },
        include: { steps: { include: { testStepRow: { select: { id: true, title: true, testStepDetail: true } } } } },
      });
      await this.audit.record(tx, {
        organizationId: context.document.organizationId,
        workspaceId: context.document.workspaceId,
        actorId,
        action: "test_execution.created",
        entityType: "test_execution",
        entityId: execution.id,
        documentId: context.document.id,
        nextData: { testCaseRowId, stepCount: steps.length },
      });
      return execution;
    });
  }

  async updateExecutionStep(
    actorId: string,
    executionId: string,
    stepRowId: string,
    input: { status: ExecutionStatus; actualResult?: string | null },
  ) {
    const execution = await this.requireExecution(executionId);
    await this.assertDocument(actorId, execution.testCaseRow.document, "row.write");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.testStepExecution.update({
        where: { executionId_testStepRowId: { executionId, testStepRowId: stepRowId } },
        data: { status: input.status, actualResult: input.actualResult, executedAt: new Date() },
      });
      await tx.testStepDetail.update({ where: { rowId: stepRowId }, data: { testResult: input.status } });
      await this.audit.record(tx, {
        organizationId: execution.testCaseRow.document.organizationId,
        workspaceId: execution.testCaseRow.document.workspaceId,
        actorId,
        action: "test_step.status_updated",
        entityType: "document_row",
        entityId: stepRowId,
        documentId: execution.testCaseRow.document.id,
        nextData: { executionId, status: input.status },
      });
      return updated;
    });
  }

  async updateTestStepStatus(actorId: string, stepRowId: string, status: ExecutionStatus) {
    const context = await this.requireRowContext(stepRowId);
    await this.assertDocument(actorId, context.document, "row.write");
    if (context.row.rowType !== "test_step") throw new UnprocessableEntityException("Only test steps have execution status");
    return this.prisma.$transaction(async (tx) => {
      const detail = await tx.testStepDetail.update({ where: { rowId: stepRowId }, data: { testResult: status } });
      await tx.testStepExecution.updateMany({
        where: { testStepRowId: stepRowId, execution: { status: "running" } },
        data: { status, executedAt: new Date() },
      });
      await this.audit.record(tx, {
        organizationId: context.document.organizationId,
        workspaceId: context.document.workspaceId,
        actorId,
        action: "test_step.status_updated",
        entityType: "document_row",
        entityId: stepRowId,
        documentId: context.document.id,
        nextData: { status },
      });
      return detail;
    });
  }

  async completeExecution(actorId: string, executionId: string) {
    const execution = await this.requireExecution(executionId);
    await this.assertDocument(actorId, execution.testCaseRow.document, "row.write");
    const steps = await this.prisma.testStepExecution.findMany({ where: { executionId } });
    const status: ExecutionStatus = steps.some((step) => step.status === "failed")
      ? "failed"
      : steps.some((step) => step.status === "blocked")
        ? "blocked"
        : steps.length > 0 && steps.every((step) => step.status === "passed" || step.status === "skipped")
          ? "passed"
          : "running";
    if (status === "running") throw new UnprocessableEntityException("Every test step must have a final status");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.testExecution.update({ where: { id: executionId }, data: { status, completedAt: new Date() } });
      await this.audit.record(tx, {
        organizationId: execution.testCaseRow.document.organizationId,
        workspaceId: execution.testCaseRow.document.workspaceId,
        actorId,
        action: "test_execution.completed",
        entityType: "test_execution",
        entityId: executionId,
        documentId: execution.testCaseRow.document.id,
        nextData: { status },
      });
      return updated;
    });
  }

  async stopExecution(actorId: string, executionId: string) {
    const execution = await this.requireExecution(executionId);
    await this.assertDocument(actorId, execution.testCaseRow.document, "row.write");
    if (execution.status !== "running") throw new UnprocessableEntityException("Only running executions can be stopped");
    return this.prisma.$transaction(async (tx) => {
      await tx.testStepExecution.updateMany({
        where: { executionId, status: { in: ["not_run", "running"] } },
        data: { status: "skipped", executedAt: new Date() },
      });
      const updated = await tx.testExecution.update({
        where: { id: executionId },
        data: { status: "skipped", completedAt: new Date() },
      });
      await this.audit.record(tx, {
        organizationId: execution.testCaseRow.document.organizationId,
        workspaceId: execution.testCaseRow.document.workspaceId,
        actorId,
        action: "test_execution.stopped",
        entityType: "test_execution",
        entityId: executionId,
        documentId: execution.testCaseRow.document.id,
        nextData: { status: "skipped" },
      });
      return updated;
    });
  }

  async listReviews(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    const reviews = await this.prisma.review.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      include: { decisions: { include: { reviewer: { select: { id: true, displayName: true } } } } },
    });
    const reviewerIds = [...new Set(reviews.flatMap((review) => review.reviewerIds))];
    const users = await this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, displayName: true, email: true } });
    const byId = new Map(users.map((user) => [user.id, user]));
    return reviews.map((review) => ({
      ...review,
      reviewers: review.reviewerIds.flatMap((reviewerId) => {
        const reviewer = byId.get(reviewerId);
        return reviewer ? [{ reviewerId, reviewer }] : [];
      }),
    }));
  }

  async createReview(actorId: string, documentId: string, input: ReviewInput) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.write");
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: {
          organizationId: document.organizationId,
          documentId,
          createdById: actorId,
          title: input.title,
          description: input.description,
          reviewerIds: input.reviewerIds,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          status: input.activate ? "active" : "draft",
        },
      });
      if (input.activate) {
        await tx.notification.createMany({
          data: input.reviewerIds.map((recipientId) => ({
            organizationId: document.organizationId,
            recipientId,
            type: "review_requested" as const,
            payload: { reviewId: review.id, documentId, title: review.title } as Prisma.InputJsonValue,
          })),
        });
      }
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "review.created",
        entityType: "review",
        entityId: review.id,
        documentId,
        nextData: { title: input.title, reviewers: input.reviewerIds },
      });
      return review;
    });
  }

  async decideReview(actorId: string, reviewId: string, decision: ReviewDecisionType, comment?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, include: { document: true } });
    if (!review) throw new NotFoundException("Review not found");
    await this.assertDocument(actorId, review.document, "document.read");
    if (!review.reviewerIds.includes(actorId)) throw new ForbiddenException("User is not a reviewer");
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.reviewDecision.upsert({
        where: { reviewId_reviewerId: { reviewId, reviewerId: actorId } },
        create: { reviewId, reviewerId: actorId, decision, comment },
        update: { decision, comment, createdAt: new Date() },
      });
      const decisions = await tx.reviewDecision.findMany({ where: { reviewId } });
      const status = decisions.some((item) => item.decision !== "approved")
        ? "changes_requested"
        : decisions.length === review.reviewerIds.length
          ? "approved"
          : "active";
      await tx.review.update({ where: { id: reviewId }, data: { status } });
      return saved;
    });
  }

  async listProposals(actorId: string, rowId: string) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    return this.prisma.changeProposal.findMany({ where: { rowId }, orderBy: { createdAt: "desc" } });
  }

  async createProposal(actorId: string, rowId: string, input: ProposalInput) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    return this.prisma.changeProposal.create({
      data: {
        organizationId: context.document.organizationId,
        rowId,
        requestedById: actorId,
        title: input.title,
        reason: input.reason,
        proposedPatch: input.proposedPatch as Prisma.InputJsonValue,
        status: input.submit ? "submitted" : "draft",
      },
    });
  }

  async decideProposal(
    actorId: string,
    proposalId: string,
    input: { approved: boolean; decisionNote?: string; apply: boolean },
  ) {
    const proposal = await this.prisma.changeProposal.findUnique({
      where: { id: proposalId },
      include: { row: { include: { document: true } } },
    });
    if (!proposal) throw new NotFoundException("Change proposal not found");
    await this.assertDocument(actorId, proposal.row.document, "document.manage");
    let status: ChangeProposalStatus = input.approved ? "approved" : "rejected";
    await this.prisma.changeProposal.update({
      where: { id: proposalId },
      data: { status, decisionNote: input.decisionNote, decidedById: actorId, decidedAt: new Date() },
    });
    if (input.approved && input.apply) {
      const patch = proposal.proposedPatch as unknown as UpdateRowInput;
      await this.rows.updateRow(actorId, proposal.rowId, { ...patch, expectedVersion: patch.expectedVersion ?? proposal.row.version });
      status = "applied";
      await this.prisma.changeProposal.update({ where: { id: proposalId }, data: { status } });
    }
    return this.prisma.changeProposal.findUniqueOrThrow({ where: { id: proposalId } });
  }

  async listConfigurations(actorId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "workspace.read", { organizationId: workspace.organizationId, workspaceId });
    return this.prisma.productConfiguration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
  }

  async createConfiguration(actorId: string, workspaceId: string, input: ConfigurationInput) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "workspace.manage", { organizationId: workspace.organizationId, workspaceId });
    if (input.documentId) {
      const document = await this.requireDocument(input.documentId);
      if (document.workspaceId !== workspaceId) throw new UnprocessableEntityException("Document belongs to another workspace");
    }
    return this.prisma.$transaction(async (tx) => {
      const configuration = await tx.productConfiguration.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId,
          documentId: input.documentId,
          parentId: input.parentId,
          createdById: actorId,
          name: input.name,
          kind: input.kind,
          description: input.description,
          rules: input.rules as Prisma.InputJsonValue,
          lockedAt: input.kind === "baseline" ? new Date() : null,
        },
      });
      if (input.documentId) {
        const rows = await tx.documentRow.findMany({ where: { documentId: input.documentId, deletedAt: null }, select: { id: true, version: true } });
        if (rows.length > 0) {
          await tx.configurationItem.createMany({
            data: rows.map((row) => ({ configurationId: configuration.id, rowId: row.id, rowVersion: row.version })),
          });
        }
      }
      await this.audit.record(tx, {
        organizationId: workspace.organizationId,
        workspaceId,
        actorId,
        action: "configuration.created",
        entityType: "product_configuration",
        entityId: configuration.id,
        nextData: { name: input.name, kind: input.kind, documentId: input.documentId },
      });
      return configuration;
    });
  }

  async listAccessGrants(actorId: string, rowId: string) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "document.manage");
    return this.prisma.rowAccessGrant.findMany({
      where: { rowId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
  }

  async grantAccess(actorId: string, rowId: string, userId: string, accessLevel: RowAccessLevel) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "document.manage");
    return this.prisma.rowAccessGrant.upsert({
      where: { rowId_userId: { rowId, userId } },
      create: { organizationId: context.document.organizationId, rowId, userId, accessLevel },
      update: { accessLevel },
    });
  }

  async listIntegrations(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    return this.prisma.integrationEndpoint.findMany({ where: { organizationId, deletedAt: null }, orderBy: { name: "asc" } });
  }

  async createIntegration(
    actorId: string,
    organizationId: string,
    input: { name: string; integrationType: IntegrationType; configuration: Record<string, unknown>; enabled: boolean },
  ) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    return this.prisma.integrationEndpoint.create({
      data: {
        organizationId,
        name: input.name,
        integrationType: input.integrationType,
        configuration: input.configuration as Prisma.InputJsonValue,
        enabled: input.enabled,
      },
    });
  }

  async configureSso(actorId: string, organizationId: string, configuration: Record<string, unknown>) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null } });
    if (!organization) throw new NotFoundException("Organization not found");
    const settings = organization.settings as Record<string, unknown>;
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { settings: { ...settings, oidc: configuration } as Prisma.InputJsonValue },
    });
    return { enabled: configuration.enabled === true, issuer: configuration.issuer };
  }

  private async requireDocument(documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  private async requireWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  private async requireRowContext(rowId: string) {
    const row = await this.prisma.documentRow.findFirst({ where: { id: rowId, deletedAt: null }, include: { document: true } });
    if (!row || row.document.deletedAt) throw new NotFoundException("Row not found");
    return { row, document: row.document };
  }

  private async requireExecution(executionId: string) {
    const execution = await this.prisma.testExecution.findUnique({
      where: { id: executionId },
      include: { testCaseRow: { include: { document: true } } },
    });
    if (!execution) throw new NotFoundException("Execution not found");
    return execution;
  }

  private assertDocument(
    actorId: string,
    document: { organizationId: string; workspaceId: string },
    permission: "document.read" | "document.write" | "document.manage" | "row.read" | "row.write",
  ) {
    return this.access.assertPermission(actorId, permission, {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
  }
}
