import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase } from "./helpers";

describe("tenancy and isolation", () => {
  let app: NestFastifyApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("creates org, workspace, and project for the owner", async () => {
    const owner = await registerActor(app, "owner");
    const { org, workspace } = await createOrgWorkspaceDocument(app, owner);
    expect(org.id).toBeTruthy();
    const projectRes = await app.inject({
      method: "POST",
      url: `/workspaces/${workspace.id}/projects`,
      headers: { cookie: owner.cookie },
      payload: { name: "Project X", code: "PX" },
    });
    expect(projectRes.statusCode).toBe(201);
  });

  it("prevents a non-member from reading another tenant's organization", async () => {
    const owner = await registerActor(app, "tenant-a");
    const outsider = await registerActor(app, "tenant-b");
    const { org, workspace, document } = await createOrgWorkspaceDocument(app, owner);

    const orgRead = await app.inject({
      method: "GET",
      url: `/organizations/${org.id}`,
      headers: { cookie: outsider.cookie },
    });
    expect(orgRead.statusCode).toBe(403);

    const wsRead = await app.inject({
      method: "GET",
      url: `/workspaces/${workspace.id}/projects`,
      headers: { cookie: outsider.cookie },
    });
    expect(wsRead.statusCode).toBe(403);

    const docRead = await app.inject({
      method: "GET",
      url: `/documents/${document.id}`,
      headers: { cookie: outsider.cookie },
    });
    expect(docRead.statusCode).toBe(403);

    const rowWrite = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/rows`,
      headers: { cookie: outsider.cookie },
      payload: { rowType: "requirement", title: "Should not exist", parentId: null },
    });
    expect(rowWrite.statusCode).toBe(403);
  });

  it("grants viewer role read access but no write access", async () => {
    const owner = await registerActor(app, "granting-owner");
    const viewer = await registerActor(app, "viewer-user");
    const { org, document } = await createOrgWorkspaceDocument(app, owner);

    const addMember = await app.inject({
      method: "POST",
      url: `/organizations/${org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: viewer.userId, roleKey: "viewer" },
    });
    expect(addMember.statusCode).toBe(201);

    const docRead = await app.inject({
      method: "GET",
      url: `/documents/${document.id}`,
      headers: { cookie: viewer.cookie },
    });
    expect(docRead.statusCode).toBe(200);

    const rowWrite = await app.inject({
      method: "POST",
      url: `/documents/${document.id}/rows`,
      headers: { cookie: viewer.cookie },
      payload: { rowType: "requirement", title: "Denied", parentId: null },
    });
    expect(rowWrite.statusCode).toBe(403);
  });

  it("revokes role-derived access when organization membership is removed", async () => {
    const owner = await registerActor(app, "revocation-owner");
    const viewer = await registerActor(app, "revoked-viewer");
    const { org, document } = await createOrgWorkspaceDocument(app, owner);
    const addMember = await app.inject({
      method: "POST",
      url: `/organizations/${org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: viewer.userId, roleKey: "viewer" },
    });
    expect(addMember.statusCode).toBe(201);
    await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: org.id, userId: viewer.userId } },
      data: { deletedAt: new Date() },
    });
    const docRead = await app.inject({
      method: "GET",
      url: `/documents/${document.id}`,
      headers: { cookie: viewer.cookie },
    });
    expect(docRead.statusCode).toBe(403);
  });

  it("moves documents between folders and soft-deletes folder trees", async () => {
    const owner = await registerActor(app, "tree-owner");
    const { workspace, document } = await createOrgWorkspaceDocument(app, owner);
    const folderResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/folders`, headers: { cookie: owner.cookie }, payload: { name: "Archive", parentId: null } });
    const folder = JSON.parse(folderResponse.body) as { id: string };
    const moved = await app.inject({ method: "PATCH", url: `/documents/${document.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: document.version, folderId: folder.id } });
    expect(moved.statusCode).toBe(200);
    expect(JSON.parse(moved.body).folderId).toBe(folder.id);
    const deleted = await app.inject({ method: "DELETE", url: `/folders/${folder.id}`, headers: { cookie: owner.cookie }, payload: {} });
    expect(deleted.statusCode).toBe(200);
    expect(await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).toEqual(expect.objectContaining({ deletedAt: expect.any(Date) }));
  });

  it("enforces document access lists and supports administrator user management", async () => {
    const owner = await registerActor(app, "acl-owner");
    const editor = await registerActor(app, "acl-editor");
    const viewer = await registerActor(app, "acl-viewer");
    const { org, workspace, document } = await createOrgWorkspaceDocument(app, owner);
    for (const member of [{ actor: editor, roleKey: "editor" }, { actor: viewer, roleKey: "viewer" }] as const) {
      const response = await app.inject({ method: "POST", url: `/organizations/${org.id}/members`, headers: { cookie: owner.cookie }, payload: { userId: member.actor.userId, roleKey: member.roleKey } });
      expect(response.statusCode).toBe(201);
    }
    const restrict = await app.inject({ method: "POST", url: `/documents/${document.id}/access`, headers: { cookie: owner.cookie }, payload: { userId: viewer.userId, accessLevel: "read" } });
    expect(restrict.statusCode).toBe(201);
    expect((JSON.parse(restrict.body) as { restricted: boolean }).restricted).toBe(true);
    const deniedDocument = await app.inject({ method: "GET", url: `/documents/${document.id}`, headers: { cookie: editor.cookie } });
    expect(deniedDocument.statusCode).toBe(403);
    const deniedTree = await app.inject({ method: "GET", url: `/workspaces/${workspace.id}/tree`, headers: { cookie: editor.cookie } });
    expect((JSON.parse(deniedTree.body) as { documents: unknown[] }).documents).toHaveLength(0);
    const viewerRead = await app.inject({ method: "GET", url: `/documents/${document.id}`, headers: { cookie: viewer.cookie } });
    expect(viewerRead.statusCode).toBe(200);
    expect((JSON.parse(viewerRead.body) as { access: { canWrite: boolean } }).access.canWrite).toBe(false);
    const viewerWrite = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: viewer.cookie }, payload: { rowType: "requirement", title: "Denied", parentId: null } });
    expect(viewerWrite.statusCode).toBe(403);
    const grantEditor = await app.inject({ method: "POST", url: `/documents/${document.id}/access`, headers: { cookie: owner.cookie }, payload: { userId: editor.userId, accessLevel: "write" } });
    expect(grantEditor.statusCode).toBe(201);
    const editorWrite = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: editor.cookie }, payload: { rowType: "requirement", title: "Allowed", parentId: null } });
    expect(editorWrite.statusCode).toBe(201);
    const sourceRow = JSON.parse(editorWrite.body) as { id: string };
    const hiddenDocumentResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/documents`, headers: { cookie: owner.cookie }, payload: { title: "Restricted target", documentType: "requirement", folderId: null } });
    const hiddenDocument = JSON.parse(hiddenDocumentResponse.body) as { id: string };
    const hiddenRowResponse = await app.inject({ method: "POST", url: `/documents/${hiddenDocument.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "requirement", title: "Hidden linked content", parentId: null } });
    const hiddenRow = JSON.parse(hiddenRowResponse.body) as { id: string };
    const linked = await app.inject({ method: "POST", url: `/rows/${sourceRow.id}/links`, headers: { cookie: owner.cookie }, payload: { targetRowId: hiddenRow.id, linkType: "relates_to" } });
    expect(linked.statusCode).toBe(201);
    const restrictTarget = await app.inject({ method: "POST", url: `/documents/${hiddenDocument.id}/access`, headers: { cookie: owner.cookie }, payload: { userId: viewer.userId, accessLevel: "read" } });
    expect(restrictTarget.statusCode).toBe(201);
    const editorOutline = await app.inject({ method: "GET", url: `/documents/${document.id}/outline`, headers: { cookie: editor.cookie } });
    const sourceOutline = (JSON.parse(editorOutline.body) as Array<{ id: string; linkedObjects: unknown[] }>).find((row) => row.id === sourceRow.id);
    expect(sourceOutline?.linkedObjects).toEqual([]);
    const candidates = await app.inject({ method: "GET", url: `/documents/${document.id}/link-candidates?q=Hidden`, headers: { cookie: editor.cookie } });
    expect(JSON.parse(candidates.body)).toEqual([]);
    const accessList = await app.inject({ method: "GET", url: `/documents/${document.id}/access`, headers: { cookie: viewer.cookie } });
    expect((JSON.parse(accessList.body) as { grants: Array<{ id: string; accessLevel: string }>; availableUsers: unknown[] })).toEqual(expect.objectContaining({
      grants: expect.arrayContaining([expect.objectContaining({ id: viewer.userId, accessLevel: "read" }), expect.objectContaining({ id: editor.userId, accessLevel: "write" })]),
      availableUsers: [],
    }));
    const deniedMemberAdministration = await app.inject({ method: "GET", url: `/organizations/${org.id}/members`, headers: { cookie: viewer.cookie } });
    expect(deniedMemberAdministration.statusCode).toBe(403);
    const selfDemotion = await app.inject({ method: "PATCH", url: `/organizations/${org.id}/members/${owner.userId}`, headers: { cookie: owner.cookie }, payload: { roleKey: "viewer" } });
    expect(selfDemotion.statusCode).toBe(400);
    const createdUser = await app.inject({ method: "POST", url: `/organizations/${org.id}/users`, headers: { cookie: owner.cookie }, payload: { email: "managed-user@example.com", displayName: "Managed User", password: "SafePassword-123", roleKey: "reviewer" } });
    expect(createdUser.statusCode).toBe(201);
    const members = await app.inject({ method: "GET", url: `/organizations/${org.id}/members`, headers: { cookie: owner.cookie } });
    expect((JSON.parse(members.body) as Array<{ email: string; roleKey: string }>)).toContainEqual(expect.objectContaining({ email: "managed-user@example.com", roleKey: "reviewer" }));
  });
});
