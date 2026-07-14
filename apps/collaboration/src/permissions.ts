import { PrismaClient } from "@docsys/database";

export async function hasDocumentReadPermission(
  prisma: PrismaClient,
  userId: string,
  documentId: string,
): Promise<boolean> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, deletedAt: null },
    select: { organizationId: true, workspaceId: true },
  });
  if (!document) return false;
  const assignments = await prisma.memberRole.findMany({
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
  });
  return assignments.some((a) => a.role.rolePermissions.some((rp) => rp.permission.key === "document.read"));
}
