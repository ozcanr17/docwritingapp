import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { BaselinesService } from "./baselines.service";

const createBaselineSchema = z.object({ label: z.string().max(200).optional() });

@Controller()
export class BaselinesController {
  constructor(private readonly baselines: BaselinesService) {}

  @Post("documents/:documentId/baselines")
  create(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(createBaselineSchema)) body: z.infer<typeof createBaselineSchema>,
  ) {
    return this.baselines.createBaseline(user.userId, documentId, body.label);
  }

  @Get("documents/:documentId/baselines")
  list(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.baselines.listBaselines(user.userId, documentId);
  }

  @Get("documents/:documentId/baselines/:revisionNumber/diff")
  diff(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Param("revisionNumber", ParseIntPipe) revisionNumber: number,
  ) {
    return this.baselines.diff(user.userId, documentId, revisionNumber);
  }
}
