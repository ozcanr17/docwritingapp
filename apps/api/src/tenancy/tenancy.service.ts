import { Injectable, NotFoundException } from "@nestjs/common";
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

  async requireWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }
}
