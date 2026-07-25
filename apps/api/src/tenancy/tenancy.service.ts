import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@docsys/database";
import { hash } from "bcryptjs";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async createOrganization(actorId: string, name: string, slug: string) {
    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name, slug } });
      await tx.organizationMember.create({ data: { organizationId: org.id, userId: actorId } });
      await this.audit.record(tx, {
        organizationId: org.id,
        actorId,
        action: "organization.created",
        entityType: "organization",
        entityId: org.id,
        nextData: { name, slug },
      });
      return org;
    });
    await this.access.grantRole(actorId, "organization_admin", { organizationId: organization.id }, "organization");
    return organization;
  }

  async listOrganizations(actorId: string) {
    return this.prisma.organization.findMany({
      where: { deletedAt: null, members: { some: { userId: actorId, deletedAt: null } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async getOrganization(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "org.read", { organizationId });
    const org = await this.prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null } });
    if (!org) throw new NotFoundException("Organization not found");
    return org;
  }

  async createWorkspace(actorId: string, organizationId: string, name: string, slug: string) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { organizationId, name, slug } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: actorId } });
      await this.audit.record(tx, {
        organizationId,
        workspaceId: workspace.id,
        actorId,
        action: "workspace.created",
        entityType: "workspace",
        entityId: workspace.id,
        nextData: { name, slug },
      });
      return workspace;
    });
  }

  async listWorkspaces(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "org.read", { organizationId });
    return this.prisma.workspace.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async createProject(actorId: string, workspaceId: string, name: string, code: string, description?: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "project.create", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    const normalizedCode = code.toLocaleUpperCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            organizationId: workspace.organizationId,
            workspaceId,
            name,
            code: normalizedCode,
            description: description || null,
            createdById: actorId,
          },
        });
        await tx.projectMember.create({ data: { projectId: project.id, userId: actorId } });
        await this.audit.record(tx, {
          organizationId: workspace.organizationId,
          workspaceId,
          actorId,
          action: "project.created",
          entityType: "project",
          entityId: project.id,
          nextData: { name, code: normalizedCode },
        });
        return project;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Project code already exists in this workspace");
      throw error;
    }
  }

  async listProjects(actorId: string, workspaceId: string, includeArchived = false) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "workspace.read", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    if (includeArchived) {
      await this.access.assertPermission(actorId, "project.manage", {
        organizationId: workspace.organizationId,
        workspaceId,
      });
    }
    const projects = await this.prisma.project.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { deletedAt: null }) },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(projects.map(async (project) => ({
      ...project,
      access: {
        canManage: await this.access.hasPermission(actorId, "project.manage", {
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          projectId: project.id,
        }),
      },
    })));
  }

  async projectAccess(actorId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "workspace.read", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    const [canManage, canCreate] = await Promise.all([
      this.access.hasPermission(actorId, "project.manage", {
        organizationId: workspace.organizationId,
        workspaceId,
      }),
      this.access.hasPermission(actorId, "project.create", {
        organizationId: workspace.organizationId,
        workspaceId,
      }),
    ]);
    return { canManage, canCreate };
  }

  async updateProject(
    actorId: string,
    projectId: string,
    input: { name?: string; description?: string | null; keyStrategy?: "unified" | "per_type"; testCode?: string | null },
  ) {
    const project = await this.requireProject(projectId);
    await this.assertProjectManagement(actorId, project);
    const nextData = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.keyStrategy !== undefined ? { keyStrategy: input.keyStrategy } : {}),
      ...(input.testCode !== undefined ? { testCode: input.testCode ? input.testCode.toLocaleUpperCase("en") : null } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id: projectId }, data: nextData });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "project.updated",
        entityType: "project",
        entityId: projectId,
        previousData: { name: project.name, description: project.description, keyStrategy: project.keyStrategy, testCode: project.testCode },
        nextData,
      });
      return { ...updated, access: { canManage: true } };
    });
  }

  async archiveProject(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.assertProjectManagement(actorId, project);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { deletedAt: now, deletedById: actorId } });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "project.archived",
        entityType: "project",
        entityId: projectId,
        previousData: { deletedAt: null },
        nextData: { deletedAt: now },
      });
    });
    return { ok: true };
  }

  async restoreProject(actorId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || !project.deletedAt) throw new NotFoundException("Archived project not found");
    await this.requireWorkspace(project.workspaceId);
    await this.assertProjectManagement(actorId, project);
    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.project.update({ where: { id: projectId }, data: { deletedAt: null, deletedById: null } });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "project.restored",
        entityType: "project",
        entityId: projectId,
        previousData: { deletedAt: project.deletedAt },
        nextData: { deletedAt: null },
      });
      return { ...restored, access: { canManage: true } };
    });
  }

  async listProjectMembers(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.read", {
      organizationId: project.organizationId,
      workspaceId: project.workspaceId,
      projectId,
    });
    const canManage = await this.access.hasPermission(actorId, "project.manage", {
      organizationId: project.organizationId,
      workspaceId: project.workspaceId,
      projectId,
    });
    const [members, assignments, availableUsers] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { projectId, deletedAt: null, user: { deletedAt: null, isActive: true } },
        include: { user: true },
        orderBy: { user: { displayName: "asc" } },
      }),
      this.prisma.memberRole.findMany({
        where: { projectId, scopeType: "project", deletedAt: null },
        include: { role: true },
      }),
      canManage
        ? this.prisma.organizationMember.findMany({
            where: { organizationId: project.organizationId, deletedAt: null, user: { deletedAt: null, isActive: true } },
            include: { user: true },
            orderBy: { user: { displayName: "asc" } },
          })
        : Promise.resolve([]),
    ]);
    return {
      access: { canManage },
      members: members.map((member) => ({
        id: member.userId,
        displayName: member.user.displayName,
        email: member.user.email,
        roleKey: assignments.find((assignment) => assignment.userId === member.userId)?.role.key ?? null,
      })),
      availableUsers: availableUsers.map((member) => ({
        id: member.userId,
        displayName: member.user.displayName,
        email: member.user.email,
      })),
    };
  }

  async putProjectMember(actorId: string, projectId: string, userId: string, roleKey: string) {
    const project = await this.requireProject(projectId);
    await this.assertProjectManagement(actorId, project);
    const organizationMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId: project.organizationId, userId, deletedAt: null, user: { deletedAt: null, isActive: true } },
    });
    if (!organizationMember) throw new BadRequestException("User must be an active organization member");
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({ where: { key: roleKey, OR: [{ organizationId: null }, { organizationId: project.organizationId }] } });
      if (!role) throw new BadRequestException("Unknown role");
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        update: { deletedAt: null },
        create: { projectId, userId },
      });
      await tx.memberRole.updateMany({
        where: { projectId, userId, scopeType: "project", deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.memberRole.create({
        data: {
          userId,
          roleId: role.id,
          organizationId: project.organizationId,
          workspaceId: project.workspaceId,
          projectId,
          scopeType: "project",
        },
      });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "project.member_updated",
        entityType: "project_member",
        entityId: userId,
        nextData: { projectId, roleKey },
      });
    });
    return { ok: true };
  }

  async removeProjectMember(actorId: string, projectId: string, userId: string) {
    const project = await this.requireProject(projectId);
    await this.assertProjectManagement(actorId, project);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.projectMember.updateMany({
        where: { projectId, userId, deletedAt: null },
        data: { deletedAt: now },
      });
      if (result.count === 0) throw new NotFoundException("Project member not found");
      await tx.memberRole.updateMany({
        where: { projectId, userId, scopeType: "project", deletedAt: null },
        data: { deletedAt: now },
      });
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "project.member_removed",
        entityType: "project_member",
        entityId: userId,
        previousData: { projectId },
      });
    });
    return { ok: true };
  }

  async addOrganizationMember(actorId: string, organizationId: string, userId: string, roleKey: string) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      update: { deletedAt: null },
      create: { organizationId, userId },
    });
    await this.access.grantRole(userId, roleKey, { organizationId }, "organization");
    return { ok: true };
  }

  async currentAccess(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "org.read", { organizationId });
    const [canManage, roles] = await Promise.all([
      this.access.hasPermission(actorId, "org.manage", { organizationId }),
      this.prisma.memberRole.findMany({
        where: { userId: actorId, organizationId, deletedAt: null },
        select: { role: { select: { key: true, name: true } } },
      }),
    ]);
    return { canManage, roles: roles.map((assignment) => assignment.role) };
  }

  async listMembers(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId, deletedAt: null, user: { deletedAt: null } },
      include: { user: true },
      orderBy: { user: { displayName: "asc" } },
    });
    const roles = await this.prisma.memberRole.findMany({
      where: { organizationId, scopeType: "organization", deletedAt: null },
      include: { role: true },
    });
    return members.map((member) => ({
      id: member.user.id,
      email: member.user.email,
      displayName: member.user.displayName,
      isActive: member.user.isActive,
      roleKey: roles.find((assignment) => assignment.userId === member.userId)?.role.key ?? "viewer",
      createdAt: member.createdAt,
    }));
  }

  async administrationSummary(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    const [workspaceCount, projectCount, documentCount, restrictedDocumentCount, recentAudit] = await Promise.all([
      this.prisma.workspace.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.project.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.document.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.document.count({ where: { organizationId, deletedAt: null, accessGrants: { some: {} } } }),
      this.prisma.auditEvent.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorId: true,
          workspaceId: true,
          documentId: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      scope: {
        workspaces: workspaceCount,
        projects: projectCount,
        documents: documentCount,
        restrictedDocuments: restrictedDocumentCount,
      },
      recentAudit,
    };
  }

  async createUser(actorId: string, organizationId: string, input: { email: string; displayName: string; password: string; roleKey: string }) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    const email = input.email.trim().toLocaleLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException("Email is already in use");
    const passwordHash = await hash(input.password, 12);
    const created = await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findFirst({ where: { key: input.roleKey, OR: [{ organizationId: null }, { organizationId }] } });
      if (!role) throw new BadRequestException("Unknown role");
      const user = await tx.user.create({ data: { email, displayName: input.displayName.trim(), passwordHash } });
      await tx.organizationMember.create({ data: { organizationId, userId: user.id } });
      await tx.memberRole.create({
        data: { userId: user.id, roleId: role.id, organizationId, scopeType: "organization" },
      });
      await this.audit.record(tx, {
        organizationId,
        actorId,
        action: "organization.user_created",
        entityType: "user",
        entityId: user.id,
        nextData: { email, displayName: user.displayName, roleKey: input.roleKey },
      });
      return user;
    });
    return { id: created.id, email: created.email, displayName: created.displayName, isActive: created.isActive, roleKey: input.roleKey };
  }

  async updateMember(actorId: string, organizationId: string, userId: string, input: { roleKey?: string; isActive?: boolean }) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    if (actorId === userId && input.isActive === false) throw new BadRequestException("You cannot deactivate your own account");
    if (actorId === userId && input.roleKey && input.roleKey !== "organization_admin") throw new BadRequestException("You cannot remove your own administrator role");
    const membership = await this.prisma.organizationMember.findFirst({ where: { organizationId, userId, deletedAt: null } });
    if (!membership) throw new NotFoundException("Organization member not found");
    if ((input.roleKey && input.roleKey !== "organization_admin") || input.isActive === false) {
      await this.assertNotLastAdministrator(organizationId, userId);
    }
    await this.prisma.$transaction(async (tx) => {
      if (input.roleKey) {
        const role = await tx.role.findFirst({ where: { key: input.roleKey, OR: [{ organizationId: null }, { organizationId }] } });
        if (!role) throw new BadRequestException("Unknown role");
        await tx.memberRole.updateMany({
          where: { userId, organizationId, scopeType: "organization", deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await tx.memberRole.create({
          data: { userId, roleId: role.id, organizationId, scopeType: "organization" },
        });
      }
      if (input.isActive !== undefined) await tx.user.update({ where: { id: userId }, data: { isActive: input.isActive } });
      await this.audit.record(tx, {
        organizationId,
        actorId,
        action: "organization.member_updated",
        entityType: "user",
        entityId: userId,
        nextData: input,
      });
    });
    return { ok: true };
  }

  async removeMember(actorId: string, organizationId: string, userId: string) {
    await this.access.assertPermission(actorId, "org.manage", { organizationId });
    if (actorId === userId) throw new BadRequestException("You cannot remove your own account");
    await this.assertNotLastAdministrator(organizationId, userId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.organizationMember.updateMany({ where: { organizationId, userId, deletedAt: null }, data: { deletedAt: now } });
      if (result.count === 0) throw new NotFoundException("Organization member not found");
      await tx.memberRole.updateMany({ where: { organizationId, userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.documentAccessGrant.deleteMany({ where: { organizationId, userId } });
      const remaining = await tx.organizationMember.count({ where: { userId, deletedAt: null } });
      if (remaining === 0) await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      await this.audit.record(tx, { organizationId, actorId, action: "organization.member_removed", entityType: "user", entityId: userId });
    });
    return { ok: true };
  }

  async requireWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  private async requireProject(projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private async assertProjectManagement(
    actorId: string,
    project: { id: string; organizationId: string; workspaceId: string },
  ) {
    await this.access.assertPermission(actorId, "project.manage", {
      organizationId: project.organizationId,
      workspaceId: project.workspaceId,
      projectId: project.id,
    });
  }

  private async assertNotLastAdministrator(organizationId: string, userId: string) {
    const targetIsAdministrator = await this.prisma.memberRole.findFirst({
      where: { organizationId, userId, scopeType: "organization", deletedAt: null, role: { key: "organization_admin" } },
    });
    if (!targetIsAdministrator) return;
    const administrators = await this.prisma.memberRole.count({
      where: {
        organizationId,
        scopeType: "organization",
        deletedAt: null,
        role: { key: "organization_admin" },
        user: { isActive: true, deletedAt: null, organizationMemberships: { some: { organizationId, deletedAt: null } } },
      },
    });
    if (administrators <= 1) throw new BadRequestException("The organization must retain at least one active administrator");
  }
}
