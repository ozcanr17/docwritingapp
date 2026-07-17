import { ForbiddenException, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionKey, PERMISSIONS, SYSTEM_ROLES } from "./access.constants";

export interface PermissionScope {
  organizationId: string;
  workspaceId?: string;
  projectId?: string;
  documentId?: string;
}

@Injectable()
export class AccessService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemRoles();
  }

  async ensureSystemRoles(): Promise<void> {
    for (const key of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      });
    }
    const allPermissions = await this.prisma.permission.findMany();
    const byKey = new Map(allPermissions.map((p) => [p.key, p.id]));
    for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
      const existing = await this.prisma.role.findFirst({ where: { organizationId: null, key } });
      const role =
        existing ??
        (await this.prisma.role.create({
          data: { key, name: def.name, isSystem: true },
        }));
      for (const permKey of def.permissions) {
        const permissionId = byKey.get(permKey);
        if (!permissionId) continue;
        await this.prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          update: {},
          create: { roleId: role.id, permissionId },
        });
      }
    }
  }

  async grantRole(
    userId: string,
    roleKey: string,
    scope: PermissionScope,
    scopeType: "organization" | "workspace" | "project",
  ): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { key: roleKey, OR: [{ organizationId: null }, { organizationId: scope.organizationId }] },
    });
    if (!role) throw new ForbiddenException(`Unknown role ${roleKey}`);
    const existing = await this.prisma.memberRole.findFirst({
      where: {
        userId,
        roleId: role.id,
        organizationId: scope.organizationId,
        scopeType,
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
        deletedAt: null,
      },
    });
    if (existing) return;
    await this.prisma.memberRole.create({
      data: {
        userId,
        roleId: role.id,
        organizationId: scope.organizationId,
        scopeType,
        workspaceId: scope.workspaceId ?? null,
        projectId: scope.projectId ?? null,
      },
    });
  }

  async hasPermission(userId: string, permission: PermissionKey, scope: PermissionScope): Promise<boolean> {
    const [membership, assignments] = await Promise.all([
      this.prisma.organizationMember.findFirst({
        where: {
          userId,
          organizationId: scope.organizationId,
          deletedAt: null,
          organization: { deletedAt: null },
          user: { deletedAt: null, isActive: true },
        },
        select: { id: true },
      }),
      this.prisma.memberRole.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { scopeType: "system" },
            { scopeType: "organization", organizationId: scope.organizationId },
            ...(scope.workspaceId ? [{ scopeType: "workspace" as const, workspaceId: scope.workspaceId }] : []),
            ...(scope.projectId ? [{ scopeType: "project" as const, projectId: scope.projectId }] : []),
          ],
        },
        include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
      }),
    ]);
    if (!membership) return false;
    const roleAllowed = assignments.some((a) => a.role.rolePermissions.some((rp) => rp.permission.key === permission));
    if (!roleAllowed) return false;
    if (!scope.documentId || (!permission.startsWith("document.") && !permission.startsWith("row."))) return true;
    if (assignments.some((assignment) => ["system_admin", "organization_admin"].includes(assignment.role.key))) return true;
    const grants = await this.prisma.documentAccessGrant.findMany({ where: { documentId: scope.documentId } });
    if (grants.length === 0) return true;
    const grant = grants.find((item) => item.userId === userId);
    if (!grant) return false;
    const required = permission.endsWith(".manage") ? "manage" : permission.endsWith(".write") ? "write" : "read";
    const rank = { read: 1, write: 2, manage: 3 } as const;
    return rank[grant.accessLevel] >= rank[required];
  }

  async documentAccess(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) return { accessLevel: null, canRead: false, canWrite: false, canManage: false, restricted: false };
    const scope = { organizationId: document.organizationId, workspaceId: document.workspaceId, documentId };
    const [canRead, canWrite, canManage, grantCount] = await Promise.all([
      this.hasPermission(userId, "document.read", scope),
      this.hasPermission(userId, "document.write", scope),
      this.hasPermission(userId, "document.manage", scope),
      this.prisma.documentAccessGrant.count({ where: { documentId } }),
    ]);
    return {
      accessLevel: canManage ? "manage" : canWrite ? "write" : canRead ? "read" : null,
      canRead,
      canWrite,
      canManage,
      restricted: grantCount > 0,
    };
  }

  async readableDocumentIds(userId: string, documentIds: string[], scope: Omit<PermissionScope, "documentId">): Promise<Set<string>> {
    const readable = await Promise.all(documentIds.map(async (documentId) => [documentId, await this.hasPermission(userId, "document.read", { ...scope, documentId })] as const));
    return new Set(readable.filter(([, allowed]) => allowed).map(([documentId]) => documentId));
  }

  async replaceOrganizationRole(userId: string, roleKey: string, organizationId: string): Promise<void> {
    await this.prisma.memberRole.updateMany({
      where: { userId, organizationId, scopeType: "organization", deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await this.grantRole(userId, roleKey, { organizationId }, "organization");
  }

  async assertPermission(userId: string, permission: PermissionKey, scope: PermissionScope): Promise<void> {
    const allowed = await this.hasPermission(userId, permission, scope);
    if (!allowed) throw new ForbiddenException("Insufficient permissions");
  }

  async assertRowAccess(userId: string, rowId: string, required: "read" | "write" | "manage"): Promise<void> {
    const row = await this.prisma.documentRow.findUnique({
      where: { id: rowId },
      select: { document: { select: { id: true, organizationId: true, workspaceId: true } } },
    });
    if (row) {
      const permission = required === "read" ? "row.read" : "row.write";
      await this.assertPermission(userId, permission, {
        organizationId: row.document.organizationId,
        workspaceId: row.document.workspaceId,
        documentId: row.document.id,
      });
    }
    const grants = await this.prisma.rowAccessGrant.findMany({ where: { rowId } });
    if (grants.length === 0) return;
    const grant = grants.find((item) => item.userId === userId);
    const rank = { read: 1, write: 2, manage: 3 } as const;
    if (!grant || rank[grant.accessLevel] < rank[required]) throw new ForbiddenException("Row access is restricted");
  }

  async readableRowIds(userId: string, rowIds: string[]): Promise<Set<string>> {
    if (rowIds.length === 0) return new Set();
    const [grants, rows] = await Promise.all([
      this.prisma.rowAccessGrant.findMany({ where: { rowId: { in: rowIds } } }),
      this.prisma.documentRow.findMany({
        where: { id: { in: rowIds } },
        select: { id: true, document: { select: { id: true, organizationId: true, workspaceId: true } } },
      }),
    ]);
    const documentAccess = new Map<string, boolean>();
    for (const row of rows) {
      if (!documentAccess.has(row.document.id)) {
        documentAccess.set(row.document.id, await this.hasPermission(userId, "row.read", {
          organizationId: row.document.organizationId,
          workspaceId: row.document.workspaceId,
          documentId: row.document.id,
        }));
      }
    }
    const documentByRow = new Map(rows.map((row) => [row.id, row.document.id]));
    const restricted = new Set(grants.map((grant) => grant.rowId));
    const allowed = new Set(grants.filter((grant) => grant.userId === userId).map((grant) => grant.rowId));
    return new Set(rowIds.filter((rowId) => documentAccess.get(documentByRow.get(rowId) ?? "") && (!restricted.has(rowId) || allowed.has(rowId))));
  }
}
