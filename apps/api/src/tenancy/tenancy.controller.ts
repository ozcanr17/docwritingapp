import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
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
  listProjects(@CurrentUser() user: SessionUser, @Param("workspaceId", ParseUUIDPipe) workspaceId: string) {
    return this.tenancy.listProjects(user.userId, workspaceId);
  }
}
