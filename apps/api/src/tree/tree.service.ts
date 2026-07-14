import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DocumentType, Prisma } from "@reqtrack/database";
import { randomUUID } from "crypto";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { rankBetween } from "../common/rank";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TreeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async createFolder(actorId: string, workspaceId: string, name: string, parentId: string | null) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    return this.prisma.$transaction(async (tx) => {
      let ancestorPath = "";
      let depth = 0;
      if (parentId) {
        const parent = await tx.folder.findFirst({ where: { id: parentId, workspaceId, deletedAt: null } });
        if (!parent) throw new NotFoundException("Parent folder not found");
        ancestorPath = `${parent.ancestorPath}${parent.id}/`;
        depth = parent.depth + 1;
      }
      const lastSibling = await tx.folder.findFirst({
        where: { workspaceId, parentId, deletedAt: null },
        orderBy: { rank: "desc" },
      });
      const folder = await tx.folder.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId,
          parentId,
          name,
          rank: rankBetween(lastSibling?.rank ?? null, null),
          ancestorPath,
          depth,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.audit.record(tx, {
        organizationId: workspace.organizationId,
        workspaceId,
        actorId,
        action: "folder.created",
        entityType: "folder",
        entityId: folder.id,
        nextData: { name, parentId },
      });
      return folder;
    });
  }

  async listFolderChildren(actorId: string, workspaceId: string, parentId: string | null) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "document.read", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    const [folders, documents] = await Promise.all([
      this.prisma.folder.findMany({
        where: { workspaceId, parentId, deletedAt: null },
        orderBy: { rank: "asc" },
      }),
      this.prisma.document.findMany({
        where: { workspaceId, folderId: parentId, deletedAt: null },
        orderBy: { rank: "asc" },
        select: { id: true, title: true, documentType: true, folderId: true, rank: true, version: true, updatedAt: true },
      }),
    ]);
    return { folders, documents };
  }

  async renameFolder(actorId: string, folderId: string, name: string, expectedVersion: number) {
    const folder = await this.requireFolder(folderId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: folder.organizationId,
      workspaceId: folder.workspaceId,
    });
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.folder.updateMany({
        where: { id: folderId, version: expectedVersion, deletedAt: null },
        data: { name, version: { increment: 1 }, updatedById: actorId },
      });
      if (result.count === 0) throw new ConflictException(await this.currentFolder(folderId));
      await this.audit.record(tx, {
        organizationId: folder.organizationId,
        workspaceId: folder.workspaceId,
        actorId,
        action: "folder.renamed",
        entityType: "folder",
        entityId: folderId,
        previousData: { name: folder.name },
        nextData: { name },
      });
      return tx.folder.findUniqueOrThrow({ where: { id: folderId } });
    });
  }

  async moveFolder(actorId: string, folderId: string, newParentId: string | null, expectedVersion: number) {
    const folder = await this.requireFolder(folderId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: folder.organizationId,
      workspaceId: folder.workspaceId,
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${folder.workspaceId}::text, 0))`;
      const current = await tx.folder.findFirst({ where: { id: folderId, deletedAt: null } });
      if (!current) throw new NotFoundException("Folder not found");
      if (current.version !== expectedVersion) throw new ConflictException(current);
      const oldPrefix = `${current.ancestorPath}${current.id}/`;
      let newAncestorPath = "";
      let newDepth = 0;
      if (newParentId) {
        const parent = await tx.folder.findFirst({
          where: { id: newParentId, workspaceId: current.workspaceId, deletedAt: null },
        });
        if (!parent) throw new NotFoundException("Target folder not found");
        if (parent.id === current.id || `${parent.ancestorPath}${parent.id}/`.startsWith(oldPrefix)) {
          throw new UnprocessableEntityException("Move would create a cycle");
        }
        newAncestorPath = `${parent.ancestorPath}${parent.id}/`;
        newDepth = parent.depth + 1;
      }
      const lastSibling = await tx.folder.findFirst({
        where: { workspaceId: current.workspaceId, parentId: newParentId, deletedAt: null, id: { not: current.id } },
        orderBy: { rank: "desc" },
      });
      await tx.folder.update({
        where: { id: current.id },
        data: {
          parentId: newParentId,
          ancestorPath: newAncestorPath,
          depth: newDepth,
          rank: rankBetween(lastSibling?.rank ?? null, null),
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      const newPrefix = `${newAncestorPath}${current.id}/`;
      const depthDelta = newDepth - current.depth;
      await tx.$executeRaw`
        UPDATE folders
        SET "ancestorPath" = ${newPrefix} || substring("ancestorPath" from ${oldPrefix.length + 1}::int),
            depth = depth + ${depthDelta}::int
        WHERE "workspaceId" = ${current.workspaceId}::uuid
          AND "ancestorPath" LIKE ${oldPrefix} || '%'`;
      await this.audit.record(tx, {
        organizationId: current.organizationId,
        workspaceId: current.workspaceId,
        actorId,
        action: "folder.moved",
        entityType: "folder",
        entityId: current.id,
        previousData: { parentId: current.parentId },
        nextData: { parentId: newParentId },
      });
      return tx.folder.findUniqueOrThrow({ where: { id: current.id } });
    });
  }

  async deleteFolder(actorId: string, folderId: string, reason?: string) {
    const folder = await this.requireFolder(folderId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: folder.organizationId,
      workspaceId: folder.workspaceId,
    });
    const correlationId = randomUUID();
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const prefix = `${folder.ancestorPath}${folder.id}/`;
      const subtree = await tx.folder.findMany({
        where: {
          workspaceId: folder.workspaceId,
          deletedAt: null,
          OR: [{ id: folder.id }, { ancestorPath: { startsWith: prefix } }],
        },
        select: { id: true },
      });
      const folderIds = subtree.map((f) => f.id);
      await tx.folder.updateMany({
        where: { id: { in: folderIds } },
        data: { deletedAt, deletedById: actorId, deletionReason: reason ?? null },
      });
      await tx.document.updateMany({
        where: { folderId: { in: folderIds }, deletedAt: null },
        data: { deletedAt, deletedById: actorId, deletionReason: reason ?? null },
      });
      await this.audit.record(tx, {
        organizationId: folder.organizationId,
        workspaceId: folder.workspaceId,
        actorId,
        action: "folder.deleted",
        entityType: "folder",
        entityId: folder.id,
        correlationId,
        metadata: { reason: reason ?? null },
      });
    });
    return { ok: true, correlationId };
  }

  async restoreFolder(actorId: string, folderId: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId } });
    if (!folder || !folder.deletedAt) throw new NotFoundException("Deleted folder not found");
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: folder.organizationId,
      workspaceId: folder.workspaceId,
    });
    const deletedAt = folder.deletedAt;
    await this.prisma.$transaction(async (tx) => {
      const prefix = `${folder.ancestorPath}${folder.id}/`;
      await tx.folder.updateMany({
        where: {
          workspaceId: folder.workspaceId,
          deletedAt,
          OR: [{ id: folder.id }, { ancestorPath: { startsWith: prefix } }],
        },
        data: { deletedAt: null, deletedById: null, deletionReason: null },
      });
      await tx.document.updateMany({
        where: { workspaceId: folder.workspaceId, deletedAt },
        data: { deletedAt: null, deletedById: null, deletionReason: null },
      });
      await this.audit.record(tx, {
        organizationId: folder.organizationId,
        workspaceId: folder.workspaceId,
        actorId,
        action: "folder.restored",
        entityType: "folder",
        entityId: folder.id,
      });
    });
    return { ok: true };
  }

  async createDocument(
    actorId: string,
    workspaceId: string,
    title: string,
    documentType: DocumentType,
    folderId: string | null,
  ) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    return this.prisma.$transaction(async (tx) => {
      if (folderId) {
        const parent = await tx.folder.findFirst({ where: { id: folderId, workspaceId, deletedAt: null } });
        if (!parent) throw new NotFoundException("Folder not found");
      }
      const lastSibling = await tx.document.findFirst({
        where: { workspaceId, folderId, deletedAt: null },
        orderBy: { rank: "desc" },
      });
      const document = await tx.document.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId,
          folderId,
          documentType,
          title,
          rank: rankBetween(lastSibling?.rank ?? null, null),
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.audit.record(tx, {
        organizationId: workspace.organizationId,
        workspaceId,
        actorId,
        action: "document.created",
        entityType: "document",
        entityId: document.id,
        documentId: document.id,
        nextData: { title, documentType },
      });
      return document;
    });
  }

  async getDocument(actorId: string, documentId: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    return document;
  }

  async updateDocument(
    actorId: string,
    documentId: string,
    expectedVersion: number,
    patch: { title?: string; columnConfig?: Prisma.InputJsonValue },
  ) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.document.updateMany({
        where: { id: documentId, version: expectedVersion, deletedAt: null },
        data: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.columnConfig !== undefined ? { columnConfig: patch.columnConfig } : {}),
          version: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(await tx.document.findFirst({ where: { id: documentId } }));
      }
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "document.updated",
        entityType: "document",
        entityId: documentId,
        documentId,
        previousData: { title: document.title },
        nextData: { title: patch.title ?? document.title, columnConfigChanged: patch.columnConfig !== undefined },
      });
      return tx.document.findUniqueOrThrow({ where: { id: documentId } });
    });
    await this.events.publish({
      type: "document.updated",
      documentId,
      organizationId: document.organizationId,
      entityId: documentId,
      version: updated.version,
      actorId,
    });
    return updated;
  }

  async deleteDocument(actorId: string, documentId: string, reason?: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const correlationId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.document.update({
        where: { id: documentId },
        data: { deletedAt, deletedById: actorId, deletionReason: reason ?? null },
      });
      await tx.documentRow.updateMany({
        where: { documentId, deletedAt: null },
        data: { deletedAt, deletedById: actorId },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "document.deleted",
        entityType: "document",
        entityId: documentId,
        documentId,
        correlationId,
        metadata: { reason: reason ?? null },
      });
    });
    await this.events.publish({
      type: "document.deleted",
      documentId,
      organizationId: document.organizationId,
      entityId: documentId,
      actorId,
    });
    return { ok: true, correlationId };
  }

  async restoreDocument(actorId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId } });
    if (!document || !document.deletedAt) throw new NotFoundException("Deleted document not found");
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const deletedAt = document.deletedAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: { deletedAt: null, deletedById: null, deletionReason: null },
      });
      await tx.documentRow.updateMany({
        where: { documentId, deletedAt },
        data: { deletedAt: null, deletedById: null },
      });
      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "document.restored",
        entityType: "document",
        entityId: documentId,
        documentId,
      });
    });
    return { ok: true };
  }

  async listTrash(actorId: string, workspaceId: string) {
    const workspace = await this.requireWorkspace(workspaceId);
    await this.access.assertPermission(actorId, "document.manage", {
      organizationId: workspace.organizationId,
      workspaceId,
    });
    const [folders, documents] = await Promise.all([
      this.prisma.folder.findMany({
        where: { workspaceId, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        select: { id: true, name: true, deletedAt: true, deletedById: true, deletionReason: true },
      }),
      this.prisma.document.findMany({
        where: { workspaceId, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        select: { id: true, title: true, deletedAt: true, deletedById: true, deletionReason: true },
      }),
    ]);
    return { folders, documents };
  }

  async requireWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  async requireFolder(folderId: string) {
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, deletedAt: null } });
    if (!folder) throw new NotFoundException("Folder not found");
    return folder;
  }

  async requireDocument(documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  private async currentFolder(folderId: string) {
    return this.prisma.folder.findFirst({ where: { id: folderId } });
  }
}
