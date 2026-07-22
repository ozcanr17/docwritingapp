import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@docsys/database";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

type ArtifactInput = { documentId?: string; rowId?: string; testExecutionId?: string; role: "relates_to" | "affects" | "found_in" | "verifies" };
type WorkItemCreate = {
  type: "epic" | "story" | "task" | "bug" | "risk";
  title: string;
  description?: string;
  priority: "lowest" | "low" | "medium" | "high" | "highest" | "critical";
  assigneeId?: string | null;
  parentId?: string | null;
  labels: string[];
  dueAt?: string | null;
  artifact?: ArtifactInput;
};
type WorkItemUpdate = {
  expectedVersion: number;
  type?: WorkItemCreate["type"];
  status?: "backlog" | "ready" | "in_progress" | "in_review" | "done" | "canceled";
  priority?: WorkItemCreate["priority"];
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  parentId?: string | null;
  labels?: string[];
  dueAt?: string | null;
};

const detailInclude = {
  reporter: { select: { id: true, displayName: true, email: true } },
  assignee: { select: { id: true, displayName: true, email: true } },
  project: { select: { id: true, name: true, code: true } },
  artifactLinks: {
    include: {
      document: { select: { id: true, title: true, documentType: true } },
      row: { select: { id: true, objectNumber: true, title: true, document: { select: { id: true, title: true, documentType: true } } } },
      testExecution: { select: { id: true, status: true, testCaseRow: { select: { id: true, title: true, document: { select: { id: true, title: true } } } } } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  outgoingRelations: { include: { target: { select: { id: true, organizationId: true, workspaceId: true, projectId: true, key: true, title: true, status: true, type: true } } } },
  incomingRelations: { include: { source: { select: { id: true, organizationId: true, workspaceId: true, projectId: true, key: true, title: true, status: true, type: true } } } },
  comments: { where: { deletedAt: null }, include: { author: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.WorkItemInclude;

@Injectable()
export class WorkManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
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
        ...(types.length ? { type: { in: types } } : {}),
        ...(statuses.length ? { status: { in: statuses } } : {}),
        ...(priorities.length ? { priority: { in: priorities } } : {}),
        ...(query.assigneeId === "me" ? { assigneeId: actorId } : query.assigneeId ? { assigneeId: query.assigneeId } : {}),
        ...(search ? { OR: [{ key: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }, { labels: { has: search } }] } : {}),
      },
      include: { reporter: { select: { id: true, displayName: true } }, assignee: { select: { id: true, displayName: true } }, project: { select: { id: true, name: true, code: true } }, _count: { select: { artifactLinks: true, comments: true } } },
      orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
  }

  async createWorkItem(actorId: string, projectId: string, input: WorkItemCreate) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "work_item.write", this.projectScope(project));
    await this.assertUserInOrganization(input.assigneeId, project.organizationId);
    if (input.parentId) await this.assertParent(input.parentId, projectId);
    if (input.artifact) await this.assertArtifact(actorId, input.artifact, project.workspaceId);
    const item = await this.prisma.$transaction(async (tx) => {
      const numberedProject = await tx.project.update({ where: { id: projectId }, data: { nextWorkItemNumber: { increment: 1 } }, select: { nextWorkItemNumber: true } });
      const sequence = numberedProject.nextWorkItemNumber - 1;
      const created = await tx.workItem.create({
        data: {
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          projectId,
          sequence,
          key: `${project.code.toLocaleUpperCase()}-${sequence}`,
          type: input.type,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
          reporterId: actorId,
          assigneeId: input.assigneeId ?? null,
          parentId: input.parentId ?? null,
          labels: [...new Set(input.labels)],
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          rank: sequence,
          artifactLinks: input.artifact ? { create: { ...input.artifact, createdById: actorId } } : undefined,
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
    const linkedRowIds = detail.artifactLinks.flatMap((link) => [link.rowId, link.testExecution?.testCaseRow.id].filter((id): id is string => Boolean(id)));
    const directDocumentIds = detail.artifactLinks.flatMap((link) => link.documentId ? [link.documentId] : []);
    const [readableRows, readableDocuments, outgoingVisibility, incomingVisibility] = await Promise.all([
      this.access.readableRowIds(actorId, linkedRowIds),
      this.access.readableDocumentIds(actorId, directDocumentIds, { organizationId: item.organizationId, workspaceId: item.workspaceId }),
      Promise.all(detail.outgoingRelations.map((relation) => this.access.hasPermission(actorId, "work_item.read", this.itemScope(relation.target)))),
      Promise.all(detail.incomingRelations.map((relation) => this.access.hasPermission(actorId, "work_item.read", this.itemScope(relation.source)))),
    ]);
    return {
      ...detail,
      artifactLinks: detail.artifactLinks.filter((link) => link.rowId ? readableRows.has(link.rowId) : link.testExecution ? readableRows.has(link.testExecution.testCaseRow.id) : link.documentId ? readableDocuments.has(link.documentId) : false),
      outgoingRelations: detail.outgoingRelations.filter((_, index) => outgoingVisibility[index]),
      incomingRelations: detail.incomingRelations.filter((_, index) => incomingVisibility[index]),
    };
  }

  async updateWorkItem(actorId: string, workItemId: string, input: WorkItemUpdate) {
    const current = await this.requireWorkItem(workItemId);
    await this.access.assertPermission(actorId, "work_item.write", this.itemScope(current));
    await this.assertUserInOrganization(input.assigneeId, current.organizationId);
    if (input.parentId === workItemId) throw new BadRequestException("A work item cannot be its own parent");
    if (input.parentId) await this.assertParent(input.parentId, current.projectId);
    const { expectedVersion, ...fields } = input;
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
      await this.audit.record(tx, { organizationId: current.organizationId, workspaceId: current.workspaceId, actorId, action: "work_item.updated", entityType: "work_item", entityId: workItemId, previousData: this.auditItem(current), nextData: this.auditItem(updated) });
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
    return this.prisma.testPlan.findMany({ where: { projectId, deletedAt: null }, include: { owner: { select: { id: true, displayName: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" } });
  }

  async createTestPlan(actorId: string, projectId: string, input: { name: string; description?: string; environment?: string; buildReference?: string; startsAt?: string | null; endsAt?: string | null }) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "test_plan.write", this.projectScope(project));
    const plan = await this.prisma.$transaction(async (tx) => {
      const numbered = await tx.project.update({ where: { id: projectId }, data: { nextTestPlanNumber: { increment: 1 } }, select: { nextTestPlanNumber: true } });
      const sequence = numbered.nextTestPlanNumber - 1;
      const created = await tx.testPlan.create({ data: { organizationId: project.organizationId, workspaceId: project.workspaceId, projectId, sequence, key: `${project.code.toLocaleUpperCase()}-TP-${sequence}`, name: input.name, description: input.description ?? null, ownerId: actorId, environment: input.environment, buildReference: input.buildReference, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null } });
      await this.audit.record(tx, { organizationId: project.organizationId, workspaceId: project.workspaceId, actorId, action: "test_plan.created", entityType: "test_plan", entityId: created.id, nextData: { key: created.key, name: created.name, status: created.status } });
      return created;
    });
    return this.getTestPlan(actorId, plan.id);
  }

  async getTestPlan(actorId: string, testPlanId: string) {
    const plan = await this.requireTestPlan(testPlanId);
    await this.access.assertPermission(actorId, "test_plan.read", this.itemScope(plan));
    const detail = await this.prisma.testPlan.findUniqueOrThrow({ where: { id: testPlanId }, include: { project: { select: { id: true, name: true, code: true } }, owner: { select: { id: true, displayName: true } }, items: { include: { assignee: { select: { id: true, displayName: true } }, testCaseRow: { select: { id: true, title: true, objectNumber: true, document: { select: { id: true, title: true } } } }, executions: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { rank: "asc" } } } });
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

  async addTestPlanItem(actorId: string, testPlanId: string, input: { testCaseRowId: string; assigneeId?: string | null; environment?: string; iteration?: string }) {
    const plan = await this.requireTestPlan(testPlanId);
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(plan));
    await this.assertUserInOrganization(input.assigneeId, plan.organizationId);
    const row = await this.prisma.documentRow.findFirst({ where: { id: input.testCaseRowId, deletedAt: null }, include: { document: true } });
    if (!row || row.document.workspaceId !== plan.workspaceId || row.document.documentType !== "test" || !["heading", "test_case"].includes(row.rowType)) throw new BadRequestException("Test plan items must reference a test heading in the same workspace");
    await this.access.assertRowAccess(actorId, row.id, "read");
    const rank = await this.prisma.testPlanItem.count({ where: { testPlanId } }) + 1;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.testPlanItem.create({ data: { testPlanId, testCaseRowId: row.id, assigneeId: input.assigneeId ?? null, environment: input.environment, iteration: input.iteration, rank } });
      await this.audit.record(tx, { organizationId: plan.organizationId, workspaceId: plan.workspaceId, actorId, action: "test_plan.item_added", entityType: "test_plan", entityId: testPlanId, metadata: { itemId: item.id, testCaseRowId: row.id } });
      return item;
    });
  }

  async startPlannedExecution(actorId: string, itemId: string) {
    const item = await this.prisma.testPlanItem.findUnique({ where: { id: itemId }, include: { testPlan: true, testCaseRow: { include: { document: true } } } });
    if (!item || item.testPlan.deletedAt) throw new NotFoundException("Test plan item not found");
    await this.access.assertPermission(actorId, "test_plan.write", this.itemScope(item.testPlan));
    await this.access.assertRowAccess(actorId, item.testCaseRowId, "write");
    const steps = await this.prisma.documentRow.findMany({ where: { documentId: item.testCaseRow.documentId, rowType: "test_step", deletedAt: null, OR: [{ parentId: item.testCaseRowId }, { ancestorPath: { startsWith: `${item.testCaseRow.ancestorPath}${item.testCaseRowId}/` } }] }, orderBy: { rank: "asc" } });
    if (!steps.length) throw new BadRequestException("The planned test does not contain test steps");
    return this.prisma.$transaction(async (tx) => {
      const execution = await tx.testExecution.create({ data: { organizationId: item.testPlan.organizationId, testCaseRowId: item.testCaseRowId, executedById: actorId, testPlanItemId: item.id, status: "running", environment: item.environment ?? item.testPlan.environment, buildReference: item.testPlan.buildReference, iteration: item.iteration, startedAt: new Date(), steps: { create: steps.map((step) => ({ testStepRowId: step.id })) } }, include: { steps: true } });
      if (item.testPlan.status === "draft") await tx.testPlan.update({ where: { id: item.testPlanId }, data: { status: "active", version: { increment: 1 } } });
      await this.audit.record(tx, { organizationId: item.testPlan.organizationId, workspaceId: item.testPlan.workspaceId, actorId, action: "test_plan.execution_started", entityType: "test_execution", entityId: execution.id, metadata: { testPlanId: item.testPlanId, testPlanItemId: item.id } });
      return execution;
    });
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

  private auditItem(item: { key: string; type: string; status: string; priority: string; title: string; assigneeId: string | null; version: number }) {
    return { key: item.key, type: item.type, status: item.status, priority: item.priority, title: item.title, assigneeId: item.assigneeId, version: item.version };
  }

  private csv<const T extends readonly string[]>(value: string | undefined, allowed: T): T[number][] {
    if (!value) return [];
    const allowedSet = new Set<string>(allowed);
    return value.split(",").filter((entry): entry is T[number] => allowedSet.has(entry));
  }
}
