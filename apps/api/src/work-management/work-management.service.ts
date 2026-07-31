import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@docsys/database";
import { randomUUID } from "crypto";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { ProjectKeyService } from "../tenancy/project-key.service";
import { WorkItemSchemaService } from "./work-item-schema.service";
import { ProjectPlanningService } from "./project-planning.service";
import { PrismaService } from "../prisma/prisma.service";
import { resolveTestScenario } from "../common/test-scenarios";

type ArtifactInput = { documentId?: string; rowId?: string; testExecutionId?: string; testStepExecutionId?: string; role: "relates_to" | "affects" | "found_in" | "verifies" };
type WorkItemCreate = {
  type: "epic" | "story" | "task" | "bug" | "risk";
  typeKey?: string;
  customFields?: Record<string, unknown>;
  title: string;
  description?: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  environment?: string;
  affectedVersion?: string;
  priority: "lowest" | "low" | "medium" | "high" | "highest" | "critical";
  reporterId?: string;
  assigneeId?: string | null;
  parentId?: string | null;
  labels: string[];
  releaseId?: string | null;
  iterationId?: string | null;
  dueAt?: string | null;
  artifact?: ArtifactInput;
  artifacts: ArtifactInput[];
};
type WorkItemUpdate = {
  expectedVersion: number;
  type?: WorkItemCreate["type"];
  status?: "backlog" | "ready" | "in_progress" | "in_review" | "done" | "canceled";
  priority?: WorkItemCreate["priority"];
  title?: string;
  description?: string | null;
  stepsToReproduce?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  environment?: string | null;
  affectedVersion?: string | null;
  reporterId?: string;
  assigneeId?: string | null;
  parentId?: string | null;
  labels?: string[];
  releaseId?: string | null;
  iterationId?: string | null;
  dueAt?: string | null;
};
type InternalDefectInput = { projectId: string; title: string; description?: string; priority: WorkItemCreate["priority"]; assigneeId?: string | null };
type WorkStatus = NonNullable<WorkItemUpdate["status"]>;
type WorkType = WorkItemCreate["type"];
type WorkflowRequiredField = "description" | "assignee" | "dueAt";
type WorkflowRole = "project_manager" | "editor";
type WorkflowTransitionRoles = Record<WorkStatus, Partial<Record<WorkStatus, WorkflowRole[]>>>;
type WorkflowScheme = {
  transitions: Record<WorkStatus, WorkStatus[]>;
  requiredFields: Record<WorkStatus, WorkflowRequiredField[]>;
  transitionRoles: WorkflowTransitionRoles;
};
type BoardSwimlane = "none" | "assignee" | "priority" | "type" | "epic" | "iteration";
type BoardConfiguration = {
  wipLimits: Partial<Record<WorkStatus, number>>;
  defaultSwimlane: BoardSwimlane;
};
type WorkflowConfiguration = { schemes: Record<WorkType, WorkflowScheme>; board: BoardConfiguration };
type WorkflowSchemeInput = {
  transitions: Partial<Record<WorkStatus, WorkStatus[]>>;
  requiredFields: Partial<Record<WorkStatus, WorkflowRequiredField[]>>;
  transitionRoles: Partial<WorkflowTransitionRoles>;
};
type BoardConfigurationInput = {
  wipLimits?: Partial<Record<WorkStatus, number | null>>;
  defaultSwimlane?: BoardSwimlane;
};

const workStatuses: WorkStatus[] = ["backlog", "ready", "in_progress", "in_review", "done", "canceled"];
const workTypes: WorkType[] = ["epic", "story", "task", "bug", "risk"];
const boardSwimlanes: BoardSwimlane[] = ["none", "assignee", "priority", "type", "epic", "iteration"];
const maxWipLimit = 99;
const defaultTransitions: Record<WorkStatus, WorkStatus[]> = {
  backlog: ["ready", "in_progress", "canceled"],
  ready: ["backlog", "in_progress", "canceled"],
  in_progress: ["ready", "in_review", "done", "canceled"],
  in_review: ["in_progress", "done", "canceled"],
  done: ["in_progress"],
  canceled: ["backlog"],
};

function defaultWorkflow(): WorkflowConfiguration {
  return {
    schemes: Object.fromEntries(workTypes.map((type) => [type, {
      transitions: Object.fromEntries(workStatuses.map((status) => [status, [...defaultTransitions[status]]])),
      requiredFields: Object.fromEntries(workStatuses.map((status) => [status, []])),
      transitionRoles: Object.fromEntries(workStatuses.map((status) => [status, {}])),
    }])) as unknown as Record<WorkType, WorkflowScheme>,
    board: { wipLimits: {}, defaultSwimlane: "none" },
  };
}

function normalizeWipLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  if (rounded < 1) return null;
  return Math.min(rounded, maxWipLimit);
}

function workflowPreset(key: "standard" | "controlled" | "verification"): WorkflowConfiguration {
  const workflow = defaultWorkflow();
  if (key === "standard") return workflow;
  for (const type of workTypes) {
    const scheme = workflow.schemes[type];
    scheme.transitions = {
      backlog: ["ready", "canceled"],
      ready: ["backlog", "in_progress", "canceled"],
      in_progress: ["ready", "in_review", "canceled"],
      in_review: ["in_progress", "done", "canceled"],
      done: ["in_review"],
      canceled: ["backlog"],
    };
    scheme.requiredFields.ready = ["description", "assignee"];
    scheme.requiredFields.in_review = ["description", "assignee"];
    scheme.requiredFields.done = ["description", "assignee"];
    scheme.transitionRoles.in_review.done = ["project_manager"];
    if (key === "verification") {
      scheme.requiredFields.ready = ["description", "assignee", "dueAt"];
      scheme.requiredFields.done = ["description", "assignee", "dueAt"];
      scheme.transitionRoles.ready.in_progress = ["project_manager"];
      scheme.transitionRoles.in_progress.in_review = ["project_manager", "editor"];
    }
  }
  workflow.board = key === "verification"
    ? { wipLimits: { in_progress: 3, in_review: 2 }, defaultSwimlane: "assignee" }
    : { wipLimits: { in_progress: 5, in_review: 3 }, defaultSwimlane: "none" };
  return workflow;
}

const detailInclude = {
  reporter: { select: { id: true, displayName: true, email: true } },
  assignee: { select: { id: true, displayName: true, email: true } },
  project: { select: { id: true, name: true, code: true } },
  release: { select: { id: true, name: true, status: true } },
  iteration: { select: { id: true, name: true, status: true } },
  artifactLinks: {
    include: {
      document: { select: { id: true, title: true, documentType: true } },
      row: { select: { id: true, objectNumber: true, title: true, document: { select: { id: true, title: true, documentType: true } } } },
      testExecution: { select: { id: true, status: true, testCaseRow: { select: { id: true, title: true, document: { select: { id: true, title: true } } } } } },
      testStepExecution: { select: { id: true, status: true, testStepRow: { select: { id: true, title: true, document: { select: { id: true, title: true } } } }, execution: { select: { id: true } } } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  outgoingRelations: { include: { target: { select: { id: true, organizationId: true, workspaceId: true, projectId: true, key: true, title: true, status: true, type: true } } } },
  incomingRelations: { include: { source: { select: { id: true, organizationId: true, workspaceId: true, projectId: true, key: true, title: true, status: true, type: true } } } },
  comments: { where: { deletedAt: null }, include: { author: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.WorkItemInclude;

const summaryInclude = {
  reporter: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, displayName: true } },
  project: { select: { id: true, name: true, code: true } },
  parent: { select: { id: true, key: true, title: true, type: true } },
  release: { select: { id: true, name: true, status: true } },
  iteration: { select: { id: true, name: true, status: true } },
  _count: { select: { artifactLinks: true, comments: true } },
} satisfies Prisma.WorkItemInclude;

@Injectable()
export class WorkManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly projectKeys: ProjectKeyService,
    private readonly schema: WorkItemSchemaService,
    private readonly planning: ProjectPlanningService,
  ) {}

  async listWorkItems(actorId: string, workspaceId: string, query: Record<string, string | undefined>) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "work_item.read", { organizationId: workspace.organizationId, workspaceId });
    const types = this.csv(query.type, ["epic", "story", "task", "bug", "risk"] as const);
    const statuses = this.csv(query.status, ["backlog", "ready", "in_progress", "in_review", "done", "canceled"] as const);
    const priorities = this.csv(query.priority, ["lowest", "low", "medium", "high", "highest", "critical"] as const);
    const search = query.q?.trim();
    return this.prisma.workItem.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.releaseId ? { releaseId: query.releaseId === "none" ? null : query.releaseId } : {}),
        ...(query.iterationId ? { iterationId: query.iterationId === "none" ? null : query.iterationId } : {}),
        ...(types.length ? { type: { in: types } } : {}),
        ...(statuses.length ? { status: { in: statuses } } : {}),
        ...(priorities.length ? { priority: { in: priorities } } : {}),
        ...(query.assigneeId === "me" ? { assigneeId: actorId } : query.assigneeId ? { assigneeId: query.assigneeId } : {}),
        ...(search ? { OR: [{ key: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }, { labels: { has: search } }] } : {}),
      },
      include: summaryInclude,
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
  }

  async listWorkUsers(actorId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "work_item.read", { organizationId: workspace.organizationId, workspaceId });
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: workspace.organizationId, deletedAt: null, user: { isActive: true, deletedAt: null } },
      select: { user: { select: { id: true, displayName: true } } },
      orderBy: { user: { displayName: "asc" } },
    });
    return members.map((member) => member.user);
  }

  async listWorkDocuments(actorId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "work_item.read", { organizationId: workspace.organizationId, workspaceId });
    const documents = await this.prisma.document.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, title: true, documentType: true, updatedAt: true },
      orderBy: [{ title: "asc" }, { createdAt: "asc" }],
    });
    const readable = await this.access.readableDocumentIds(actorId, documents.map((document) => document.id), { organizationId: workspace.organizationId, workspaceId });
    return documents.filter((document) => readable.has(document.id));
  }

  async getWorkflow(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "work_item.read", this.projectScope(project));
    const actorRoleKeys = await this.access.roleKeys(actorId, this.projectScope(project));
    return {
      projectId,
      version: project.workflowVersion,
      customized: this.hasWorkflowConfiguration(project.workflowConfig),
      actorRoleKeys,
      ...this.effectiveWorkflow(project.workflowConfig),
    };
  }

  async getWorkflowPresets(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.manage", this.projectScope(project));
    return (["standard", "controlled", "verification"] as const).map((key) => ({
      key,
      ...workflowPreset(key),
    }));
  }

  async getWorkDashboard(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "work_item.read", this.projectScope(project));
    const activeWhere = { projectId, deletedAt: null } satisfies Prisma.WorkItemWhereInput;
    const openStatuses: WorkStatus[] = ["backlog", "ready", "in_progress", "in_review"];
    const [statusGroups, myOpenBugs, myOpenBugCount, recentItems, unassigned, criticalOpen, activePlans, requirementCount, testCaseCount, plannedTests, executionGroups, failedExecutions, openDefects, linkedEvidence] = await Promise.all([
      this.prisma.workItem.groupBy({ by: ["status"], where: activeWhere, _count: { _all: true } }),
      this.prisma.workItem.findMany({
        where: { ...activeWhere, type: "bug", assigneeId: actorId, status: { in: openStatuses } },
        include: summaryInclude,
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      this.prisma.workItem.count({ where: { ...activeWhere, type: "bug", assigneeId: actorId, status: { in: openStatuses } } }),
      this.prisma.workItem.findMany({
        where: activeWhere,
        include: summaryInclude,
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      this.prisma.workItem.count({ where: { ...activeWhere, assigneeId: null, status: { in: openStatuses } } }),
      this.prisma.workItem.count({ where: { ...activeWhere, type: "bug", priority: { in: ["critical", "highest"] }, status: { in: openStatuses } } }),
      this.prisma.testPlan.count({ where: { projectId, deletedAt: null, status: "active" } }),
      this.prisma.documentRow.count({ where: { deletedAt: null, rowType: "requirement", document: { workspaceId: project.workspaceId, deletedAt: null } } }),
      this.prisma.documentRow.count({ where: { deletedAt: null, rowType: "test_case", document: { workspaceId: project.workspaceId, deletedAt: null } } }),
      this.prisma.testPlanItem.count({ where: { deletedAt: null, testPlan: { projectId, deletedAt: null } } }),
      this.prisma.testExecution.groupBy({
        by: ["status"],
        where: { testPlanItem: { is: { deletedAt: null, testPlan: { projectId, deletedAt: null } } } },
        _count: { _all: true },
      }),
      this.prisma.testExecution.count({
        where: {
          testPlanItem: { is: { deletedAt: null, testPlan: { projectId, deletedAt: null } } },
          OR: [{ status: "failed" }, { steps: { some: { status: "failed" } } }],
        },
      }),
      this.prisma.workItem.count({ where: { ...activeWhere, type: "bug", status: { in: openStatuses } } }),
      this.prisma.workItemArtifactLink.count({ where: { workItem: { projectId, deletedAt: null } } }),
    ]);
    const statusCounts = Object.fromEntries(workStatuses.map((status) => [status, statusGroups.find((group) => group.status === status)?._count._all ?? 0])) as Record<WorkStatus, number>;
    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const completed = statusCounts.done;
    const executionCount = executionGroups.reduce((sum, group) => sum + group._count._all, 0);
    const passedExecutions = executionGroups.find((group) => group.status === "passed")?._count._all ?? 0;
    return {
      projectId,
      myOpenBugs,
      recentItems,
      statusCounts,
      metrics: {
        total,
        open: openStatuses.reduce((sum, status) => sum + statusCounts[status], 0),
        completed,
        completionRate: total ? Math.round(completed / total * 100) : 0,
        myOpenBugCount,
        unassigned,
        criticalOpen,
        activePlans,
        requirements: requirementCount,
        testCases: testCaseCount,
        plannedTests,
        executions: executionCount,
        passedExecutions,
        failedExecutions,
        executionPassRate: executionCount ? Math.round(passedExecutions / executionCount * 100) : 0,
        openDefects,
        linkedEvidence,
      },
    };
  }

  async updateWorkflow(actorId: string, projectId: string, input: { expectedVersion: number; schemes: Record<WorkType, WorkflowSchemeInput>; board?: BoardConfigurationInput }) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "work_item.manage", this.projectScope(project));
    const configuration = this.normalizeWorkflow({ schemes: input.schemes, board: input.board });
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.project.updateMany({ where: { id: projectId, workflowVersion: input.expectedVersion, deletedAt: null }, data: { workflowConfig: configuration as unknown as Prisma.InputJsonValue, workflowVersion: { increment: 1 } } });
      if (!result.count) throw new ConflictException("Workflow was changed by another user");
      await this.audit.record(tx, { organizationId: project.organizationId, workspaceId: project.workspaceId, actorId, action: "work_item.workflow_updated", entityType: "project", entityId: projectId, previousData: this.effectiveWorkflow(project.workflowConfig) as unknown as Prisma.InputJsonValue, nextData: configuration as unknown as Prisma.InputJsonValue });
    });
    return this.getWorkflow(actorId, projectId);
  }

  async createWorkItem(actorId: string, projectId: string, input: WorkItemCreate) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "work_item.write", this.projectScope(project));
    await this.assertUserInOrganization(input.assigneeId, project.organizationId);
    await this.assertUserInOrganization(input.reporterId, project.organizationId);
    if (input.parentId) await this.assertParent(input.parentId, projectId);
    if (input.releaseId) await this.planning.assertReleaseInProject(input.releaseId, projectId);
    if (input.iterationId) await this.planning.assertIterationInProject(input.iterationId, projectId);
    const artifacts = [...input.artifacts, ...(input.artifact ? [input.artifact] : [])];
    await Promise.all(artifacts.map((entry) => this.assertArtifact(actorId, entry, project.workspaceId)));
    const item = await this.prisma.$transaction(async (tx) => {
      const issued = await this.projectKeys.allocate(tx, projectId, "work_item");
      const sequence = issued.sequence;
      const typeDefinition = await tx.workItemTypeDefinition.findFirst({
        where: { projectId, key: input.typeKey ?? input.type, archivedAt: null },
        select: { id: true, key: true, baseType: true },
      });
      const customFields = await this.schema.validateCustomFields(
        tx,
        projectId,
        typeDefinition?.key ?? input.type,
        input.customFields,
      );
      const created = await tx.workItem.create({
        data: {
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          projectId,
          sequence,
          key: issued.key,
          typeDefinitionId: typeDefinition?.id ?? null,
          customFields: customFields as Prisma.InputJsonValue,
          type: typeDefinition?.baseType ?? input.type,
          title: input.title,
          description: input.description ?? null,
          stepsToReproduce: input.stepsToReproduce ?? null,
          expectedResult: input.expectedResult ?? null,
          actualResult: input.actualResult ?? null,
          environment: input.environment ?? null,
          affectedVersion: input.affectedVersion ?? null,
          priority: input.priority,
          reporterId: input.reporterId ?? actorId,
          assigneeId: input.assigneeId ?? null,
          parentId: input.parentId ?? null,
          labels: [...new Set(input.labels)],
          releaseId: input.releaseId ?? null,
          iterationId: input.iterationId ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          rank: sequence,
          artifactLinks: artifacts.length ? { create: artifacts.map((entry) => ({ ...entry, createdById: actorId })) } : undefined,
        },
      });
      if (created.assigneeId && created.assigneeId !== actorId) await tx.notification.create({ data: { organizationId: project.organizationId, recipientId: created.assigneeId, type: "assignment", payload: { entityType: "work_item", workItemId: created.id, key: created.key, title: created.title } } });
      await this.audit.record(tx, { organizationId: project.organizationId, workspaceId: project.workspaceId, actorId, action: "work_item.created", entityType: "work_item", entityId: created.id, nextData: this.auditItem(created) });
      return created;
    });
    return this.getWorkItem(actorId, item.id);
  }

  async getWorkItem(actorId: string, workItemId: string) {
    const item = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.read", this.itemScope(item));
    const detail = await this.prisma.workItem.findUniqueOrThrow({ where: { id: workItemId }, include: detailInclude });
    const linkedRowIds = detail.artifactLinks.flatMap((link) => [link.rowId, link.testExecution?.testCaseRow.id, link.testStepExecution?.testStepRow.id].filter((id): id is string => Boolean(id)));
    const directDocumentIds = detail.artifactLinks.flatMap((link) => link.documentId ? [link.documentId] : []);
    const [readableRows, readableDocuments, outgoingVisibility, incomingVisibility] = await Promise.all([
      this.access.readableRowIds(actorId, linkedRowIds),
      this.access.readableDocumentIds(actorId, directDocumentIds, { organizationId: item.organizationId, workspaceId: item.workspaceId }),
      Promise.all(detail.outgoingRelations.map((relation) => this.access.hasPermission(actorId, "work_item.read", this.itemScope(relation.target)))),
      Promise.all(detail.incomingRelations.map((relation) => this.access.hasPermission(actorId, "work_item.read", this.itemScope(relation.source)))),
    ]);
    return {
      ...detail,
      artifactLinks: detail.artifactLinks.filter((link) => link.rowId ? readableRows.has(link.rowId) : link.testExecution ? readableRows.has(link.testExecution.testCaseRow.id) : link.testStepExecution ? readableRows.has(link.testStepExecution.testStepRow.id) : link.documentId ? readableDocuments.has(link.documentId) : false),
      outgoingRelations: detail.outgoingRelations.filter((_, index) => outgoingVisibility[index]),
      incomingRelations: detail.incomingRelations.filter((_, index) => incomingVisibility[index]),
    };
  }

  async updateWorkItem(actorId: string, workItemId: string, input: WorkItemUpdate) {
    const current = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(current));
    await this.assertUserInOrganization(input.assigneeId, current.organizationId);
    await this.assertUserInOrganization(input.reporterId, current.organizationId);
    if (input.parentId === workItemId) throw new BadRequestException("A work item cannot be its own parent");
    if (input.parentId) await this.assertParent(input.parentId, current.projectId);
    if (input.releaseId) await this.planning.assertReleaseInProject(input.releaseId, current.projectId);
    if (input.iterationId) await this.planning.assertIterationInProject(input.iterationId, current.projectId);
    const { expectedVersion, ...fields } = input;
    if (fields.status && fields.status !== current.status) await this.assertWorkflowTransition(actorId, current, fields.status, fields);
    const data: Prisma.WorkItemUncheckedUpdateManyInput = {
      ...fields,
      description: fields.description === undefined ? undefined : fields.description,
      assigneeId: fields.assigneeId === undefined ? undefined : fields.assigneeId,
      parentId: fields.parentId === undefined ? undefined : fields.parentId,
      dueAt: fields.dueAt === undefined ? undefined : fields.dueAt ? new Date(fields.dueAt) : null,
      labels: fields.labels ? [...new Set(fields.labels)] : undefined,
      resolvedAt: fields.status === "done" ? new Date() : fields.status ? null : undefined,
      version: { increment: 1 },
    };
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.workItem.updateMany({ where: { id: workItemId, version: expectedVersion, deletedAt: null }, data });
      if (result.count === 0) throw new ConflictException("Work item was changed by another user");
      const updated = await tx.workItem.findUniqueOrThrow({ where: { id: workItemId } });
      if (updated.assigneeId && updated.assigneeId !== current.assigneeId && updated.assigneeId !== actorId) await tx.notification.create({ data: { organizationId: current.organizationId, recipientId: updated.assigneeId, type: "assignment", payload: { entityType: "work_item", workItemId, key: updated.key, title: updated.title } } });
      await this.audit.record(tx, { organizationId: current.organizationId, workspaceId: current.workspaceId, actorId, action: fields.status && fields.status !== current.status ? "work_item.transitioned" : "work_item.updated", entityType: "work_item", entityId: workItemId, previousData: this.auditItem(current), nextData: this.auditItem(updated), metadata: fields.status && fields.status !== current.status ? { fromStatus: current.status, toStatus: fields.status } : undefined });
    });
    return this.getWorkItem(actorId, workItemId);
  }

  async moveWorkItem(actorId: string, workItemId: string, input: { expectedVersion: number; targetStatus: WorkStatus; anchorId: string | null; position: "before" | "after" }) {
    const current = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(current));
    if (input.targetStatus !== current.status) await this.assertWorkflowTransition(actorId, current, input.targetStatus, {});
    if (input.anchorId === workItemId) throw new BadRequestException("A work item cannot be positioned relative to itself");
    if (input.anchorId) {
      const anchor = await this.requireWorkItem(input.anchorId);
      if (anchor.projectId !== current.projectId || anchor.status !== input.targetStatus) throw new BadRequestException("Move anchor must be in the same project and target status");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${current.projectId}::text, 0))`;
      const latest = await tx.workItem.findFirst({ where: { id: workItemId, deletedAt: null } });
      if (!latest || latest.version !== input.expectedVersion) throw new ConflictException("Work item was changed by another user");
      const targetItems = await tx.workItem.findMany({ where: { projectId: current.projectId, status: input.targetStatus, deletedAt: null, id: { not: workItemId } }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }], select: { id: true } });
      let insertAt = targetItems.length;
      if (input.anchorId) {
        const anchorIndex = targetItems.findIndex((item) => item.id === input.anchorId);
        if (anchorIndex === -1) throw new ConflictException("Move anchor is no longer available");
        insertAt = input.position === "before" ? anchorIndex : anchorIndex + 1;
      }
      targetItems.splice(insertAt, 0, { id: workItemId });
      await Promise.all(targetItems.map((item, index) => item.id === workItemId
        ? tx.workItem.update({ where: { id: item.id }, data: { status: input.targetStatus, rank: (index + 1) * 1024, resolvedAt: input.targetStatus === "done" ? new Date() : null, version: { increment: 1 } } })
        : tx.workItem.update({ where: { id: item.id }, data: { rank: (index + 1) * 1024 } })));
      const updated = await tx.workItem.findUniqueOrThrow({ where: { id: workItemId } });
      await this.audit.record(tx, { organizationId: current.organizationId, workspaceId: current.workspaceId, actorId, action: "work_item.moved", entityType: "work_item", entityId: workItemId, previousData: this.auditItem(current), nextData: this.auditItem(updated), metadata: { fromStatus: current.status, toStatus: input.targetStatus, anchorId: input.anchorId, position: input.position, rank: updated.rank } });
    });
    return this.getWorkItem(actorId, workItemId);
  }

  async deleteWorkItem(actorId: string, workItemId: string) {
    const item = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.manage", this.itemScope(item));
    await this.prisma.$transaction(async (tx) => {
      await tx.workItem.update({ where: { id: workItemId }, data: { deletedAt: new Date(), deletedById: actorId, version: { increment: 1 } } });
      await this.audit.record(tx, { organizationId: item.organizationId, workspaceId: item.workspaceId, actorId, action: "work_item.deleted", entityType: "work_item", entityId: workItemId, previousData: this.auditItem(item) });
    });
    return { ok: true };
  }

  async linkArtifact(actorId: string, workItemId: string, input: ArtifactInput) {
    const item = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(item));
    await this.assertArtifact(actorId, input, item.workspaceId);
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.workItemArtifactLink.create({ data: { workItemId, ...input, createdById: actorId } });
      await this.audit.record(tx, { organizationId: item.organizationId, workspaceId: item.workspaceId, actorId, action: "work_item.artifact_linked", entityType: "work_item", entityId: workItemId, metadata: { linkId: link.id, role: input.role } });
      return link;
    });
  }

  async linkArtifacts(actorId: string, workItemId: string, inputs: ArtifactInput[]) {
    const item = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(item));
    const identities = inputs.map((input) => `${input.role}:${input.documentId ?? input.rowId ?? input.testExecutionId ?? input.testStepExecutionId}`);
    if (new Set(identities).size !== identities.length) throw new BadRequestException("Duplicate artifact targets are not allowed");
    await Promise.all(inputs.map((input) => this.assertArtifact(actorId, input, item.workspaceId)));
    const existing = await this.prisma.workItemArtifactLink.findMany({
      where: {
        workItemId,
        OR: inputs.map((input) => ({
          role: input.role,
          documentId: input.documentId,
          rowId: input.rowId,
          testExecutionId: input.testExecutionId,
          testStepExecutionId: input.testStepExecutionId,
        })),
      },
      select: { id: true },
    });
    if (existing.length) throw new ConflictException("One or more artifacts are already linked");
    return this.prisma.$transaction(async (tx) => {
      const links = await Promise.all(inputs.map((input) => tx.workItemArtifactLink.create({ data: { workItemId, ...input, createdById: actorId } })));
      await this.audit.record(tx, { organizationId: item.organizationId, workspaceId: item.workspaceId, actorId, action: "work_item.artifacts_linked", entityType: "work_item", entityId: workItemId, metadata: { linkIds: links.map((link) => link.id), count: links.length } });
      return links;
    });
  }

  async linkWorkItem(actorId: string, workItemId: string, input: { targetId: string; relationType: "blocks" | "duplicates" | "relates_to" | "causes" }) {
    if (workItemId === input.targetId) throw new BadRequestException("A work item cannot link to itself");
    const [source, target] = await Promise.all([this.requireWorkItem(workItemId), this.requireWorkItem(input.targetId)]);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(source));
    if (source.organizationId !== target.organizationId) throw new BadRequestException("Cross-organization links are not allowed");
    await this.access.assertPermission(actorId, "work_item.read", this.itemScope(target));
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.workItemRelation.create({ data: { sourceId: workItemId, targetId: input.targetId, relationType: input.relationType, createdById: actorId } });
      await this.audit.record(tx, { organizationId: source.organizationId, workspaceId: source.workspaceId, actorId, action: "work_item.related", entityType: "work_item", entityId: workItemId, metadata: { relationId: link.id, targetId: input.targetId, relationType: input.relationType } });
      return link;
    });
  }

  async addComment(actorId: string, workItemId: string, input: { body: string; mentionUserIds: string[] }) {
    const item = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(item));
    const mentions = [...new Set(input.mentionUserIds.filter((id) => id !== actorId))];
    await Promise.all(mentions.map((id) => this.assertUserInOrganization(id, item.organizationId)));
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workItemComment.create({ data: { organizationId: item.organizationId, workItemId, authorId: actorId, body: input.body, mentions } });
      if (mentions.length) await tx.notification.createMany({ data: mentions.map((recipientId) => ({ organizationId: item.organizationId, recipientId, type: "mention" as const, payload: { entityType: "work_item", workItemId, commentId: created.id, key: item.key, title: item.title } })) });
      await this.audit.record(tx, { organizationId: item.organizationId, workspaceId: item.workspaceId, actorId, action: "work_item.comment_added", entityType: "work_item", entityId: workItemId, metadata: { commentId: created.id, mentionCount: mentions.length } });
      return created;
    });
  }

  async listTestPlans(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "test_plan.read", this.projectScope(project));
    return this.prisma.testPlan.findMany({ where: { projectId, deletedAt: null }, include: { owner: { select: { id: true, displayName: true } }, _count: { select: { items: { where: { deletedAt: null } } } } }, orderBy: { createdAt: "desc" } });
  }

  async createTestPlan(actorId: string, projectId: string, input: { name: string; description?: string; environment?: string; buildReference?: string; startsAt?: string | null; endsAt?: string | null }) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "test_plan.write", this.projectScope(project));
    const plan = await this.prisma.$transaction(async (tx) => {
      const issued = await this.projectKeys.allocate(tx, projectId, "test_plan");
      const sequence = issued.sequence;
      const created = await tx.testPlan.create({ data: { organizationId: project.organizationId, workspaceId: project.workspaceId, projectId, sequence, key: issued.key, name: input.name, description: input.description ?? null, ownerId: actorId, environment: input.environment, buildReference: input.buildReference, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null } });
      await this.audit.record(tx, { organizationId: project.organizationId, workspaceId: project.workspaceId, actorId, action: "test_plan.created", entityType: "test_plan", entityId: created.id, nextData: { key: created.key, name: created.name, status: created.status } });
      return created;
    });
    return this.getTestPlan(actorId, plan.id);
  }

  async getTestPlan(actorId: string, testPlanId: string) {
    const plan = await this.requireTestPlan(testPlanId);
    await this.access.assertPermission(actorId, "test_plan.read", this.itemScope(plan));
    const detail = await this.prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId }, include: { project: { select: { id: true, name: true, code: true } }, owner: { select: { id: true, displayName: true } }, items: { where: { deletedAt: null }, include: { assignee: { select: { id: true, displayName: true } }, testCaseRow: { select: { id: true, title: true, objectNumber: true, document: { select: { id: true, title: true } } } }, executions: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { rank: "asc" } } } });
    const readableRows = await this.access.readableRowIds(actorId, detail.items.map((entry) => entry.testCaseRowId));
    return { ...detail, items: detail.items.filter((entry) => readableRows.has(entry.testCaseRowId)) };
  }

  async updateTestPlan(actorId: string, testPlanId: string, input: { expectedVersion: number; name?: string; description?: string | null; status?: "draft" | "active" | "completed" | "canceled"; environment?: string | null; buildReference?: string | null }) {
    const plan = await this.requireTestPlan(testPlanId);
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(plan));
    const { expectedVersion, ...data } = input;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.testPlan.updateMany({ where: { id: testPlanId, version: expectedVersion, deletedAt: null }, data: { ...data, version: { increment: 1 } } });
      if (!result.count) throw new ConflictException("Test plan was changed by another user");
      const next = await tx.testPlan.findUniqueOrThrow({ where: { id: testPlanId } });
      await this.audit.record(tx, { organizationId: plan.organizationId, workspaceId: plan.workspaceId, actorId, action: "test_plan.updated", entityType: "test_plan", entityId: testPlanId, previousData: { name: plan.name, status: plan.status, version: plan.version }, nextData: { name: next.name, status: next.status, version: next.version } });
    });
    return this.getTestPlan(actorId, testPlanId);
  }

  async addTestPlanItem(actorId: string, testPlanId: string, input: { testCaseRowId: string; assigneeId?: string | null; environment?: string; iteration?: string; iterationId?: string | null }) {
    const plan = await this.requireTestPlan(testPlanId);
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(plan));
    await this.assertUserInOrganization(input.assigneeId, plan.organizationId);
    const row = await this.prisma.documentRow.findFirst({ where: { id: input.testCaseRowId, deletedAt: null }, include: { document: true } });
    if (!row || row.document.workspaceId !== plan.workspaceId || row.document.documentType !== "test" || !["heading", "test_case"].includes(row.rowType)) throw new BadRequestException("Test plan items must reference a test heading in the same workspace");
    await this.access.assertRowAccess(actorId, row.id, "read");
    const rank = await this.prisma.testPlanItem.count({ where: { testPlanId, deletedAt: null } }) + 1;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.testPlanItem.create({ data: { testPlanId, testCaseRowId: row.id, assigneeId: input.assigneeId ?? null, environment: input.environment, iterationLabel: input.iteration, iterationId: input.iterationId ?? null, rank } });
      await this.audit.record(tx, { organizationId: plan.organizationId, workspaceId: plan.workspaceId, actorId, action: "test_plan.item_added", entityType: "test_plan", entityId: testPlanId, metadata: { itemId: item.id, testCaseRowId: row.id } });
      return item;
    });
  }

  async listTestPlanCandidates(actorId: string, testPlanId: string, query: string) {
    const plan = await this.requireTestPlan(testPlanId);
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(plan));
    const rows = await this.prisma.documentRow.findMany({
      where: { deletedAt: null, document: { workspaceId: plan.workspaceId, documentType: "test", deletedAt: null } },
      select: { id: true, parentId: true, rowType: true, title: true, objectNumber: true, customFields: true, document: { select: { id: true, title: true } } },
      orderBy: [{ documentId: "asc" }, { rank: "asc" }],
      take: 10000,
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const scenarios = new Map<string, typeof rows[number] & { stepCount: number }>();
    for (const row of rows) {
      if (row.rowType !== "test_step") continue;
      const scenario = resolveTestScenario(row.id, rowsById);
      if (!scenario || !["heading", "test_case"].includes(scenario.rowType)) continue;
      const full = rowsById.get(scenario.id);
      if (!full) continue;
      const current = scenarios.get(full.id);
      scenarios.set(full.id, { ...full, stepCount: (current?.stepCount ?? 0) + 1 });
    }
    const existing = new Set((await this.prisma.testPlanItem.findMany({ where: { testPlanId, deletedAt: null }, select: { testCaseRowId: true } })).map((item) => item.testCaseRowId));
    const normalized = query.trim().toLocaleLowerCase();
    const candidates = [...scenarios.values()].filter((row) => !existing.has(row.id) && (!normalized || `${row.title} ${row.objectNumber} ${row.document.title}`.toLocaleLowerCase().includes(normalized)));
    const readable = await this.access.readableRowIds(actorId, candidates.map((candidate) => candidate.id));
    return candidates.filter((candidate) => readable.has(candidate.id)).slice(0, 100).map((candidate) => ({ id: candidate.id, title: candidate.title, objectNumber: candidate.objectNumber, stepCount: candidate.stepCount, document: candidate.document }));
  }

  async removeTestPlanItem(actorId: string, itemId: string) {
    const item = await this.prisma.testPlanItem.findUnique({ where: { id: itemId }, include: { testPlan: true, _count: { select: { executions: true } } } });
    if (!item || item.deletedAt || item.testPlan.deletedAt) throw new NotFoundException("Test plan item not found");
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(item.testPlan));
    if (item._count.executions > 0) throw new ConflictException("A test with execution history cannot be removed from its plan");
    await this.prisma.$transaction(async (tx) => {
      await tx.testPlanItem.update({ where: { id: itemId }, data: { deletedAt: new Date(), deletedById: actorId } });
      await this.audit.record(tx, { organizationId: item.testPlan.organizationId, workspaceId: item.testPlan.workspaceId, actorId, action: "test_plan.item_removed", entityType: "test_plan", entityId: item.testPlanId, metadata: { itemId, testCaseRowId: item.testCaseRowId } });
    });
    return { ok: true };
  }

  async startPlannedExecution(actorId: string, itemId: string) {
    const item = await this.prisma.testPlanItem.findUnique({ where: { id: itemId }, include: { testPlan: true, testCaseRow: { include: { document: true } } } });
    if (!item || item.deletedAt || item.testPlan.deletedAt) throw new NotFoundException("Test plan item not found");
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(item.testPlan));
    await this.access.assertRowAccess(actorId, item.testCaseRowId, "write");
    const steps = await this.prisma.documentRow.findMany({ where: { documentId: item.testCaseRow.documentId, rowType: "test_step", deletedAt: null, OR: [{ parentId: item.testCaseRowId }, { ancestorPath: { startsWith: `${item.testCaseRow.ancestorPath}${item.testCaseRowId}/` } }] }, orderBy: { rank: "asc" } });
    if (!steps.length) throw new BadRequestException("The planned test does not contain test steps");
    return this.prisma.$transaction(async (tx) => {
      const issued = await this.projectKeys.allocate(tx, item.testPlan.projectId, "test_execution");
      const execution = await tx.testExecution.create({ data: { organizationId: item.testPlan.organizationId, projectId: item.testPlan.projectId, sequence: issued.sequence, key: issued.key, testCaseRowId: item.testCaseRowId, executedById: actorId, testPlanItemId: item.id, status: "running", environment: item.environment ?? item.testPlan.environment, buildReference: item.testPlan.buildReference, iterationLabel: item.iterationLabel, iterationId: item.iterationId, startedAt: new Date(), steps: { create: steps.map((step) => ({ testStepRowId: step.id })) } }, include: { steps: true } });
      if (item.testPlan.status === "draft") await tx.testPlan.update({ where: { id: item.testPlanId }, data: { status: "active", version: { increment: 1 } } });
      await this.audit.record(tx, { organizationId: item.testPlan.organizationId, workspaceId: item.testPlan.workspaceId, actorId, action: "test_plan.execution_started", entityType: "test_execution", entityId: execution.id, metadata: { testPlanId: item.testPlanId, testPlanItemId: item.id } });
      return execution;
    });
  }

  async listExecutionDefectProjects(actorId: string, executionId: string) {
    const execution = await this.prisma.testExecution.findUnique({ where: { id: executionId }, include: { testCaseRow: { include: { document: true } } } });
    if (!execution) throw new NotFoundException("Test execution not found");
    await this.access.assertRowAccess(actorId, execution.testCaseRowId, "read");
    const projects = await this.prisma.project.findMany({ where: { workspaceId: execution.testCaseRow.document.workspaceId, deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
    const allowed = await Promise.all(projects.map((project) => this.access.hasPermission(actorId, "work_item.write", { organizationId: execution.organizationId, workspaceId: execution.testCaseRow.document.workspaceId, projectId: project.id })));
    return projects.filter((_, index) => allowed[index]);
  }

  async createInternalDefect(actorId: string, executionId: string, stepRowId: string, input: InternalDefectInput) {
    const step = await this.prisma.testStepExecution.findUnique({
      where: { executionId_testStepRowId: { executionId, testStepRowId: stepRowId } },
      include: {
        testStepRow: { include: { testStepDetail: true } },
        execution: { include: { testCaseRow: { include: { document: true } } } },
      },
    });
    if (!step) throw new NotFoundException("Execution step not found");
    if (step.status !== "failed") throw new UnprocessableEntityException("An internal defect can only be created from a failed test step");
    const project = await this.requireProject(input.projectId);
    const document = step.execution.testCaseRow.document;
    if (project.workspaceId !== document.workspaceId || project.organizationId !== step.execution.organizationId) throw new BadRequestException("Defect project is outside the execution workspace");
    await this.access.assertPermission(actorId, "work_item.write", this.projectScope(project));
    await this.access.assertRowAccess(actorId, stepRowId, "read");
    await this.assertUserInOrganization(input.assigneeId, project.organizationId);
    const created = await this.prisma.$transaction(async (tx) => {
      const issued = await this.projectKeys.allocate(tx, project.id, "work_item");
      const sequence = issued.sequence;
      const item = await tx.workItem.create({
        data: {
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          sequence,
          key: issued.key,
          type: "bug",
          title: input.title,
          description: input.description ?? null,
          stepsToReproduce: step.testStepRow.testStepDetail?.action ?? step.testStepRow.title,
          expectedResult: step.testStepRow.testStepDetail?.expectedResult ?? null,
          actualResult: step.actualResult,
          environment: step.execution.environment,
          affectedVersion: step.execution.buildReference,
          priority: input.priority,
          reporterId: actorId,
          assigneeId: input.assigneeId ?? null,
          rank: sequence,
          artifactLinks: { create: { testStepExecutionId: step.id, role: "found_in", createdById: actorId } },
        },
      });
      if (item.assigneeId && item.assigneeId !== actorId) await tx.notification.create({ data: { organizationId: project.organizationId, recipientId: item.assigneeId, type: "assignment", payload: { entityType: "work_item", workItemId: item.id, key: item.key, title: item.title } } });
      if (step.execution.status === "running") {
        const currentEvidence = Array.isArray(step.evidence) ? step.evidence : [];
        const evidence = [...currentEvidence, { id: randomUUID(), kind: "defect", addedAt: new Date().toISOString(), addedById: actorId, reference: item.key, summary: item.title, workItemId: item.id }];
        await tx.testStepExecution.update({ where: { id: step.id }, data: { evidence: evidence as Prisma.InputJsonValue } });
      }
      await this.audit.record(tx, { organizationId: project.organizationId, workspaceId: project.workspaceId, actorId, action: "work_item.created", entityType: "work_item", entityId: item.id, nextData: this.auditItem(item), metadata: { source: "test_step_execution", executionId, stepRowId, testStepExecutionId: step.id } });
      return item;
    });
    return this.getWorkItem(actorId, created.id);
  }

  private async assertWorkflowTransition(actorId: string, current: { projectId: string; type: WorkType; status: WorkStatus; description: string | null; assigneeId: string | null; dueAt: Date | null }, targetStatus: WorkStatus, fields: Partial<WorkItemUpdate>) {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: current.projectId },
      select: { id: true, organizationId: true, workspaceId: true, workflowConfig: true },
    });
    const scheme = this.effectiveWorkflow(project.workflowConfig).schemes[fields.type ?? current.type];
    if (!scheme.transitions[current.status].includes(targetStatus)) throw new UnprocessableEntityException(`Transition from ${current.status} to ${targetStatus} is not allowed`);
    const allowedRoles = scheme.transitionRoles[current.status][targetStatus] ?? [];
    if (allowedRoles.length) {
      const actorRoles = await this.access.roleKeys(actorId, this.projectScope(project));
      const administratorRoles = ["system_admin", "organization_admin", "workspace_admin"];
      if (!actorRoles.some((role) => administratorRoles.includes(role) || allowedRoles.includes(role as WorkflowRole))) {
        throw new ForbiddenException("Your project role cannot perform this workflow transition");
      }
    }
    const values = {
      description: fields.description === undefined ? current.description : fields.description,
      assignee: fields.assigneeId === undefined ? current.assigneeId : fields.assigneeId,
      dueAt: fields.dueAt === undefined ? current.dueAt : fields.dueAt,
    };
    const missing = scheme.requiredFields[targetStatus].filter((field) => !values[field] || typeof values[field] === "string" && !values[field]?.trim());
    if (missing.length) throw new UnprocessableEntityException(`Required fields for ${targetStatus}: ${missing.join(", ")}`);
  }

  private hasWorkflowConfiguration(value: Prisma.JsonValue) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
  }

  private normalizeWorkflow(configuration: { schemes: Record<WorkType, WorkflowSchemeInput>; board?: BoardConfigurationInput }): WorkflowConfiguration {
    const defaults = defaultWorkflow();
    return {
      board: {
        wipLimits: Object.fromEntries(workStatuses.flatMap((status) => {
          const limit = normalizeWipLimit(configuration.board?.wipLimits?.[status]);
          return limit === null ? [] : [[status, limit]];
        })),
        defaultSwimlane: boardSwimlanes.includes(configuration.board?.defaultSwimlane as BoardSwimlane)
          ? configuration.board!.defaultSwimlane as BoardSwimlane
          : "none",
      },
      schemes: Object.fromEntries(workTypes.map((type) => {
        const input = configuration.schemes[type];
        return [type, {
          transitions: Object.fromEntries(workStatuses.map((status) => [status, [...new Set((input.transitions[status] ?? defaults.schemes[type].transitions[status]).filter((target) => target !== status))]])) as Record<WorkStatus, WorkStatus[]>,
          requiredFields: Object.fromEntries(workStatuses.map((status) => [status, [...new Set(input.requiredFields[status] ?? [])]])) as Record<WorkStatus, WorkflowRequiredField[]>,
          transitionRoles: Object.fromEntries(workStatuses.map((from) => [
            from,
            Object.fromEntries(workStatuses
              .filter((to) => to !== from)
              .map((to) => [
                to,
                [...new Set((input.transitionRoles[from]?.[to] ?? []).filter((role): role is WorkflowRole => role === "project_manager" || role === "editor"))],
              ])
              .filter(([, roles]) => (roles as WorkflowRole[]).length)),
          ])) as WorkflowTransitionRoles,
        }];
      })) as unknown as Record<WorkType, WorkflowScheme>,
    };
  }

  private effectiveWorkflow(value: Prisma.JsonValue): WorkflowConfiguration {
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaultWorkflow();
    const rawSchemes = "schemes" in value && value.schemes && typeof value.schemes === "object" && !Array.isArray(value.schemes) ? value.schemes : null;
    if (!rawSchemes) return { ...defaultWorkflow(), board: this.effectiveBoard(value) };
    const defaults = defaultWorkflow();
    const schemes = Object.fromEntries(workTypes.map((type) => {
      const rawScheme = type in rawSchemes && rawSchemes[type] && typeof rawSchemes[type] === "object" && !Array.isArray(rawSchemes[type]) ? rawSchemes[type] : null;
      const rawTransitions = rawScheme && "transitions" in rawScheme && rawScheme.transitions && typeof rawScheme.transitions === "object" && !Array.isArray(rawScheme.transitions) ? rawScheme.transitions : null;
      const rawRequired = rawScheme && "requiredFields" in rawScheme && rawScheme.requiredFields && typeof rawScheme.requiredFields === "object" && !Array.isArray(rawScheme.requiredFields) ? rawScheme.requiredFields : null;
      const rawTransitionRoles = rawScheme && "transitionRoles" in rawScheme && rawScheme.transitionRoles && typeof rawScheme.transitionRoles === "object" && !Array.isArray(rawScheme.transitionRoles) ? rawScheme.transitionRoles : null;
      const transitions = Object.fromEntries(workStatuses.map((status) => {
        const candidates = rawTransitions && status in rawTransitions && Array.isArray(rawTransitions[status]) ? rawTransitions[status] : defaults.schemes[type].transitions[status];
        return [status, [...new Set(candidates.filter((entry): entry is WorkStatus => typeof entry === "string" && workStatuses.includes(entry as WorkStatus) && entry !== status))]];
      })) as Record<WorkStatus, WorkStatus[]>;
      const requiredFields = Object.fromEntries(workStatuses.map((status) => {
        const candidates = rawRequired && status in rawRequired && Array.isArray(rawRequired[status]) ? rawRequired[status] : [];
        return [status, [...new Set(candidates.filter((entry): entry is WorkflowRequiredField => entry === "description" || entry === "assignee" || entry === "dueAt"))]];
      })) as Record<WorkStatus, WorkflowRequiredField[]>;
      const transitionRoles = Object.fromEntries(workStatuses.map((from) => {
        const byTarget = rawTransitionRoles && from in rawTransitionRoles && rawTransitionRoles[from] && typeof rawTransitionRoles[from] === "object" && !Array.isArray(rawTransitionRoles[from])
          ? rawTransitionRoles[from] as Record<string, unknown>
          : null;
        return [from, Object.fromEntries(workStatuses.flatMap((to) => {
          const candidates = byTarget && Array.isArray(byTarget[to]) ? byTarget[to] : [];
          const roles = [...new Set(candidates.filter((entry): entry is WorkflowRole => entry === "project_manager" || entry === "editor"))];
          return roles.length ? [[to, roles]] : [];
        }))];
      })) as WorkflowTransitionRoles;
      return [type, { transitions, requiredFields, transitionRoles }];
    })) as unknown as Record<WorkType, WorkflowScheme>;
    return { schemes, board: this.effectiveBoard(value) };
  }

  private effectiveBoard(value: Prisma.JsonValue): BoardConfiguration {
    const raw = value && typeof value === "object" && !Array.isArray(value) && "board" in value && value.board && typeof value.board === "object" && !Array.isArray(value.board)
      ? value.board as Record<string, unknown>
      : null;
    const rawLimits = raw && raw.wipLimits && typeof raw.wipLimits === "object" && !Array.isArray(raw.wipLimits)
      ? raw.wipLimits as Record<string, unknown>
      : null;
    return {
      wipLimits: Object.fromEntries(workStatuses.flatMap((status) => {
        const limit = normalizeWipLimit(rawLimits?.[status]);
        return limit === null ? [] : [[status, limit]];
      })),
      defaultSwimlane: boardSwimlanes.includes(raw?.defaultSwimlane as BoardSwimlane)
        ? raw!.defaultSwimlane as BoardSwimlane
        : "none",
    };
  }

  private async assertArtifact(actorId: string, input: ArtifactInput, workspaceId: string) {
    if (input.rowId) {
      const row = await this.prisma.documentRow.findFirst({ where: { id: input.rowId, deletedAt: null }, include: { document: true } });
      if (!row || row.document.workspaceId !== workspaceId) throw new BadRequestException("Artifact row is outside the project workspace");
      await this.access.assertRowAccess(actorId, row.id, "read");
    }
    if (input.documentId) {
      const document = await this.prisma.document.findFirst({ where: { id: input.documentId, workspaceId, deletedAt: null } });
      if (!document) throw new BadRequestException("Artifact document is outside the project workspace");
      await this.access.assertPermission(actorId, "document.read", { organizationId: document.organizationId, workspaceId, documentId: document.id });
    }
    if (input.testExecutionId) {
      const execution = await this.prisma.testExecution.findUnique({ where: { id: input.testExecutionId }, include: { testCaseRow: { include: { document: true } } } });
      if (!execution || execution.testCaseRow.document.workspaceId !== workspaceId) throw new BadRequestException("Test execution is outside the project workspace");
      await this.access.assertRowAccess(actorId, execution.testCaseRowId, "read");
    }
    if (input.testStepExecutionId) {
      const step = await this.prisma.testStepExecution.findUnique({ where: { id: input.testStepExecutionId }, include: { testStepRow: { include: { document: true } } } });
      if (!step || step.testStepRow.document.workspaceId !== workspaceId) throw new BadRequestException("Test step execution is outside the project workspace");
      await this.access.assertRowAccess(actorId, step.testStepRowId, "read");
    }
  }

  private async assertUserInOrganization(userId: string | null | undefined, organizationId: string) {
    if (!userId) return;
    const member = await this.prisma.organizationMember.findFirst({ where: { organizationId, userId, deletedAt: null, user: { isActive: true, deletedAt: null } } });
    if (!member) throw new BadRequestException("Selected user is not an active organization member");
  }

  private async assertParent(parentId: string, projectId: string) {
    const parent = await this.prisma.workItem.findFirst({ where: { id: parentId, projectId, deletedAt: null } });
    if (!parent) throw new BadRequestException("Parent work item is outside the project");
  }

  private async requireWorkspace(id: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  private async requireProject(id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async requireWorkItem(id: string) {
    const item = await this.prisma.workItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new NotFoundException("Work item not found");
    return item;
  }

  private async requireTestPlan(id: string) {
    const plan = await this.prisma.testPlan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) throw new NotFoundException("Test plan not found");
    return plan;
  }

  private projectScope(project: { organizationId: string; workspaceId: string; id: string }) {
    return { organizationId: project.organizationId, workspaceId: project.workspaceId, projectId: project.id };
  }

  private itemScope(item: { organizationId: string; workspaceId: string; projectId: string }) {
    return { organizationId: item.organizationId, workspaceId: item.workspaceId, projectId: item.projectId };
  }

  private auditItem(item: { key: string; type: string; status: string; priority: string; title: string; reporterId: string; assigneeId: string | null; environment: string | null; affectedVersion: string | null; version: number }) {
    return { key: item.key, type: item.type, status: item.status, priority: item.priority, title: item.title, reporterId: item.reporterId, assigneeId: item.assigneeId, environment: item.environment, affectedVersion: item.affectedVersion, version: item.version };
  }

  private csv<const T extends readonly string[]>(value: string | undefined, allowed: T): T[number][] {
    if (!value) return [];
    const allowedSet = new Set<string>(allowed);
    return value.split(",").filter((entry): entry is T[number] => allowedSet.has(entry));
  }
}
