import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { IdempotencyService } from "../common/idempotency.service";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RowsService } from "./rows.service";

const createRowSchema = z.object({
  parentId: z.string().uuid().nullable().default(null),
  afterRowId: z.string().uuid().optional(),
  rowType: z.enum(["heading", "requirement", "test_case", "test_step", "note"]),
  title: z.string().max(1000).default(""),
  description: z.string().max(100000).optional(),
  customFields: z.record(z.unknown()).optional(),
});

const createTestTemplateSchema = z.object({
  name: z.string().min(1).max(1000),
  parentId: z.string().uuid().nullable().default(null),
  sectionTitles: z.array(z.string().min(1).max(200)).length(4),
  defaultContent: z.string().min(1).max(1000),
});

const updateRowSchema = z.object({
  expectedVersion: z.number().int().positive(),
  numberingStart: z.number().int().positive().nullable().optional(),
  title: z.string().max(1000).optional(),
  description: z.string().max(100000).nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  requirementDetail: z
    .object({
      requirementNo: z.string().max(120).nullable().optional(),
      status: z.string().max(60).optional(),
      priority: z.string().max(60).nullable().optional(),
      rationale: z.string().max(10000).nullable().optional(),
    })
    .optional(),
  testCaseDetail: z
    .object({
      status: z.string().max(60).optional(),
      priority: z.string().max(60).nullable().optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      tags: z.array(z.string().max(60)).optional(),
    })
    .optional(),
  testStepDetail: z
    .object({
      stepNumber: z.number().int().positive().nullable().optional(),
      action: z.string().max(100000).nullable().optional(),
      expectedResult: z.string().max(100000).nullable().optional(),
      testResult: z.string().max(100000).nullable().optional(),
    })
    .optional(),
});

const moveRowSchema = z.object({
  newParentId: z.string().uuid().nullable(),
  afterRowId: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive(),
});

const deleteRowSchema = z.object({
  reason: z.string().max(1000).optional(),
  childStrategy: z.enum(["delete_subtree", "promote_children"]).default("delete_subtree"),
});
const copyRowsSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1).max(200),
  newParentId: z.string().uuid().nullable().default(null),
});

const createLinkSchema = z.object({
  targetRowId: z.string().uuid(),
  linkType: z.enum(["verifies", "relates_to", "derives_from", "duplicates"]).default("verifies"),
});

const fieldDefinitionSchema = z.object({
  fieldKey: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  displayName: z.string().min(1).max(200),
  fieldType: z.enum([
    "text",
    "long_text",
    "integer",
    "decimal",
    "boolean",
    "date",
    "datetime",
    "single_select",
    "multi_select",
    "user",
    "project",
    "url",
  ]),
  isRequired: z.boolean().optional(),
  isSearchable: z.boolean().optional(),
  allowedValues: z.array(z.string().max(200)).optional(),
  displayOrder: z.number().int().optional(),
});

@Controller()
export class RowsController {
  constructor(
    private readonly rows: RowsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post("documents/:documentId/rows")
  createRow(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(createRowSchema)) body: z.infer<typeof createRowSchema>,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.idempotency.runOnce(user.userId, idempotencyKey, () =>
      this.rows.createRow(user.userId, {
        documentId,
        parentId: body.parentId,
        afterRowId: body.afterRowId,
        rowType: body.rowType,
        title: body.title,
        description: body.description,
        customFields: body.customFields,
      }),
    );
  }

  @Post("documents/:documentId/test-templates")
  createTestTemplate(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(createTestTemplateSchema)) body: z.infer<typeof createTestTemplateSchema>,
  ) {
    return this.rows.createTestTemplate(user.userId, documentId, body.name, body.parentId, body.sectionTitles, body.defaultContent);
  }

  @Get("documents/:documentId/rows")
  listChildren(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("parentId") parentId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const parsedLimit = Math.min(Number(limit ?? 200) || 200, 500);
    const parsedOffset = Number(offset ?? 0) || 0;
    return this.rows.listChildren(user.userId, documentId, parentId ?? null, parsedLimit, parsedOffset);
  }

  @Get("documents/:documentId/outline")
  outline(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.rows.outline(user.userId, documentId);
  }

  @Get("documents/:documentId/link-candidates")
  linkCandidates(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("q") query?: string,
  ) {
    return this.rows.linkCandidates(user.userId, documentId, query ?? "");
  }

  @Get("rows/:rowId")
  getRow(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.rows.getRow(user.userId, rowId);
  }

  @Patch("rows/:rowId")
  updateRow(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(updateRowSchema)) body: z.infer<typeof updateRowSchema>,
  ) {
    return this.rows.updateRow(user.userId, rowId, body);
  }

  @Post("rows/:rowId/move")
  moveRow(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(moveRowSchema)) body: z.infer<typeof moveRowSchema>,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.idempotency.runOnce(user.userId, idempotencyKey, () =>
      this.rows.moveRow(user.userId, rowId, body.newParentId, body.afterRowId, body.expectedVersion),
    );
  }

  @Delete("rows/:rowId")
  deleteRow(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(deleteRowSchema)) body: z.infer<typeof deleteRowSchema>,
  ) {
    return this.rows.deleteRow(user.userId, rowId, body.reason, body.childStrategy);
  }

  @Post("rows/:rowId/restore")
  restoreRow(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.rows.restoreRow(user.userId, rowId);
  }

  @Post("documents/:documentId/rows/copy")
  copyRows(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(copyRowsSchema)) body: z.infer<typeof copyRowsSchema>,
  ) {
    return this.rows.copyRows(user.userId, documentId, body.rowIds, body.newParentId);
  }

  @Post("rows/:rowId/links")
  createLink(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(createLinkSchema)) body: z.infer<typeof createLinkSchema>,
  ) {
    return this.rows.createLink(user.userId, rowId, body.targetRowId, body.linkType);
  }

  @Delete("links/:linkId")
  deleteLink(@CurrentUser() user: SessionUser, @Param("linkId", ParseUUIDPipe) linkId: string) {
    return this.rows.deleteLink(user.userId, linkId);
  }

  @Post("links/:linkId/acknowledge")
  acknowledgeLink(@CurrentUser() user: SessionUser, @Param("linkId", ParseUUIDPipe) linkId: string) {
    return this.rows.acknowledgeLink(user.userId, linkId);
  }

  @Get("documents/:documentId/suspect-links")
  suspectLinks(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.rows.listSuspectLinks(user.userId, documentId);
  }

  @Get("documents/:documentId/coverage")
  coverage(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.rows.coverage(user.userId, documentId);
  }

  @Get("documents/:documentId/traceability")
  traceability(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.rows.traceabilityMatrix(user.userId, documentId);
  }

  @Post("rows/:rowId/projects/:projectId")
  assignProject(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ) {
    return this.rows.assignProject(user.userId, rowId, projectId);
  }

  @Delete("rows/:rowId/projects/:projectId")
  removeProject(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ) {
    return this.rows.removeProject(user.userId, rowId, projectId);
  }

  @Post("documents/:documentId/fields")
  createFieldDefinition(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(fieldDefinitionSchema)) body: z.infer<typeof fieldDefinitionSchema>,
  ) {
    return this.rows.createFieldDefinition(user.userId, documentId, body);
  }

  @Get("documents/:documentId/fields")
  listFieldDefinitions(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.rows.listFieldDefinitions(user.userId, documentId);
  }
}
