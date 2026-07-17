import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LifecycleService } from "./lifecycle.service";

const savedViewSchema = z.object({
  name: z.string().min(1).max(200),
  scope: z.enum(["personal", "team"]).default("personal"),
  filters: z.array(z.record(z.unknown())).default([]),
  sorting: z.array(z.record(z.unknown())).default([]),
  visibleColumns: z.array(z.string()).default([]),
  frozenColumns: z.array(z.string()).default([]),
  linkProjection: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false),
});

const commentSchema = z.object({
  body: z.string().min(1).max(20000),
  mentionUserIds: z.array(z.string().uuid()).default([]),
  anchor: z.object({
    field: z.enum(["title", "description", "action", "expectedResult"]),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    quotedText: z.string().min(1).max(20000),
  }).optional(),
  suggestedReplacement: z.string().max(20000).nullable().optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  sourceRowId: z.string().uuid().nullable().optional(),
});

const applyTemplateSchema = z.object({
  parentId: z.string().uuid().nullable().default(null),
});
const attachmentSchema = z.object({
  fileName: z.string().min(1).max(500),
  contentType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i).max(200),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

const executionSchema = z.object({
  environment: z.string().max(200).optional(),
  buildReference: z.string().max(300).optional(),
  iteration: z.string().max(200).optional(),
  notes: z.string().max(20000).optional(),
  retestPackageItemId: z.string().uuid().optional(),
});

const retestPackageSchema = z.object({
  name: z.string().min(1).max(300),
  candidateRowIds: z.array(z.string().uuid()).min(1).max(500),
  impactDepth: z.number().int().min(1).max(3).default(1),
});

const stepExecutionSchema = z.object({
  status: z.enum(["not_run", "running", "passed", "failed", "blocked", "skipped"]),
  actualResult: z.string().max(20000).nullable().optional(),
});

const reviewSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  reviewerIds: z.array(z.string().uuid()).min(1),
  dueAt: z.string().datetime().optional(),
  activate: z.boolean().default(true),
});

const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  comment: z.string().max(10000).optional(),
});

const proposalSchema = z.object({
  title: z.string().min(1).max(300),
  reason: z.string().max(10000).optional(),
  proposedPatch: z.record(z.unknown()),
  submit: z.boolean().default(true),
});

const proposalDecisionSchema = z.object({
  approved: z.boolean(),
  decisionNote: z.string().max(10000).optional(),
  apply: z.boolean().default(false),
});

const configurationSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["stream", "baseline", "variant"]),
  documentId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().max(5000).optional(),
  rules: z.record(z.unknown()).default({}),
});

const accessGrantSchema = z.object({
  userId: z.string().uuid(),
  accessLevel: z.enum(["read", "write", "manage"]),
});

const integrationSchema = z.object({
  name: z.string().min(1).max(200),
  integrationType: z.enum(["webhook", "jira", "azure_devops", "github", "generic_rest", "assistant"]),
  configuration: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

const ssoSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1).max(500),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  userInfoEndpoint: z.string().url().optional(),
  scopes: z.array(z.string()).default(["openid", "profile", "email"]),
  enabled: z.boolean().default(true),
}).superRefine((configuration, context) => {
  const issuer = new URL(configuration.issuer);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["issuer"], message: "OIDC issuer must be an HTTPS URL without credentials" });
  }
  for (const field of ["authorizationEndpoint", "tokenEndpoint", "userInfoEndpoint"] as const) {
    const value = configuration[field];
    if (!value) continue;
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || endpoint.origin !== issuer.origin || endpoint.username || endpoint.password) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "OIDC endpoints must use the issuer HTTPS origin" });
    }
  }
});

@Controller()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get("documents/:documentId/views")
  listViews(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.listViews(user.userId, documentId);
  }

  @Post("documents/:documentId/views")
  createView(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(savedViewSchema)) body: z.infer<typeof savedViewSchema>,
  ) {
    return this.lifecycle.createView(user.userId, documentId, body);
  }

  @Delete("views/:viewId")
  deleteView(@CurrentUser() user: SessionUser, @Param("viewId", ParseUUIDPipe) viewId: string) {
    return this.lifecycle.deleteView(user.userId, viewId);
  }

  @Get("documents/:documentId/templates")
  listTemplates(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.listTemplates(user.userId, documentId);
  }

  @Post("documents/:documentId/templates")
  createTemplate(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(templateSchema)) body: z.infer<typeof templateSchema>,
  ) {
    return this.lifecycle.createTemplate(user.userId, documentId, body.name, body.sourceRowId ?? null);
  }

  @Post("documents/:documentId/templates/:templateId/apply")
  applyTemplate(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body(new ZodBodyPipe(applyTemplateSchema)) body: z.infer<typeof applyTemplateSchema>,
  ) {
    return this.lifecycle.applyTemplate(user.userId, documentId, templateId, body.parentId);
  }

  @Delete("documents/:documentId/templates/:templateId")
  deleteTemplate(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Param("templateId", ParseUUIDPipe) templateId: string,
  ) {
    return this.lifecycle.deleteTemplate(user.userId, documentId, templateId);
  }

  @Get("workspaces/:workspaceId/search")
  search(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Query("q") query?: string,
    @Query("limit") limit?: string,
  ) {
    return this.lifecycle.search(user.userId, workspaceId, query ?? "", Math.min(Number(limit ?? 100) || 100, 250));
  }

  @Get("documents/:documentId/quality")
  quality(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.quality(user.userId, documentId);
  }

  @Get("documents/:documentId/dashboard")
  dashboard(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.dashboard(user.userId, documentId);
  }

  @Get("documents/:documentId/release-readiness")
  releaseReadiness(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.releaseReadiness(user.userId, documentId);
  }

  @Get("documents/:documentId/impact-analysis")
  impactAnalysis(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("depth") depth?: string,
  ) {
    return this.lifecycle.impactAnalysis(user.userId, documentId, Math.min(3, Math.max(1, Number(depth) || 1)));
  }

  @Get("documents/:documentId/retest-packages")
  retestPackages(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.listRetestPackages(user.userId, documentId);
  }

  @Post("documents/:documentId/retest-packages")
  createRetestPackage(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(retestPackageSchema)) body: z.infer<typeof retestPackageSchema>,
  ) {
    return this.lifecycle.createRetestPackage(user.userId, documentId, body);
  }

  @Post("retest-packages/:packageId/cancel")
  cancelRetestPackage(@CurrentUser() user: SessionUser, @Param("packageId", ParseUUIDPipe) packageId: string) {
    return this.lifecycle.cancelRetestPackage(user.userId, packageId);
  }

  @Get("documents/:documentId/assistant/suggestions")
  assistantSuggestions(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.assistantSuggestions(user.userId, documentId);
  }

  @Get("rows/:rowId/comments")
  comments(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.lifecycle.listComments(user.userId, rowId);
  }

  @Get("rows/:rowId/people")
  people(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Query("q") query = "",
  ) {
    return this.lifecycle.people(user.userId, rowId, query);
  }

  @Post("rows/:rowId/comments")
  addComment(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(commentSchema)) body: z.infer<typeof commentSchema>,
  ) {
    return this.lifecycle.addComment(user.userId, rowId, body.body, body.mentionUserIds, body.anchor, body.suggestedReplacement);
  }

  @Post("comments/:commentId/resolve")
  resolveComment(@CurrentUser() user: SessionUser, @Param("commentId", ParseUUIDPipe) commentId: string) {
    return this.lifecycle.resolveComment(user.userId, commentId);
  }

  @Get("rows/:rowId/attachments")
  attachments(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.lifecycle.listAttachments(user.userId, rowId);
  }

  @Post("rows/:rowId/attachments")
  createAttachment(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(attachmentSchema)) body: z.infer<typeof attachmentSchema>,
  ) {
    return this.lifecycle.createAttachment(user.userId, rowId, body);
  }

  @Get("attachments/:attachmentId/download")
  downloadAttachment(@CurrentUser() user: SessionUser, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) {
    return this.lifecycle.downloadAttachment(user.userId, attachmentId);
  }

  @Post("attachments/:attachmentId/complete")
  completeAttachment(@CurrentUser() user: SessionUser, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) {
    return this.lifecycle.completeAttachment(user.userId, attachmentId);
  }

  @Delete("attachments/:attachmentId")
  deleteAttachment(@CurrentUser() user: SessionUser, @Param("attachmentId", ParseUUIDPipe) attachmentId: string) {
    return this.lifecycle.deleteAttachment(user.userId, attachmentId);
  }

  @Get("notifications")
  notifications(@CurrentUser() user: SessionUser) {
    return this.lifecycle.notifications(user.userId);
  }

  @Get("my-work")
  myWork(
    @CurrentUser() user: SessionUser,
    @Query("q") query = "",
    @Query("kind") kind = "all",
  ) {
    return this.lifecycle.myWork(user.userId, query, kind);
  }

  @Post("notifications/:notificationId/read")
  readNotification(@CurrentUser() user: SessionUser, @Param("notificationId", ParseUUIDPipe) notificationId: string) {
    return this.lifecycle.readNotification(user.userId, notificationId);
  }

  @Post("notifications/read-all")
  readAllNotifications(@CurrentUser() user: SessionUser) {
    return this.lifecycle.readAllNotifications(user.userId);
  }

  @Get("rows/:rowId/executions")
  executions(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.lifecycle.listExecutions(user.userId, rowId);
  }

  @Get("documents/:documentId/executions")
  documentExecutions(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.listDocumentExecutions(user.userId, documentId);
  }

  @Post("rows/:rowId/executions")
  createExecution(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(executionSchema)) body: z.infer<typeof executionSchema>,
  ) {
    return this.lifecycle.createExecution(user.userId, rowId, body);
  }

  @Patch("executions/:executionId/steps/:stepRowId")
  updateExecutionStep(
    @CurrentUser() user: SessionUser,
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Param("stepRowId", ParseUUIDPipe) stepRowId: string,
    @Body(new ZodBodyPipe(stepExecutionSchema)) body: z.infer<typeof stepExecutionSchema>,
  ) {
    return this.lifecycle.updateExecutionStep(user.userId, executionId, stepRowId, body);
  }

  @Post("executions/:executionId/complete")
  completeExecution(@CurrentUser() user: SessionUser, @Param("executionId", ParseUUIDPipe) executionId: string) {
    return this.lifecycle.completeExecution(user.userId, executionId);
  }

  @Post("executions/:executionId/stop")
  stopExecution(@CurrentUser() user: SessionUser, @Param("executionId", ParseUUIDPipe) executionId: string) {
    return this.lifecycle.stopExecution(user.userId, executionId);
  }

  @Patch("test-steps/:rowId/status")
  updateTestStepStatus(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(stepExecutionSchema.pick({ status: true }))) body: z.infer<typeof stepExecutionSchema>,
  ) {
    return this.lifecycle.updateTestStepStatus(user.userId, rowId, body.status);
  }

  @Get("documents/:documentId/reviews")
  reviews(@CurrentUser() user: SessionUser, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return this.lifecycle.listReviews(user.userId, documentId);
  }

  @Post("documents/:documentId/reviews")
  createReview(
    @CurrentUser() user: SessionUser,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body(new ZodBodyPipe(reviewSchema)) body: z.infer<typeof reviewSchema>,
  ) {
    return this.lifecycle.createReview(user.userId, documentId, body);
  }

  @Post("reviews/:reviewId/decisions")
  decideReview(
    @CurrentUser() user: SessionUser,
    @Param("reviewId", ParseUUIDPipe) reviewId: string,
    @Body(new ZodBodyPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
  ) {
    return this.lifecycle.decideReview(user.userId, reviewId, body.decision, body.comment);
  }

  @Get("rows/:rowId/proposals")
  proposals(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.lifecycle.listProposals(user.userId, rowId);
  }

  @Post("rows/:rowId/proposals")
  createProposal(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(proposalSchema)) body: z.infer<typeof proposalSchema>,
  ) {
    return this.lifecycle.createProposal(user.userId, rowId, body);
  }

  @Post("proposals/:proposalId/decision")
  decideProposal(
    @CurrentUser() user: SessionUser,
    @Param("proposalId", ParseUUIDPipe) proposalId: string,
    @Body(new ZodBodyPipe(proposalDecisionSchema)) body: z.infer<typeof proposalDecisionSchema>,
  ) {
    return this.lifecycle.decideProposal(user.userId, proposalId, body);
  }

  @Get("workspaces/:workspaceId/configurations")
  configurations(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.lifecycle.listConfigurations(user.userId, workspaceId);
  }

  @Post("workspaces/:workspaceId/configurations")
  createConfiguration(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(new ZodBodyPipe(configurationSchema)) body: z.infer<typeof configurationSchema>,
  ) {
    return this.lifecycle.createConfiguration(user.userId, workspaceId, body);
  }

  @Get("rows/:rowId/access")
  accessGrants(@CurrentUser() user: SessionUser, @Param("rowId", ParseUUIDPipe) rowId: string) {
    return this.lifecycle.listAccessGrants(user.userId, rowId);
  }

  @Post("rows/:rowId/access")
  grantAccess(
    @CurrentUser() user: SessionUser,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body(new ZodBodyPipe(accessGrantSchema)) body: z.infer<typeof accessGrantSchema>,
  ) {
    return this.lifecycle.grantAccess(user.userId, rowId, body.userId, body.accessLevel);
  }

  @Get("organizations/:orgId/integrations")
  integrations(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.lifecycle.listIntegrations(user.userId, orgId);
  }

  @Post("organizations/:orgId/integrations")
  createIntegration(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body(new ZodBodyPipe(integrationSchema)) body: z.infer<typeof integrationSchema>,
  ) {
    return this.lifecycle.createIntegration(user.userId, orgId, body);
  }

  @Post("organizations/:orgId/sso")
  configureSso(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body(new ZodBodyPipe(ssoSchema)) body: z.infer<typeof ssoSchema>,
  ) {
    return this.lifecycle.configureSso(user.userId, orgId, body);
  }
}
