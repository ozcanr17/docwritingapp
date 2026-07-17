import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { TreeService } from "./tree.service";

const createFolderSchema = z.object({
  name: z.string().min(1).max(300),
  parentId: z.string().uuid().nullable().default(null),
});
const renameFolderSchema = z.object({
  name: z.string().min(1).max(300),
  expectedVersion: z.number().int().positive(),
});
const moveFolderSchema = z.object({
  newParentId: z.string().uuid().nullable(),
  expectedVersion: z.number().int().positive(),
});
const deleteSchema = z.object({ reason: z.string().max(1000).optional() });
const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  documentType: z.enum(["requirement", "test", "general_document"]),
  folderId: z.string().uuid().nullable().default(null),
});
const updateDocumentSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  columnConfig: z.array(z.record(z.unknown())).optional(),
  folderId: z.string().uuid().nullable().optional(),
  requirementPrefix: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,19}$/).optional(),
});

@Controller()
export class TreeController {
  constructor(private readonly tree: TreeService) {}

  @Post("workspaces/:workspaceId/folders")
  createFolder(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(new ZodBodyPipe(createFolderSchema)) body: z.infer<typeof createFolderSchema>,
  ) {
    return this.tree.createFolder(user.userId, workspaceId, body.name, body.parentId);
  }

  @Get("workspaces/:workspaceId/tree")
  listChildren(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Query("parentId") parentId?: string,
  ) {
    return this.tree.listFolderChildren(user.userId, workspaceId, parentId ?? null);
  }

  @Get("workspaces/:workspaceId/folders")
  listFolders(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.tree.listFolders(user.userId, workspaceId);
  }

  @Get("workspaces/:workspaceId/trash")
  listTrash(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.tree.listTrash(user.userId, workspaceId);
  }

  @Patch("folders/:folderId")
  renameFolder(
    @CurrentUser() user: SessionUser,
    @Param("folderId", ParseUUIDPipe) folderId: string,
    @Body(new ZodBodyPipe(renameFolderSchema)) body: z.infer<typeof renameFolderSchema>,
  ) {
    return this.tree.renameFolder(user.userId, folderId, body.name, body.expectedVersion);
  }

  @Post("folders/:folderId/move")
  moveFolder(
    @CurrentUser() user: SessionUser,
    @Param("folderId", ParseUUIDPipe) folderId: string,
    @Body(new ZodBodyPipe(moveFolderSchema)) body: z.infer<typeof moveFolderSchema>,
  ) {
    return this.tree.moveFolder(user.userId, folderId, body.newParentId, body.expectedVersion);
  }

  @Delete("folders/:folderId")
  deleteFolder(
    @CurrentUser() user: SessionUser,
    @Param("folderId", ParseUUIDPipe) folderId: string,
    @Body(new ZodBodyPipe(deleteSchema)) body: z.infer<typeof deleteSchema>,
  ) {
    return this.tree.deleteFolder(user.userId, folderId, body.reason);
  }

  @Post("folders/:folderId/restore")
  restoreFolder(@CurrentUser() user: SessionUser, @Param("folderId", ParseUUIDPipe) folderId: string) {
    return this.tree.restoreFolder(user.userId, folderId);
  }

  @Post("workspaces/:workspaceId/documents")
  createDocument(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(new ZodBodyPipe(createDocumentSchema)) body: z.infer<typeof createDocumentSchema>,
  ) {
    return this.tree.createDocument(user.userId, workspaceId, body.title, body.documentType, body.folderId);
  }

  @Get("documents/:documentId")
  getDocument(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.tree.getDocument(user.userId, documentId);
  }

  @Patch("documents/:documentId")
  updateDocument(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(updateDocumentSchema)) body: z.infer<typeof updateDocumentSchema>,
  ) {
    return this.tree.updateDocument(user.userId, documentId, body.expectedVersion, {
      title: body.title,
      columnConfig: body.columnConfig as never,
      folderId: body.folderId,
      requirementPrefix: body.requirementPrefix?.toUpperCase(),
    });
  }

  @Delete("documents/:documentId")
  deleteDocument(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(deleteSchema)) body: z.infer<typeof deleteSchema>,
  ) {
    return this.tree.deleteDocument(user.userId, documentId, body.reason);
  }

  @Post("documents/:documentId/restore")
  restoreDocument(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.tree.restoreDocument(user.userId, documentId);
  }
}
