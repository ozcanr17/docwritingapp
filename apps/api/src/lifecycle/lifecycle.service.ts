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
import { wordingQualityRules } from "./requirement-quality";
import { resolveTestScenario } from "../common/test-scenarios";
import { RowsService, TemplateRowSnapshot, UpdateRowInput } from "../rows/rows.service";
import { StorageService } from "../storage/storage.service";
import { createHash, randomUUID } from "crypto";

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
  retestPackageItemId?: string;
}

interface RetestPackageInput {
  name: string;
  candidateRowIds: string[];
  impactDepth: number;
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

interface CommentAnchor {
  field: "title" | "description" | "action" | "expectedResult";
  start: number;
  end: number;
  quotedText: string;
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

  async listTemplates(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    return this.prisma.documentTemplate.findMany({
      where: { organizationId: document.organizationId, documentType: document.documentType, deletedAt: null },
      orderBy: [{ templateKind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, documentType: true, templateKind: true, version: true, createdAt: true, updatedAt: true, createdById: true },
    });
  }

  async createTemplate(actorId: string, documentId: string, name: string, sourceRowId: string | null) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.write");
    const source = sourceRowId
      ? await this.prisma.documentRow.findFirst({ where: { id: sourceRowId, documentId, deletedAt: null } })
      : null;
    if (sourceRowId && !source) throw new NotFoundException("Template source row not found");
    const rows = await this.prisma.documentRow.findMany({
      where: {
        documentId,
        deletedAt: null,
        ...(source ? { OR: [{ id: source.id }, { ancestorPath: { startsWith: `${source.ancestorPath}${source.id}/` } }] } : {}),
      },
      orderBy: [{ depth: "asc" }, { rank: "asc" }],
      include: { requirementDetail: true, testCaseDetail: true, testStepDetail: true },
    });
    if (rows.length === 0) throw new UnprocessableEntityException("A template cannot be empty");
    const includedIds = new Set(rows.map((row) => row.id));
    const snapshot: TemplateRowSnapshot[] = rows.map((row) => ({
      key: row.id,
      parentKey: row.parentId && includedIds.has(row.parentId) ? row.parentId : null,
      rank: row.rank,
      rowType: row.rowType,
      title: row.title,
      description: row.description,
      numberingStart: row.numberingStart,
      customFields: row.customFields as Record<string, unknown>,
      requirementDetail: row.requirementDetail ? {
        status: row.requirementDetail.status,
        priority: row.requirementDetail.priority,
        rationale: row.requirementDetail.rationale,
        verificationMethod: row.requirementDetail.verificationMethod,
      } : null,
      testCaseDetail: row.testCaseDetail ? {
        status: row.testCaseDetail.status,
        priority: row.testCaseDetail.priority,
        tags: row.testCaseDetail.tags,
      } : null,
      testStepDetail: row.testStepDetail ? {
        stepNumber: row.testStepDetail.stepNumber,
        action: row.testStepDetail.action,
        expectedResult: row.testStepDetail.expectedResult,
      } : null,
    }));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.documentTemplate.create({
          data: {
            organizationId: document.organizationId,
            name,
            documentType: document.documentType,
            templateKind: source ? "section" : "document",
            columnConfig: document.columnConfig as Prisma.InputJsonValue,
            contentSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            createdById: actorId,
          },
        });
        await this.audit.record(tx, {
          organizationId: document.organizationId,
          workspaceId: document.workspaceId,
          actorId,
          action: "document_template.created",
          entityType: "document_template",
          entityId: template.id,
          documentId,
          nextData: { name, templateKind: template.templateKind, rowCount: snapshot.length },
        });
        return template;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new UnprocessableEntityException("A template with this name already exists");
      }
      throw error;
    }
  }

  async applyTemplate(actorId: string, documentId: string, templateId: string, parentId: string | null) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.write");
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, organizationId: document.organizationId, documentType: document.documentType, deletedAt: null },
    });
    if (!template) throw new NotFoundException("Template not found");
    if (!Array.isArray(template.contentSnapshot)) throw new UnprocessableEntityException("Template content is invalid");
    return this.rows.applyTemplateSnapshot(actorId, documentId, parentId, template.contentSnapshot as unknown as TemplateRowSnapshot[]);
  }

  async deleteTemplate(actorId: string, documentId: string, templateId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.write");
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, organizationId: document.organizationId, documentType: document.documentType, deletedAt: null },
    });
    if (!template) throw new NotFoundException("Template not found");
    if (template.createdById && template.createdById !== actorId) throw new ForbiddenException("Only the template owner can delete it");
    await this.prisma.documentTemplate.update({ where: { id: templateId }, data: { deletedAt: new Date(), deletedById: actorId } });
    return { ok: true };
  }

  async search(actorId: string, workspaceId: string, query: string, limit: number) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    await this.access.assertPermission(actorId, "row.read", { organizationId: workspace.organizationId, workspaceId });
    const normalized = query.trim().toLocaleLowerCase("en");
    if (normalized.length < 2 && !/^\d+$/.test(normalized)) return [];
    const [documents, candidates] = await Promise.all([
      this.prisma.document.findMany({
        where: { workspaceId, deletedAt: null, title: { contains: query.trim(), mode: "insensitive" } },
        select: { id: true, title: true, documentType: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: Math.min(limit, 50),
      }),
      this.prisma.documentRow.findMany({
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
      }),
    ]);
    const readable = await this.access.readableRowIds(actorId, candidates.map((row) => row.id));
    const documentResults = documents.map((document) => ({
      id: `document:${document.id}`,
      rowId: null,
      rowType: "document",
      title: document.title,
      description: null,
      requirementNo: null,
      objectNumber: null,
      document,
      updatedAt: document.updatedAt,
    }));
    const rowResults = candidates
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
          String(row.objectNumber),
          JSON.stringify(row.customFields),
          row.document.title,
          linkedText,
        ].join(" ").toLocaleLowerCase("en");
        return searchable.includes(normalized)
          ? {
              id: row.id,
              rowId: row.id,
              rowType: row.rowType,
              title: row.title,
              description: row.description,
              requirementNo: row.requirementDetail?.requirementNo ?? null,
              objectNumber: row.objectNumber,
              document: row.document,
              updatedAt: row.updatedAt,
            }
          : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
    return [...documentResults, ...rowResults]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
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
      for (const rule of wordingQualityRules(row.title)) {
        rowIssues.push({ rule, severity: "warning", rowId: row.id, title: row.title });
      }
      const linkedTypes = [
        ...row.outgoingLinks.map((link) => link.targetRow.rowType),
        ...row.incomingLinks.map((link) => link.sourceRow.rowType),
      ];
      if (!linkedTypes.some((type) => type === "test_case" || type === "test_step")) {
        rowIssues.push({ rule: "untested_requirement", severity: "warning", rowId: row.id, title: row.title });
      }
      return rowIssues;
    });
    const weightedPenalty = issues.reduce((total, issue) => total + (issue.severity === "error" ? 25 : 10), 0);
    return {
      totalRequirements: requirements.length,
      score: requirements.length === 0 ? 100 : Math.max(0, Math.round(100 - weightedPenalty / requirements.length)),
      issues,
      summary: {
        missingNumber: issues.filter((issue) => issue.rule === "missing_number").length,
        duplicateNumber: issues.filter((issue) => issue.rule === "duplicate_number").length,
        emptyDescription: issues.filter((issue) => issue.rule === "empty_description").length,
        untestedRequirement: issues.filter((issue) => issue.rule === "untested_requirement").length,
        ambiguousWording: issues.filter((issue) => issue.rule === "ambiguous_wording").length,
        weakObligation: issues.filter((issue) => issue.rule === "weak_obligation").length,
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

  async releaseReadiness(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    const [quality, rows, suspectLinks, latestExecutions, latestBaseline, latestReview] = await Promise.all([
      this.quality(actorId, documentId),
      this.prisma.documentRow.findMany({
        where: { documentId, deletedAt: null },
        orderBy: [{ depth: "asc" }, { rank: "asc" }],
        select: {
          id: true,
          parentId: true,
          objectNumber: true,
          rowType: true,
          title: true,
          customFields: true,
          updatedAt: true,
          testStepDetail: { select: { action: true, expectedResult: true } },
          outgoingLinks: {
            where: { deletedAt: null },
            select: { targetRow: { select: { id: true, rowType: true, document: { select: { id: true, title: true, documentType: true } } } } },
          },
          incomingLinks: {
            where: { deletedAt: null },
            select: { sourceRow: { select: { id: true, rowType: true, document: { select: { id: true, title: true, documentType: true } } } } },
          },
        },
      }),
      this.prisma.requirementLink.findMany({
        where: { suspect: true, deletedAt: null, OR: [{ sourceRow: { documentId } }, { targetRow: { documentId } }] },
        select: {
          id: true,
          suspectSince: true,
          sourceRow: { select: { id: true, objectNumber: true, title: true, rowType: true, document: { select: { id: true, title: true, documentType: true } } } },
          targetRow: { select: { id: true, objectNumber: true, title: true, rowType: true, document: { select: { id: true, title: true, documentType: true } } } },
        },
        orderBy: { suspectSince: "desc" },
      }),
      this.prisma.testExecution.findMany({
        where: { testCaseRow: { documentId } },
        orderBy: { createdAt: "desc" },
        distinct: ["testCaseRowId"],
        select: {
          testCaseRowId: true,
          status: true,
          completedAt: true,
          testCaseRow: { select: { id: true, objectNumber: true, title: true } },
          steps: { select: { testStepRowId: true, status: true } },
        },
      }),
      this.prisma.documentRevision.findFirst({ where: { documentId }, orderBy: { revisionNumber: "desc" }, select: { revisionNumber: true, semanticVersion: true, createdAt: true, summary: true } }),
      this.prisma.review.findFirst({ where: { documentId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, updatedAt: true } }),
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const requirements = rows.filter((row) => row.rowType === "requirement");
    const testSteps = rows.filter((row) => row.rowType === "test_step");
    const linkedToType = (row: typeof rows[number], rowType: "requirement" | "test_step" | "test_case") => [
      ...row.outgoingLinks.map((link) => link.targetRow.rowType),
      ...row.incomingLinks.map((link) => link.sourceRow.rowType),
    ].includes(rowType);
    const uncoveredRequirements = requirements.filter((row) => !linkedToType(row, "test_step") && !linkedToType(row, "test_case"));
    const unlinkedTestSteps = testSteps.filter((row) => !linkedToType(row, "requirement"));
    const incompleteTestSteps = testSteps.filter((row) => !row.testStepDetail?.action?.trim() || !row.testStepDetail.expectedResult?.trim());
    const baselineRows = ((latestBaseline?.summary as { rows?: Array<{ id: string }> } | null)?.rows ?? []);
    const baselineRowIds = new Set(baselineRows.map((row) => row.id));
    const currentRowIds = new Set(rows.map((row) => row.id));
    const changedRows = latestBaseline
      ? rows.filter((row) => !baselineRowIds.has(row.id) || row.updatedAt > latestBaseline.createdAt)
      : rows;
    const removedSinceBaseline = latestBaseline ? baselineRows.filter((row) => !currentRowIds.has(row.id)).length : 0;
    const latestFailedExecutions = latestExecutions.filter((execution) => execution.status !== "passed");
    const verifiedStepIds = new Set(latestExecutions
      .filter((execution) => execution.status === "passed")
      .flatMap((execution) => execution.steps.filter((step) => step.status === "passed").map((step) => step.testStepRowId)));
    const unverifiedTestSteps = testSteps.filter((row) => !verifiedStepIds.has(row.id));
    const retestByRowId = new Map<string, {
      rowId: string;
      objectNumber: number;
      title: string;
      document: { id: string; title: string; documentType: string };
      reason: string;
    }>();
    for (const link of suspectLinks) {
      const candidate = [link.sourceRow, link.targetRow].find((row) => row.rowType === "test_step" || row.rowType === "test_case");
      if (candidate) retestByRowId.set(candidate.id, {
        rowId: candidate.id,
        objectNumber: candidate.objectNumber,
        title: candidate.title,
        document: candidate.document,
        reason: "suspect_link",
      });
    }
    const retestDocumentIds = [...new Set([...retestByRowId.values()].map((candidate) => candidate.document.id))];
    const retestHierarchyRows = retestDocumentIds.length === 0 ? [] : await this.prisma.documentRow.findMany({
      where: { documentId: { in: retestDocumentIds }, deletedAt: null },
      select: { id: true, parentId: true, objectNumber: true, rowType: true, title: true, customFields: true },
    });
    const retestHierarchyById = new Map(retestHierarchyRows.map((row) => [row.id, row]));
    for (const candidate of retestByRowId.values()) {
      const scenario = resolveTestScenario(candidate.rowId, retestHierarchyById);
      if (!scenario) continue;
      candidate.title = scenario.title;
      candidate.objectNumber = retestHierarchyById.get(scenario.id)?.objectNumber ?? candidate.objectNumber;
    }
    const qualityErrors = quality.issues.filter((issue) => issue.severity === "error");
    const gates = [
      {
        key: "content",
        required: true,
        status: rows.length > 0 && qualityErrors.length === 0 && incompleteTestSteps.length === 0 ? "passed" : "failed",
        issueCount: (rows.length === 0 ? 1 : 0) + qualityErrors.length + incompleteTestSteps.length,
      },
      {
        key: "traceability",
        required: true,
        status: document.documentType === "requirement"
          ? (uncoveredRequirements.length === 0 ? "passed" : "failed")
          : document.documentType === "test"
            ? (unlinkedTestSteps.length === 0 ? "passed" : "failed")
            : "not_applicable",
        issueCount: document.documentType === "requirement" ? uncoveredRequirements.length : document.documentType === "test" ? unlinkedTestSteps.length : 0,
      },
      {
        key: "links_current",
        required: true,
        status: suspectLinks.length === 0 ? "passed" : "failed",
        issueCount: suspectLinks.length,
      },
      {
        key: "verification",
        required: false,
        status: document.documentType !== "test"
          ? "not_applicable"
          : testSteps.length === 0 || unverifiedTestSteps.length > 0 || latestFailedExecutions.length > 0
            ? "warning"
            : "passed",
        issueCount: document.documentType === "test" ? (testSteps.length === 0 ? 1 : unverifiedTestSteps.length + latestFailedExecutions.length) : 0,
      },
      {
        key: "review",
        required: false,
        status: latestReview?.status === "approved" ? "passed" : "warning",
        issueCount: latestReview?.status === "approved" ? 0 : 1,
      },
    ] as const;
    const requiredGates = gates.filter((gate) => gate.required && gate.status !== "not_applicable");
    const failedRequired = requiredGates.filter((gate) => gate.status === "failed");
    const status = failedRequired.length > 0 ? "blocked" : requiredGates.some((gate) => gate.status === "warning") ? "warning" : "ready";
    return {
      status,
      score: requiredGates.length === 0 ? 100 : Math.round(((requiredGates.length - failedRequired.length) / requiredGates.length) * 100),
      generatedAt: new Date(),
      gates,
      counts: {
        rows: rows.length,
        requirements: requirements.length,
        testSteps: testSteps.length,
        qualityErrors: qualityErrors.length,
        qualityWarnings: quality.issues.length - qualityErrors.length,
        uncoveredRequirements: uncoveredRequirements.length,
        unlinkedTestSteps: unlinkedTestSteps.length,
        incompleteTestSteps: incompleteTestSteps.length,
        unverifiedTestSteps: unverifiedTestSteps.length,
        suspectLinks: suspectLinks.length,
        retestCandidates: retestByRowId.size,
        failedLatestExecutions: latestFailedExecutions.length,
      },
      issues: [
        ...quality.issues.filter((issue) => issue.rule !== "untested_requirement").map((issue) => ({ ...issue, objectNumber: byId.get(issue.rowId)?.objectNumber ?? null })),
        ...incompleteTestSteps.map((row) => ({ rule: "incomplete_test_step", severity: "error", rowId: row.id, objectNumber: row.objectNumber, title: row.title })),
        ...uncoveredRequirements.map((row) => ({ rule: "uncovered_requirement", severity: "warning", rowId: row.id, objectNumber: row.objectNumber, title: row.title })),
        ...unlinkedTestSteps.map((row) => ({ rule: "unlinked_test_step", severity: "warning", rowId: row.id, objectNumber: row.objectNumber, title: row.title })),
      ],
      retestCandidates: [...retestByRowId.values()],
      failedExecutions: latestFailedExecutions.map((execution) => ({
        rowId: execution.testCaseRow.id,
        objectNumber: execution.testCaseRow.objectNumber,
        title: execution.testCaseRow.title,
        status: execution.status,
        completedAt: execution.completedAt,
      })),
      latestReview,
      baseline: latestBaseline ? {
        revisionNumber: latestBaseline.revisionNumber,
        semanticVersion: latestBaseline.semanticVersion,
        createdAt: latestBaseline.createdAt,
        changedRows: changedRows.length,
        removedRows: removedSinceBaseline,
        current: changedRows.length === 0 && removedSinceBaseline === 0,
      } : null,
    };
  }

  async impactAnalysis(actorId: string, documentId: string, impactDepth: number) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    const depth = Math.min(3, Math.max(1, impactDepth));
    const [rows, latestBaseline, suspectLinks] = await Promise.all([
      this.prisma.documentRow.findMany({
        where: { documentId, deletedAt: null },
        select: { id: true, objectNumber: true, rowType: true, title: true, updatedAt: true, document: { select: { id: true, title: true, documentType: true } } },
      }),
      this.prisma.documentRevision.findFirst({ where: { documentId }, orderBy: { revisionNumber: "desc" }, select: { revisionNumber: true, semanticVersion: true, createdAt: true, summary: true } }),
      this.prisma.requirementLink.findMany({
        where: { suspect: true, deletedAt: null, OR: [{ sourceRow: { documentId } }, { targetRow: { documentId } }] },
        select: { id: true, sourceRowId: true, targetRowId: true },
      }),
    ]);
    const baselineRows = ((latestBaseline?.summary as { rows?: Array<{ id: string }> } | null)?.rows ?? []);
    const baselineIds = new Set(baselineRows.map((row) => row.id));
    const changedRows = latestBaseline
      ? rows.filter((row) => !baselineIds.has(row.id) || row.updatedAt > latestBaseline.createdAt)
      : rows;
    const seedIds = new Set(changedRows.map((row) => row.id));
    if (seedIds.size === 0) {
      for (const link of suspectLinks) {
        if (rows.some((row) => row.id === link.sourceRowId)) seedIds.add(link.sourceRowId);
        if (rows.some((row) => row.id === link.targetRowId)) seedIds.add(link.targetRowId);
      }
    }
    const origins = new Map<string, Set<string>>([...seedIds].map((rowId) => [rowId, new Set([rowId])]));
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const traversedLinkIds = new Set<string>();
    const suspectCandidateIds = new Set<string>();
    const visited = new Set(seedIds);
    let frontier = new Set(seedIds);
    for (let level = 0; level < depth && frontier.size > 0; level += 1) {
      const links = await this.prisma.requirementLink.findMany({
        where: {
          deletedAt: null,
          OR: [{ sourceRowId: { in: [...frontier] } }, { targetRowId: { in: [...frontier] } }],
          sourceRow: { document: { workspaceId: document.workspaceId, deletedAt: null } },
          targetRow: { document: { workspaceId: document.workspaceId, deletedAt: null } },
        },
        select: {
          id: true,
          sourceRowId: true,
          targetRowId: true,
          suspect: true,
          sourceRow: { select: { id: true, objectNumber: true, rowType: true, title: true, updatedAt: true, document: { select: { id: true, title: true, documentType: true } } } },
          targetRow: { select: { id: true, objectNumber: true, rowType: true, title: true, updatedAt: true, document: { select: { id: true, title: true, documentType: true } } } },
        },
      });
      const next = new Set<string>();
      for (const link of links) {
        traversedLinkIds.add(link.id);
        rowById.set(link.sourceRow.id, link.sourceRow);
        rowById.set(link.targetRow.id, link.targetRow);
        if (link.suspect && (link.sourceRow.rowType === "test_step" || link.sourceRow.rowType === "test_case")) suspectCandidateIds.add(link.sourceRowId);
        if (link.suspect && (link.targetRow.rowType === "test_step" || link.targetRow.rowType === "test_case")) suspectCandidateIds.add(link.targetRowId);
        for (const [fromId, toId] of [[link.sourceRowId, link.targetRowId], [link.targetRowId, link.sourceRowId]] as const) {
          if (!frontier.has(fromId)) continue;
          const inherited = origins.get(fromId) ?? new Set([fromId]);
          const targetOrigins = origins.get(toId) ?? new Set<string>();
          for (const origin of inherited) targetOrigins.add(origin);
          origins.set(toId, targetOrigins);
          if (!visited.has(toId)) next.add(toId);
        }
      }
      for (const rowId of next) visited.add(rowId);
      frontier = next;
    }
    const rawCandidates = [...origins.entries()].flatMap(([rowId, sourceIds]) => {
      const row = rowById.get(rowId);
      if (!row || (row.rowType !== "test_step" && row.rowType !== "test_case")) return [];
      return [{
        rowId,
        objectNumber: row.objectNumber,
        title: row.title,
        rowType: row.rowType,
        document: row.document,
        reason: suspectCandidateIds.has(rowId) ? "suspect_link" : "baseline_change",
        sourceRowIds: [...sourceIds],
      }];
    });
    const candidateDocumentIds = [...new Set(rawCandidates.map((candidate) => candidate.document.id))];
    const hierarchyRows = candidateDocumentIds.length === 0 ? [] : await this.prisma.documentRow.findMany({
      where: { documentId: { in: candidateDocumentIds }, deletedAt: null },
      select: { id: true, parentId: true, objectNumber: true, rowType: true, title: true, customFields: true },
    });
    const hierarchyById = new Map(hierarchyRows.map((row) => [row.id, row]));
    const candidates = rawCandidates.map((candidate) => {
      const scenario = resolveTestScenario(candidate.rowId, hierarchyById);
      return {
        ...candidate,
        scenarioRowId: scenario?.id ?? candidate.rowId,
        objectNumber: scenario ? hierarchyById.get(scenario.id)?.objectNumber ?? candidate.objectNumber : candidate.objectNumber,
        title: scenario?.title ?? candidate.title,
      };
    });
    return {
      impactDepth: depth,
      baseline: latestBaseline ? { revisionNumber: latestBaseline.revisionNumber, semanticVersion: latestBaseline.semanticVersion, createdAt: latestBaseline.createdAt } : null,
      changedRows: changedRows.map((row) => ({ rowId: row.id, objectNumber: row.objectNumber, title: row.title, rowType: row.rowType })),
      affectedRowCount: Math.max(0, origins.size - seedIds.size),
      traversedLinkCount: traversedLinkIds.size,
      retestCandidates: candidates,
    };
  }

  async listRetestPackages(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.read");
    const packages = await this.prisma.retestPackage.findMany({
      where: { OR: [{ sourceDocumentId: documentId }, { items: { some: { testRow: { documentId } } } }] },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, displayName: true } },
        sourceDocument: { select: { id: true, title: true, documentType: true } },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            testRow: { select: { id: true, objectNumber: true, title: true, rowType: true, deletedAt: true, document: { select: { id: true, title: true, documentType: true } } } },
            executions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true, completedAt: true } },
          },
        },
      },
    });
    return packages.map((item) => ({
      ...item,
      progress: {
        total: item.items.length,
        completed: item.items.filter((entry) => entry.executions[0] && !["not_run", "running"].includes(entry.executions[0].status)).length,
        passed: item.items.filter((entry) => entry.executions[0]?.status === "passed").length,
        failed: item.items.filter((entry) => ["failed", "blocked"].includes(entry.executions[0]?.status ?? "")).length,
      },
    }));
  }

  async createRetestPackage(actorId: string, documentId: string, input: RetestPackageInput) {
    const document = await this.requireDocument(documentId);
    await this.assertDocument(actorId, document, "document.write");
    const analysis = await this.impactAnalysis(actorId, documentId, input.impactDepth);
    const candidateById = new Map(analysis.retestCandidates.map((candidate) => [candidate.rowId, candidate]));
    const selectedIds = [...new Set(input.candidateRowIds)];
    const selected = selectedIds.map((rowId) => candidateById.get(rowId));
    if (selected.some((candidate) => !candidate)) throw new UnprocessableEntityException("Retest candidates are stale; run impact analysis again");
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.retestPackage.create({
        data: {
          organizationId: document.organizationId,
          workspaceId: document.workspaceId,
          sourceDocumentId: documentId,
          createdById: actorId,
          name: input.name.trim(),
          sourceRevisionNumber: analysis.baseline?.revisionNumber ?? null,
          impactDepth: analysis.impactDepth,
          criteria: { source: "impact_analysis" },
          summary: { changedRows: analysis.changedRows.length, affectedRows: analysis.affectedRowCount, traversedLinks: analysis.traversedLinkCount },
          items: {
            create: selected.map((candidate) => ({
              testRowId: candidate!.rowId,
              reason: candidate!.reason,
              sourceRowIds: candidate!.sourceRowIds,
            })),
          },
        },
        include: { items: true },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "retest_package.created",
        entityType: "retest_package",
        entityId: created.id,
        documentId,
        nextData: { name: created.name, itemCount: created.items.length, impactDepth: created.impactDepth },
      });
      return created;
    });
  }

  async cancelRetestPackage(actorId: string, packageId: string) {
    const item = await this.prisma.retestPackage.findUnique({ where: { id: packageId }, include: { sourceDocument: true } });
    if (!item) throw new NotFoundException("Retest package not found");
    await this.assertDocument(actorId, item.sourceDocument, "document.write");
    if (item.status === "completed" || item.status === "canceled") throw new UnprocessableEntityException("Retest package is already closed");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.retestPackage.update({ where: { id: packageId }, data: { status: "canceled", canceledAt: new Date() } });
      await this.audit.record(tx, {
        organizationId: item.organizationId,
        workspaceId: item.workspaceId,
        actorId,
        action: "retest_package.canceled",
        entityType: "retest_package",
        entityId: packageId,
        documentId: item.sourceDocumentId,
        previousData: { status: item.status },
        nextData: { status: "canceled" },
      });
      return updated;
    });
  }

  async assistantSuggestions(actorId: string, documentId: string) {
    const quality = await this.quality(actorId, documentId);
    const guidance: Record<string, string> = {
      missing_number: "Assign a stable, unique requirement number.",
      duplicate_number: "Rename one requirement number and repair incoming references.",
      empty_description: "Write a measurable statement with actor, behavior and acceptance condition.",
      untested_requirement: "Create or link a test case and define observable expected results.",
      ambiguous_wording: "Replace vague qualifiers with a measurable threshold or an explicit condition.",
      weak_obligation: "Use a binding obligation and state an observable acceptance criterion.",
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

  async people(actorId: string, rowId: string, query: string) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    const normalized = query.trim();
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        organizationMemberships: { some: { organizationId: context.document.organizationId, deletedAt: null } },
        ...(normalized ? { OR: [
          { displayName: { contains: normalized, mode: "insensitive" } },
          { email: { contains: normalized, mode: "insensitive" } },
          { firstName: { contains: normalized, mode: "insensitive" } },
          { lastName: { contains: normalized, mode: "insensitive" } },
        ] } : {}),
      },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      take: 30,
      select: { id: true, displayName: true, email: true, firstName: true, lastName: true, department: true },
    });
  }

  async addComment(
    actorId: string,
    rowId: string,
    body: string,
    mentionUserIds: string[],
    anchor?: CommentAnchor,
    suggestedReplacement?: string | null,
  ) {
    const context = await this.requireRowContext(rowId);
    await this.assertDocument(actorId, context.document, "row.read");
    let proposedPatch: UpdateRowInput | null = null;
    if (anchor) {
      const fieldValue = anchor.field === "title"
        ? context.row.title
        : anchor.field === "description"
          ? context.row.description ?? ""
          : anchor.field === "action"
            ? context.row.testStepDetail?.action ?? ""
            : context.row.testStepDetail?.expectedResult ?? "";
      if (anchor.end <= anchor.start || fieldValue.slice(anchor.start, anchor.end) !== anchor.quotedText) {
        throw new BadRequestException("Selected text is stale; select it again before commenting");
      }
      if (suggestedReplacement !== undefined && suggestedReplacement !== null) {
        const nextValue = `${fieldValue.slice(0, anchor.start)}${suggestedReplacement}${fieldValue.slice(anchor.end)}`;
        proposedPatch = anchor.field === "title"
          ? { expectedVersion: context.row.version, title: nextValue }
          : anchor.field === "description"
            ? { expectedVersion: context.row.version, description: nextValue }
            : { expectedVersion: context.row.version, testStepDetail: { [anchor.field]: nextValue } };
      }
    }
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
          anchor: (anchor ?? {}) as Prisma.InputJsonValue,
          suggestedReplacement,
        },
        include: { author: { select: { id: true, displayName: true, email: true } } },
      });
      if (proposedPatch && anchor) {
        await tx.changeProposal.create({
          data: {
            organizationId: context.document.organizationId,
            rowId,
            requestedById: actorId,
            title: `Suggested change to ${anchor.field}`,
            reason: body,
            proposedPatch: proposedPatch as unknown as Prisma.InputJsonValue,
            status: "submitted",
          },
        });
      }
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
        nextData: { rowId, mentions: recipients, anchor: anchor ? { ...anchor } : null, hasSuggestion: Boolean(proposedPatch) } as Prisma.InputJsonValue,
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

  async myWork(actorId: string, query: string, kind: string) {
    const normalized = query.trim().toLocaleLowerCase();
    const includeAssignments = kind === "all" || kind === "assignment";
    const includeMentions = kind === "all" || kind === "mention";
    const includeReviews = kind === "all" || kind === "review";
    const [assignments, mentions, reviews] = await Promise.all([
      includeAssignments ? this.prisma.testCaseDetail.findMany({
        where: { assigneeId: actorId, row: { deletedAt: null, document: { deletedAt: null } } },
        include: { row: { include: { document: { select: { id: true, title: true, documentType: true } } } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }) : [],
      includeMentions ? this.prisma.rowComment.findMany({
        where: { mentions: { has: actorId }, deletedAt: null, row: { deletedAt: null, document: { deletedAt: null } } },
        include: { author: { select: { displayName: true } }, row: { include: { document: { select: { id: true, title: true, documentType: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }) : [],
      includeReviews ? this.prisma.review.findMany({
        where: { reviewerIds: { has: actorId }, status: "active", document: { deletedAt: null } },
        include: { document: { select: { id: true, title: true, documentType: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }) : [],
    ]);
    const items = [
      ...assignments.map((item) => ({ id: `assignment:${item.rowId}`, kind: "assignment", title: item.row.title || `ID ${item.row.objectNumber}`, detail: item.status, rowId: item.rowId, document: item.row.document, createdAt: item.updatedAt })),
      ...mentions.map((item) => ({ id: `mention:${item.id}`, kind: "mention", title: item.row.title || `ID ${item.row.objectNumber}`, detail: `${item.author.displayName}: ${item.body}`, rowId: item.rowId, document: item.row.document, createdAt: item.createdAt })),
      ...reviews.map((item) => ({ id: `review:${item.id}`, kind: "review", title: item.title, detail: item.document.title, rowId: null, document: item.document, createdAt: item.createdAt })),
    ];
    return items
      .filter((item) => !normalized || `${item.title} ${item.detail} ${item.document.title}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 100);
  }

  async readNotification(actorId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId: actorId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException("Notification not found");
    return { ok: true };
  }

  async readAllNotifications(actorId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: actorId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async listExecutions(actorId: string, testCaseRowId: string) {
    const context = await this.requireRowContext(testCaseRowId);
    await this.assertDocument(actorId, context.document, "row.read");
    return this.prisma.testExecution.findMany({
      where: { testCaseRowId },
      orderBy: { createdAt: "desc" },
      include: {
        executedBy: { select: { id: true, displayName: true } },
        retestPackageItem: { select: { id: true, package: { select: { id: true, name: true } } } },
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
        retestPackageItem: { select: { id: true, package: { select: { id: true, name: true } } } },
        steps: { include: { testStepRow: { select: { id: true, title: true, testStepDetail: true } } } },
      },
    });
  }

  async createExecution(actorId: string, testCaseRowId: string, input: ExecutionInput) {
    const context = await this.requireRowContext(testCaseRowId);
    await this.assertDocument(actorId, context.document, "row.write");
    if (context.document.documentType !== "test" || !["heading", "test_case", "test_step"].includes(context.row.rowType)) {
      throw new UnprocessableEntityException("Executions can only be created for test headings or steps");
    }
    const packageItem = input.retestPackageItemId
      ? await this.prisma.retestPackageItem.findUnique({ where: { id: input.retestPackageItemId }, include: { package: true } })
      : null;
    if (input.retestPackageItemId && (!packageItem || packageItem.testRowId !== testCaseRowId || packageItem.package.status === "canceled")) {
      throw new UnprocessableEntityException("Retest package item is unavailable");
    }
    const steps = context.row.rowType === "test_step"
      ? [context.row]
      : await this.prisma.documentRow.findMany({
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
          retestPackageItemId: packageItem?.id,
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
      if (packageItem) await tx.retestPackage.update({ where: { id: packageItem.packageId }, data: { status: "active", completedAt: null } });
      await this.audit.record(tx, {
        organizationId: context.document.organizationId,
        workspaceId: context.document.workspaceId,
        actorId,
        action: "test_execution.created",
        entityType: "test_execution",
        entityId: execution.id,
        documentId: context.document.id,
        nextData: { testCaseRowId, stepCount: steps.length, retestPackageItemId: packageItem?.id },
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
      if (execution.retestPackageItemId) await this.refreshRetestPackageStatus(tx, execution.retestPackageItemId);
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
      if (execution.retestPackageItemId) await this.refreshRetestPackageStatus(tx, execution.retestPackageItemId);
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
    const baseline = await this.prisma.documentRevision.findFirst({
      where: { documentId },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true, semanticVersion: true, summary: true },
    });
    if (input.activate && !baseline) throw new UnprocessableEntityException("An active review requires a document baseline");
    const contentHash = baseline ? createHash("sha256").update(JSON.stringify(baseline.summary)).digest("hex") : null;
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
          baselineRevisionNumber: baseline?.revisionNumber,
          baselineSemanticVersion: baseline?.semanticVersion,
          contentHash,
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
        nextData: { title: input.title, reviewers: input.reviewerIds, baselineRevisionNumber: baseline?.revisionNumber, baselineSemanticVersion: baseline?.semanticVersion, contentHash },
      });
      return review;
    });
  }

  async decideReview(actorId: string, reviewId: string, decision: ReviewDecisionType, comment?: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, include: { document: true } });
    if (!review) throw new NotFoundException("Review not found");
    await this.assertDocument(actorId, review.document, "document.read");
    if (!review.reviewerIds.includes(actorId)) throw new ForbiddenException("User is not a reviewer");
    if (review.status !== "active") throw new UnprocessableEntityException("Review decisions require an active review");
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
    const row = await this.prisma.documentRow.findFirst({
      where: { id: rowId, deletedAt: null },
      include: { document: true, testStepDetail: true },
    });
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

  private async refreshRetestPackageStatus(tx: Prisma.TransactionClient, packageItemId: string) {
    const packageItem = await tx.retestPackageItem.findUnique({ where: { id: packageItemId }, select: { packageId: true, package: { select: { status: true } } } });
    if (!packageItem || packageItem.package.status === "canceled") return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${packageItem.packageId}::text, 0))`;
    const items = await tx.retestPackageItem.findMany({
      where: { packageId: packageItem.packageId },
      select: { executions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
    });
    const finalStatuses: ExecutionStatus[] = ["passed", "failed", "blocked", "skipped"];
    const complete = items.length > 0 && items.every((item) => item.executions[0] && finalStatuses.includes(item.executions[0].status));
    await tx.retestPackage.update({
      where: { id: packageItem.packageId },
      data: complete ? { status: "completed", completedAt: new Date() } : { status: "active", completedAt: null },
    });
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
