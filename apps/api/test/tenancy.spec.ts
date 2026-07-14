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
});
