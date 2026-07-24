import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { TenancyService } from "./tenancy.service";

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const createOrgSchema = z.object({ name: z.string().min(1).max(200), slug: slugSchema });
const createWorkspaceSchema = z.object({ name: z.string().min(1).max(200), slug: slugSchema });
const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(2).max(12).regex(/^[A-Za-z][A-Za-z0-9]*$/),
  description: z.string().trim().max(2000).optional(),
});
const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => value.name !== undefined || value.description !== undefined);
const projectMemberSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.enum(["project_manager", "editor", "reviewer", "viewer"]),
});
const addMemberSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.enum(["organization_admin", "workspace_admin", "project_manager", "editor", "reviewer", "viewer"]),
});
const createUserSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(200),
  password: z.string().min(10).max(200),
  roleKey: z.enum(["organization_admin", "workspace_admin", "project_manager", "editor", "reviewer", "viewer"]),
});
const updateMemberSchema = z.object({
  roleKey: z.enum(["organization_admin", "workspace_admin", "project_manager", "editor", "reviewer", "viewer"]).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => value.roleKey !== undefined || value.isActive !== undefined);

@Controller()
export class TenancyController {
  constructor(private readonly tenancy: TenancyService) {}

  @Post("organizations")
  createOrganization(
    @CurrentUser() user: SessionUser,
    @Body(new ZodBodyPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>,
  ) {
    return this.tenancy.createOrganization(user.userId, body.name, body.slug);
  }

  @Get("organizations")
  listOrganizations(@CurrentUser() user: SessionUser) {
    return this.tenancy.listOrganizations(user.userId);
  }

  @Get("organizations/:orgId")
  getOrganization(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.tenancy.getOrganization(user.userId, orgId);
  }

  @Post("organizations/:orgId/workspaces")
  createWorkspace(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body(new ZodBodyPipe(createWorkspaceSchema)) body: z.infer<typeof createWorkspaceSchema>,
  ) {
    return this.tenancy.createWorkspace(user.userId, orgId, body.name, body.slug);
  }

  @Get("organizations/:orgId/workspaces")
  listWorkspaces(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.tenancy.listWorkspaces(user.userId, orgId);
  }

  @Post("organizations/:orgId/members")
  addMember(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body(new ZodBodyPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>,
  ) {
    return this.tenancy.addOrganizationMember(user.userId, orgId, body.userId, body.roleKey);
  }

  @Get("organizations/:orgId/me/access")
  currentAccess(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.tenancy.currentAccess(user.userId, orgId);
  }

  @Get("organizations/:orgId/members")
  listMembers(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.tenancy.listMembers(user.userId, orgId);
  }

  @Get("organizations/:orgId/administration-summary")
  administrationSummary(@CurrentUser() user: SessionUser, @Param("orgId", ParseUUIDPipe) orgId: string) {
    return this.tenancy.administrationSummary(user.userId, orgId);
  }

  @Post("organizations/:orgId/users")
  createUser(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Body(new ZodBodyPipe(createUserSchema)) body: z.infer<typeof createUserSchema>,
  ) {
    return this.tenancy.createUser(user.userId, orgId, body);
  }

  @Patch("organizations/:orgId/members/:userId")
  updateMember(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body(new ZodBodyPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>,
  ) {
    return this.tenancy.updateMember(user.userId, orgId, userId, body);
  }

  @Delete("organizations/:orgId/members/:userId")
  removeMember(
    @CurrentUser() user: SessionUser,
    @Param("orgId", ParseUUIDPipe) orgId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.tenancy.removeMember(user.userId, orgId, userId);
  }

  @Post("workspaces/:workspaceId/projects")
  createProject(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Body(new ZodBodyPipe(createProjectSchema)) body: z.infer<typeof createProjectSchema>,
  ) {
    return this.tenancy.createProject(user.userId, workspaceId, body.name, body.code, body.description);
  }

  @Get("workspaces/:workspaceId/projects")
  listProjects(
    @CurrentUser() user: SessionUser,
    @Param("workspaceId", ParseUUIDPipe) workspaceId: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.tenancy.listProjects(user.userId, workspaceId, includeArchived === "true");
  }

  @Get("workspaces/:workspaceId/project-access")
  projectAccess(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.tenancy.projectAccess(user.userId, workspaceId);
  }

  @Patch("projects/:projectId")
  updateProject(
    @CurrentUser() user: SessionUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodBodyPipe(updateProjectSchema)) body: z.infer<typeof updateProjectSchema>,
  ) {
    return this.tenancy.updateProject(user.userId, projectId, body);
  }

  @Delete("projects/:projectId")
  archiveProject(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.tenancy.archiveProject(user.userId, projectId);
  }

  @Post("projects/:projectId/restore")
  restoreProject(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.tenancy.restoreProject(user.userId, projectId);
  }

  @Get("projects/:projectId/members")
  listProjectMembers(@CurrentUser() user: SessionUser, @Param("projectId", ParseUUIDPipe) projectId: string) {
    return this.tenancy.listProjectMembers(user.userId, projectId);
  }

  @Put("projects/:projectId/members")
  putProjectMember(
    @CurrentUser() user: SessionUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodBodyPipe(projectMemberSchema)) body: z.infer<typeof projectMemberSchema>,
  ) {
    return this.tenancy.putProjectMember(user.userId, projectId, body.userId, body.roleKey);
  }

  @Delete("projects/:projectId/members/:userId")
  removeProjectMember(
    @CurrentUser() user: SessionUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.tenancy.removeProjectMember(user.userId, projectId, userId);
  }
}
