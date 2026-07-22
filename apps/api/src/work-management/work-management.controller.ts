import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { WorkManagementService } from "./work-management.service";

const workItemType = z.enum(["epic", "story", "task", "bug", "risk"]);
const workItemStatus = z.enum(["backlog", "ready", "in_progress", "in_review", "done", "canceled"]);
const workItemPriority = z.enum(["lowest", "low", "medium", "high", "highest", "critical"]);
const artifact = z.object({
  documentId: z.string().uuid().optional(),
  rowId: z.string().uuid().optional(),
  testExecutionId: z.string().uuid().optional(),
  role: z.enum(["relates_to", "affects", "found_in", "verifies"]).default("relates_to"),
}).refine((value) => [value.documentId, value.rowId, value.testExecutionId].filter(Boolean).length === 1, "Exactly one artifact target is required");
const createWorkItem = z.object({
  type: workItemType.default("task"),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(30000).optional(),
  priority: workItemPriority.default("medium"),
  assigneeId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  dueAt: z.string().datetime().nullable().optional(),
  artifact: artifact.optional(),
});
const updateWorkItem = z.object({
  expectedVersion: z.number().int().positive(),
  type: workItemType.optional(),
  status: workItemStatus.optional(),
  priority: workItemPriority.optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(30000).nullable().optional(),
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

@Controller()
export class WorkManagementController {
  constructor(private readonly service: WorkManagementService) {}

  @Get("workspaces/:workspaceId/work-items")
  listWorkItems(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string, @Query() query: Record<string, string | undefined>) {
    return this.service.listWorkItems(user.userId, workspaceId, query);
  }

  @Post("projects/:projectId/work-items")
  createWorkItem(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string, @Body(new ZodBodyPipe(createWorkItem)) body: z.infer<typeof createWorkItem>) {
    return this.service.createWorkItem(user.userId, projectId, body);
  }

  @Get("work-items/:workItemId")
  getWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string) {
    return this.service.getWorkItem(user.userId, workItemId);
  }

  @Patch("work-items/:workItemId")
  updateWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(updateWorkItem)) body: z.infer<typeof updateWorkItem>) {
    return this.service.updateWorkItem(user.userId, workItemId, body);
  }

  @Delete("work-items/:workItemId")
  deleteWorkItem(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string) {
    return this.service.deleteWorkItem(user.userId, workItemId);
  }

  @Post("work-items/:workItemId/artifacts")
  linkArtifact(@CurrentUser() user: SessionUser, @Param("workItemId", ParseUUIDPipe) workItemId: string, @Body(new ZodBodyPipe(artifact)) body: z.infer<typeof artifact>) {
    return this.service.linkArtifact(user.userId, workItemId, body);
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

  @Post("test-plan-items/:itemId/executions")
  startPlannedExecution(@CurrentUser() user: SessionUser, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.service.startPlannedExecution(user.userId, itemId);
  }
}
