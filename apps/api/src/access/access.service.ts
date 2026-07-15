import { ForbiddenException, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionKey, PERMISSIONS, SYSTEM_ROLES } from "./access.constants";

export interface PermissionScope {
  organizationId: string;
  workspaceId?: string;
  projectId?: string;
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
    const assignments = await this.prisma.memberRole.findMany({
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
    });
    return assignments.some((a) => a.role.rolePermissions.some((rp) => rp.permission.key === permission));
  }

  async assertPermission(userId: string, permission: PermissionKey, scope: PermissionScope): Promise<void> {
    const allowed = await this.hasPermission(userId, permission, scope);
    if (!allowed) throw new ForbiddenException("Insufficient permissions");
  }

  async assertRowAccess(userId: string, rowId: string, required: "read" | "write" | "manage"): Promise<void> {
    const grants = await this.prisma.rowAccessGrant.findMany({ where: { rowId } });
    if (grants.length === 0) return;
    const grant = grants.find((item) => item.userId === userId);
    const rank = { read: 1, write: 2, manage: 3 } as const;
    if (!grant || rank[grant.accessLevel] < rank[required]) throw new ForbiddenException("Row access is restricted");
  }

  async readableRowIds(userId: string, rowIds: string[]): Promise<Set<string>> {
    if (rowIds.length === 0) return new Set();
    const grants = await this.prisma.rowAccessGrant.findMany({ where: { rowId: { in: rowIds } } });
    const restricted = new Set(grants.map((grant) => grant.rowId));
    const allowed = new Set(grants.filter((grant) => grant.userId === userId).map((grant) => grant.rowId));
    return new Set(rowIds.filter((rowId) => !restricted.has(rowId) || allowed.has(rowId)));
  }
}
