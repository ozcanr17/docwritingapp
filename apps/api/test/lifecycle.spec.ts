import { PrismaClient } from "@docsys/database";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createDocument, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("lifecycle capabilities", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let workspaceId: string;
  let requirementDocumentId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    actor = await registerActor(app, "lifecycle-owner");
    const created = await createOrgWorkspaceDocument(app, actor);
    workspaceId = created.workspace.id;
    requirementDocumentId = created.document.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("persists views, searches custom content and reports requirement quality", async () => {
    const fieldResponse = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/fields`, headers: { cookie: actor.cookie }, payload: { fieldKey: "subsystem", displayName: "Subsystem", fieldType: "text", allowedValues: [] } });
    expect(fieldResponse.statusCode).toBe(201);
    const rowResponse = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "requirement", title: "Emergency shutdown", parentId: null, customFields: { subsystem: "Propulsion" } } });
    expect(rowResponse.statusCode).toBe(201);
    const row = JSON.parse(rowResponse.body) as { id: string };
    const view = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/views`, headers: { cookie: actor.cookie }, payload: { name: "Safety", scope: "team", filters: [], sorting: [], visibleColumns: ["requirementNo", "title"], frozenColumns: ["requirementNo"], linkProjection: {}, isDefault: false } });
    expect(view.statusCode).toBe(201);
    const search = await app.inject({ method: "GET", url: `/workspaces/${workspaceId}/search?q=Propulsion`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(search.body)).toEqual(expect.arrayContaining([expect.objectContaining({ id: row.id })]));
    const quality = await app.inject({ method: "GET", url: `/documents/${requirementDocumentId}/quality`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(quality.body).summary.untestedRequirement).toBe(1);
  });

  it("stores comments with mentions and immutable test execution history", async () => {
    const testDocument = await createDocument(app, actor, workspaceId, "test", "Execution");
    const testCaseResponse = await app.inject({ method: "POST", url: `/documents/${testDocument.id}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "test_case", title: "Shutdown", parentId: null } });
    const testCase = JSON.parse(testCaseResponse.body) as { id: string };
    const stepResponse = await app.inject({ method: "POST", url: `/documents/${testDocument.id}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "test_step", title: "Press stop", parentId: testCase.id } });
    const step = JSON.parse(stepResponse.body) as { id: string };
    const comment = await app.inject({ method: "POST", url: `/rows/${testCase.id}/comments`, headers: { cookie: actor.cookie }, payload: { body: `Review this @${actor.email}`, mentionUserIds: [] } });
    expect(comment.statusCode).toBe(201);
    expect(JSON.parse(comment.body).mentions).toContain(actor.userId);
    const executionResponse = await app.inject({ method: "POST", url: `/rows/${testCase.id}/executions`, headers: { cookie: actor.cookie }, payload: {} });
    const execution = JSON.parse(executionResponse.body) as { id: string };
    await app.inject({ method: "PATCH", url: `/executions/${execution.id}/steps/${step.id}`, headers: { cookie: actor.cookie }, payload: { status: "passed", actualResult: "Stopped" } });
    const complete = await app.inject({ method: "POST", url: `/executions/${execution.id}/complete`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(complete.body).status).toBe("passed");
  });
});
