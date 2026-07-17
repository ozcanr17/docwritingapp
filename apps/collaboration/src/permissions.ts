import { PrismaClient } from "@docsys/database";

export async function documentPermissions(
  prisma: PrismaClient,
  userId: string,
  documentId: string,
): Promise<{ canRead: boolean; canWrite: boolean }> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { id: true, organizationId: true, workspaceId: true },
  });
  if (!document) return { canRead: false, canWrite: false };
  const [membership, assignments, grants] = await Promise.all([
    prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId: document.organizationId,
        deletedAt: null,
        organization: { deletedAt: null },
        user: { deletedAt: null, isActive: true },
      },
      select: { id: true },
    }),
    prisma.memberRole.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { scopeType: "system" },
          { scopeType: "organization", organizationId: document.organizationId },
          { scopeType: "workspace", workspaceId: document.workspaceId },
        ],
      },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    }),
    prisma.documentAccessGrant.findMany({ where: { documentId: document.id } }),
  ]);
  if (!membership) return { canRead: false, canWrite: false };
  const roleCanRead = assignments.some((assignment) => assignment.role.rolePermissions.some((item) => item.permission.key === "document.read"));
  const roleCanWrite = assignments.some((assignment) => assignment.role.rolePermissions.some((item) => item.permission.key === "document.write"));
  if (!roleCanRead) return { canRead: false, canWrite: false };
  if (assignments.some((assignment) => ["system_admin", "organization_admin"].includes(assignment.role.key))) return { canRead: true, canWrite: true };
  if (grants.length === 0) return { canRead: true, canWrite: roleCanWrite };
  const grant = grants.find((item) => item.userId === userId);
  if (!grant) return { canRead: false, canWrite: false };
  return { canRead: true, canWrite: roleCanWrite && grant.accessLevel !== "read" };
}
