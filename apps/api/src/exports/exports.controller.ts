import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ExportsService } from "./exports.service";

const createExportSchema = z.object({
  format: z.enum(["csv", "docx", "xlsx", "pdf", "reqif"]),
  templateId: z.string().uuid().optional(),
  locale: z.enum(["tr", "en"]).default("tr"),
  scope: z.enum(["document", "traceability"]).default("document"),
  traceabilityDirection: z.enum(["requirement_to_test", "test_to_requirement"]).default("requirement_to_test"),
}).superRefine((value, context) => {
  if (value.scope === "traceability" && value.format !== "docx" && value.format !== "xlsx") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["format"], message: "Traceability exports support DOCX and XLSX" });
  }
});
const importSchema = z.object({ csv: z.string().min(1).max(5_000_000) });
const reqifImportSchema = z.object({ reqif: z.string().min(1).max(20_000_000) });
const xlsxImportSchema = z.object({ data: z.string().min(1).max(30_000_000) });
const exportTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  documentType: z.enum(["requirement", "test", "general_document"]),
  fileName: z.string().min(1).max(500),
});

@Controller()
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post("documents/:documentId/exports")
  createExport(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(createExportSchema)) body: z.infer<typeof createExportSchema>,
  ) {
    return this.exports.createExport(user.userId, documentId, body.format, body.templateId, body.locale, body.scope, body.traceabilityDirection);
  }

  @Get("exports/:jobId")
  getExport(@CurrentUser() user: SessionUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.exports.getExport(user.userId, jobId);
  }

  @Get("exports/:jobId/download")
  download(@CurrentUser() user: SessionUser, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.exports.downloadUrl(user.userId, jobId);
  }

  @Post("documents/:documentId/imports")
  importCsv(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(importSchema)) body: z.infer<typeof importSchema>,
  ) {
    return this.exports.importCsv(user.userId, documentId, body.csv);
  }

  @Post("documents/:documentId/imports/preview")
  previewCsv(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(importSchema)) body: z.infer<typeof importSchema>,
  ) {
    return this.exports.previewCsv(user.userId, documentId, body.csv);
  }

  @Post("documents/:documentId/imports/reqif")
  importReqif(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(reqifImportSchema)) body: z.infer<typeof reqifImportSchema>,
  ) {
    return this.exports.importReqif(user.userId, documentId, body.reqif);
  }

  @Post("documents/:documentId/imports/reqif/preview")
  previewReqif(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(reqifImportSchema)) body: z.infer<typeof reqifImportSchema>,
  ) {
    return this.exports.previewReqif(user.userId, documentId, body.reqif);
  }

  @Post("documents/:documentId/imports/xlsx")
  importXlsx(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(xlsxImportSchema)) body: z.infer<typeof xlsxImportSchema>,
  ) {
    return this.exports.importXlsx(user.userId, documentId, body.data);
  }

  @Post("documents/:documentId/imports/xlsx/preview")
  previewXlsx(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(xlsxImportSchema)) body: z.infer<typeof xlsxImportSchema>,
  ) {
    return this.exports.previewXlsx(user.userId, documentId, body.data);
  }

  @Get("organizations/:orgId/export-templates")
  listTemplates(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.exports.listTemplates(user.userId, orgId);
  }

  @Post("organizations/:orgId/export-templates")
  createTemplate(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body(new ZodBodyPipe(exportTemplateSchema)) body: z.infer<typeof exportTemplateSchema>,
  ) {
    return this.exports.createTemplate(user.userId, orgId, body);
  }
}
