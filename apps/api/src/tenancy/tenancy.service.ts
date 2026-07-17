import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
    await this.access.assertPermission(actorId, "workspace.manage", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId,
          name,
          code,
          description: description ?? null,
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
        nextData: { name, code },
      });
      return project;
    });
  }

  async listProjects(actorId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "workspace.read", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    return this.prisma.project.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
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
