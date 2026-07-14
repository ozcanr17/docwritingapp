import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ExportsService } from "./exports.service";

const createExportSchema = z.object({ format: z.enum(["csv", "docx"]) });
const importSchema = z.object({ csv: z.string().min(1).max(5_000_000) });

@Controller()
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post("documents/:documentId/exports")
  createExport(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(createExportSchema)) body: z.infer<typeof createExportSchema>,
  ) {
    return this.exports.createExport(user.userId, documentId, body.format);
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
}
