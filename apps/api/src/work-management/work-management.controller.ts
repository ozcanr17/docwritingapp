import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { WorkManagementService } from "./work-management.service";
import { WorkItemSchemaService } from "./work-item-schema.service";
import { ExecutionStatus } from "@docsys/database";
import { EXECUTION_STATUSES, TestExecutionReportService } from "./test-execution-report.service";

const workItemType = z.enum(["epic", "story", "task", "bug", "risk"]);
const workItemStatus = z.enum(["backlog", "ready", "in_progress", "in_review", "done", "canceled"]);
const workItemPriority = z.enum(["lowest", "low", "medium", "high", "highest", "critical"]);
const customFieldType = z.enum(["text", "long_text", "integer", "decimal", "boolean", "date", "datetime", "single_select", "multi_select", "user", "project", "url"]);
const createTypeDefinition = z.object({
  key: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  baseType: workItemType,
  color: z.string().trim().max(20).nullable().optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
});
const updateTypeDefinition = createTypeDefinition.partial().refine((value) => Object.keys(value).length > 0);
const createFieldDefinition = z.object({
  key: z.string().trim().max(40).optional(),
  label: z.string().trim().min(1).max(60),
  helpText: z.string().trim().max(500).nullable().optional(),
  fieldType: customFieldType,
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  appliesToKeys: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  displayOrder: z.number().int().min(0).max(999).optional(),
});
const updateFieldDefinition = createFieldDefinition.partial().refine((value) => Object.keys(value).length > 0);
const artifact = z.object({
  documentId: z.string().uuid().optional(),
  rowId: z.string().uuid().optional(),
  testExecutionId: z.string().uuid().optional(),
  testStepExecutionId: z.string().uuid().optional(),
  role: z.enum(["relates_to", "affects", "found_in", "verifies"]).default("relates_to"),
}).refine((value) => [value.documentId, value.rowId, value.testExecutionId, value.testStepExecutionId].filter(Boolean).length === 1, "Exactly one artifact target is required");
const artifactBatch = z.object({ artifacts: z.array(artifact).min(1).max(50) });
const createWorkItem = z.object({
  type: workItemType.default("task"),
  typeKey: z.string().trim().max(40).optional(),
  customFields: z.record(z.unknown()).optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(30000).optional(),
  stepsToReproduce: z.string().max(30000).optional(),
  expectedResult: z.string().max(30000).optional(),
  actualResult: z.string().max(30000).optional(),
  environment: z.string().max(500).optional(),
  affectedVersion: z.string().max(200).optional(),
  priority: workItemPriority.default("medium"),
  reporterId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  dueAt: z.string().datetime().nullable().optional(),
  artifact: artifact.optional(),
  artifacts: z.array(artifact).max(50).default([]),
});
const updateWorkItem = z.object({
  expectedVersion: z.number().int().positive(),
  type: workItemType.optional(),
  status: workItemStatus.optional(),
  priority: workItemPriority.optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(30000).nullable().optional(),
  stepsToReproduce: z.string().max(30000).nullable().optional(),
  expectedResult: z.string().max(30000).nullable().optional(),
  actualResult: z.string().max(30000).nullable().optional(),
  environment: z.string().max(500).nullable().optional(),
  affectedVersion: z.string().max(200).nullable().optional(),
  reporterId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
const comment = z.object({ body: z.string().trim().min(1).max(20000), mentionUserIds: z.array(z.string().uuid()).max(100).default([]) });
const relation = z.object({ targetId: z.string().uuid(), relationType: z.enum(["blocks", "duplicates", "relates_to", "causes"]) });
const createTestPlan = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().max(20000).optional(),
  environment: z.string().max(200).optional(),
  buildReference: z.string().max(300).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});
const updateTestPlan = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20000).nullable().optional(),
  status: z.enum(["draft", "active", "completed", "canceled"]).optional(),
  environment: z.string().max(200).nullable().optional(),
  buildReference: z.string().max(300).nullable().optional(),
});
const planItem = z.object({ testCaseRowId: z.string().uuid(), assigneeId: z.string().uuid().nullable().optional(), environment: z.string().max(200).optional(), iteration: z.string().max(100).optional() });
const internalDefect = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(30000).optional(),
  priority: workItemPriority.default("high"),
  assigneeId: z.string().uuid().nullable().optional(),
});
const workflowRequiredField = z.enum(["description", "assignee", "dueAt"]);
const workflowRole = z.enum(["project_manager", "editor"]);
const workflowTransitions = z.object({
  backlog: z.array(workItemStatus).max(6).optional(),
  ready: z.array(workItemStatus).max(6).optional(),
  in_progress: z.array(workItemStatus).max(6).optional(),
  in_review: z.array(workItemStatus).max(6).optional(),
  done: z.array(workItemStatus).max(6).optional(),
  canceled: z.array(workItemStatus).max(6).optional(),
}).strict();
const workflowRequiredFields = z.object({
  backlog: z.array(workflowRequiredField).max(3).optional(),
  ready: z.array(workflowRequiredField).max(3).optional(),
  in_progress: z.array(workflowRequiredField).max(3).optional(),
  in_review: z.array(workflowRequiredField).max(3).optional(),
  done: z.array(workflowRequiredField).max(3).optional(),
  canceled: z.array(workflowRequiredField).max(3).optional(),
}).strict();
const workflowRolesByTarget = z.object({
  backlog: z.array(workflowRole).max(2).optional(),
  ready: z.array(workflowRole).max(2).optional(),
  in_progress: z.array(workflowRole).max(2).optional(),
  in_review: z.array(workflowRole).max(2).optional(),
  done: z.array(workflowRole).max(2).optional(),
  canceled: z.array(workflowRole).max(2).optional(),
}).strict();
const workflowTransitionRoles = z.object({
  backlog: workflowRolesByTarget.optional(),
  ready: workflowRolesByTarget.optional(),
  in_progress: workflowRolesByTarget.optional(),
  in_review: workflowRolesByTarget.optional(),
  done: workflowRolesByTarget.optional(),
  canceled: workflowRolesByTarget.optional(),
}).strict();
const workflowScheme = z.object({
  transitions: workflowTransitions,
  requiredFields: workflowRequiredFields.default({}),
  transitionRoles: workflowTransitionRoles.default({}),
}).strict();
const boardWipLimit = z.number().int().min(1).max(99).nullable().optional();
const boardWipLimits = z.object({
  backlog: boardWipLimit,
  ready: boardWipLimit,
  in_progress: boardWipLimit,
  in_review: boardWipLimit,
  done: boardWipLimit,
  canceled: boardWipLimit,
}).strict();
const boardConfiguration = z.object({
  wipLimits: boardWipLimits.default({}),
  defaultSwimlane: z.enum(["none", "assignee", "priority", "type", "epic"]).default("none"),
}).strict();
const workflowConfiguration = z.object({
  expectedVersion: z.number().int().positive(),
  schemes: z.object({ epic: workflowScheme, story: workflowScheme, task: workflowScheme, bug: workflowScheme, risk: workflowScheme }).strict(),
  board: boardConfiguration.default({ wipLimits: {}, defaultSwimlane: "none" }),
});
const moveWorkItem = z.object({
  expectedVersion: z.number().int().positive(),
  targetStatus: workItemStatus,
  anchorId: z.string().uuid().nullable().default(null),
  position: z.enum(["before", "after"]).default("after"),
});

@Controller()
export class WorkManagementController {
  constructor(
    private readonly service: WorkManagementService,
    private readonly schema: WorkItemSchemaService,
    private readonly reports: TestExecutionReportService,
  ) {}

  @Get("workspaces/:workspaceId/work-items")
  listWorkItems(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string, @Query() query: Record<string, string | undefined>) {
    return this.service.listWorkItems(user.userId, workspaceId, query);
  }

  @Get("workspaces/:workspaceId/work-users")
  listWorkUsers(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.service.listWorkUsers(user.userId, workspaceId);
  }

  @Get("workspaces/:workspaceId/work-documents")
  listWorkDocuments(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.service.listWorkDocuments(user.userId, workspaceId);
  }

  @Post("projects/:projectId/work-items")
  createWorkItem(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string, @Body(new ZodBodyPipe(createWorkItem)) body: z.infer<typeof createWorkItem>) {
    return this.service.createWorkItem(user.userId, projectId, body);
  }

  @Get("projects/:projectId/workflow")
  getWorkflow(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.getWorkflow(user.userId, projectId);
  }

  @Get("projects/:projectId/workflow-presets")
  getWorkflowPresets(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.getWorkflowPresets(user.userId, projectId);
  }

  @Get("projects/:projectId/work-dashboard")
  getWorkDashboard(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.getWorkDashboard(user.userId, projectId);
  }

  @Put("projects/:projectId/workflow")
  updateWorkflow(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string, @Body(new ZodBodyPipe(workflowConfiguration)) body: z.infer<typeof workflowConfiguration>) {
    return this.service.updateWorkflow(user.userId, projectId, body);
  }

  @Get("work-items/:workItemId")
  getWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string) {
    return this.service.getWorkItem(user.userId, workItemId);
  }

  @Patch("work-items/:workItemId")
  updateWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(updateWorkItem)) body: z.infer<typeof updateWorkItem>) {
    return this.service.updateWorkItem(user.userId, workItemId, body);
  }

  @Post("work-items/:workItemId/move")
  @HttpCode(200)
  moveWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(moveWorkItem)) body: z.infer<typeof moveWorkItem>) {
    return this.service.moveWorkItem(user.userId, workItemId, body);
  }

  @Delete("work-items/:workItemId")
  deleteWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string) {
    return this.service.deleteWorkItem(user.userId, workItemId);
  }

  @Post("work-items/:workItemId/artifacts")
  linkArtifact(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(artifact)) body: z.infer<typeof artifact>) {
    return this.service.linkArtifact(user.userId, workItemId, body);
  }

  @Post("work-items/:workItemId/artifacts/batch")
  linkArtifacts(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(artifactBatch)) body: z.infer<typeof artifactBatch>) {
    return this.service.linkArtifacts(user.userId, workItemId, body.artifacts);
  }

  @Post("work-items/:workItemId/relations")
  linkWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(relation)) body: z.infer<typeof relation>) {
    return this.service.linkWorkItem(user.userId, workItemId, body);
  }

  @Post("work-items/:workItemId/comments")
  addComment(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(comment)) body: z.infer<typeof comment>) {
    return this.service.addComment(user.userId, workItemId, body);
  }

  @Get("projects/:projectId/test-plans")
  listTestPlans(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listTestPlans(user.userId, projectId);
  }

  @Post("projects/:projectId/test-plans")
  createTestPlan(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string, @Body(new ZodBodyPipe(createTestPlan)) body: z.infer<typeof createTestPlan>) {
    return this.service.createTestPlan(user.userId, projectId, body);
  }

  @Get("test-plans/:testPlanId")
  getTestPlan(@CurrentUser() user: SessionUser, @Param("testPlanId", ParseUUIDPipe) testPlanId: string) {
    return this.service.getTestPlan(user.userId, testPlanId);
  }

  @Patch("test-plans/:testPlanId")
  updateTestPlan(@CurrentUser() user: SessionUser, @Param("testPlanId", ParseUUIDPipe) testPlanId: string, @Body(new ZodBodyPipe(updateTestPlan)) body: z.infer<typeof updateTestPlan>) {
    return this.service.updateTestPlan(user.userId, testPlanId, body);
  }

  @Post("test-plans/:testPlanId/items")
  addTestPlanItem(@CurrentUser() user: SessionUser, @Param("testPlanId", ParseUUIDPipe) testPlanId: string, @Body(new ZodBodyPipe(planItem)) body: z.infer<typeof planItem>) {
    return this.service.addTestPlanItem(user.userId, testPlanId, body);
  }

  @Get("test-plans/:testPlanId/candidates")
  listTestPlanCandidates(@CurrentUser() user: SessionUser, @Param("testPlanId", ParseUUIDPipe) testPlanId: string, @Query("q") query = "") {
    return this.service.listTestPlanCandidates(user.userId, testPlanId, query);
  }

  @Delete("test-plan-items/:itemId")
  removeTestPlanItem(@CurrentUser() user: SessionUser, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.service.removeTestPlanItem(user.userId, itemId);
  }

  @Post("test-plan-items/:itemId/executions")
  startPlannedExecution(@CurrentUser() user: SessionUser, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.service.startPlannedExecution(user.userId, itemId);
  }

  @Get("workspaces/:workspaceId/test-executions")
  listWorkspaceExecutions(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const statuses = (query.status ?? "").split(",").filter((entry): entry is ExecutionStatus => EXECUTION_STATUSES.includes(entry as ExecutionStatus));
    return this.reports.listWorkspaceExecutions(user.userId, workspaceId, {
      projectId: query.projectId,
      testPlanId: query.testPlanId,
      status: statuses,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Get("workspaces/:workspaceId/test-scenarios")
  listWorkspaceTestScenarios(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Query("query") query = "",
  ) {
    return this.reports.listWorkspaceTestScenarios(user.userId, workspaceId, query);
  }

  @Get("test-plans/:testPlanId/execution-report")
  getPlanExecutionReport(@CurrentUser() user: SessionUser, @Param("testPlanId", ParseUUIDPipe) testPlanId: string) {
    return this.reports.getPlanExecutionReport(user.userId, testPlanId);
  }

  @Post("executions/:executionId/steps/:stepRowId/internal-defect")
  createInternalDefect(@CurrentUser() user: SessionUser, @Param("executionId", ParseUUIDPipe) executionId: string, @Param("stepRowId", ParseUUIDPipe) stepRowId: string, @Body(new ZodBodyPipe(internalDefect)) body: z.infer<typeof internalDefect>) {
    return this.service.createInternalDefect(user.userId, executionId, stepRowId, body);
  }

  @Get("projects/:projectId/work-item-schema")
  listWorkItemSchema(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.schema.listSchema(user.userId, projectId);
  }

  @Post("projects/:projectId/work-item-types")
  createWorkItemType(
    @CurrentUser() user: SessionUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodBodyPipe(createTypeDefinition)) body: z.infer<typeof createTypeDefinition>,
  ) {
    return this.schema.createType(user.userId, projectId, body);
  }

  @Patch("work-item-types/:typeId")
  updateWorkItemType(
    @CurrentUser() user: SessionUser,
    @Param("typeId", ParseUUIDPipe) typeId: string,
    @Body(new ZodBodyPipe(updateTypeDefinition)) body: z.infer<typeof updateTypeDefinition>,
  ) {
    return this.schema.updateType(user.userId, typeId, body);
  }

  @Delete("work-item-types/:typeId")
  archiveWorkItemType(@CurrentUser() user: SessionUser, @Param("typeId", ParseUUIDPipe) typeId: string) {
    return this.schema.archiveType(user.userId, typeId);
  }

  @Post("projects/:projectId/work-item-fields")
  createWorkItemField(
    @CurrentUser() user: SessionUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodBodyPipe(createFieldDefinition)) body: z.infer<typeof createFieldDefinition>,
  ) {
    return this.schema.createField(user.userId, projectId, body);
  }

  @Patch("work-item-fields/:fieldId")
  updateWorkItemField(
    @CurrentUser() user: SessionUser,
    @Param("fieldId", ParseUUIDPipe) fieldId: string,
    @Body(new ZodBodyPipe(updateFieldDefinition)) body: z.infer<typeof updateFieldDefinition>,
  ) {
    return this.schema.updateField(user.userId, fieldId, body);
  }

  @Delete("work-item-fields/:fieldId")
  archiveWorkItemField(@CurrentUser() user: SessionUser, @Param("fieldId", ParseUUIDPipe) fieldId: string) {
    return this.schema.archiveField(user.userId, fieldId);
  }

  @Get("executions/:executionId/defect-projects")
  listExecutionDefectProjects(@CurrentUser() user: SessionUser, @Param("executionId", ParseUUIDPipe) executionId: string) {
    return this.service.listExecutionDefectProjects(user.userId, executionId);
  }
}
