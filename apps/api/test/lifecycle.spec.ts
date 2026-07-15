import { PrismaClient } from "@docsys/database";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StorageService } from "../src/storage/storage.service";
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
    const sectionResponse = await app.inject({ method: "POST", url: `/documents/${testDocument.id}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "heading", title: "Test Steps", parentId: testCase.id } });
    expect(sectionResponse.statusCode).toBe(201);
    const section = JSON.parse(sectionResponse.body) as { id: string };
    const stepResponse = await app.inject({ method: "POST", url: `/documents/${testDocument.id}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "test_step", title: "Press stop", parentId: section.id } });
    expect(stepResponse.statusCode).toBe(201);
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

  it("sanitizes attachment names and verifies uploaded object metadata", async () => {
    const rowResponse = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "requirement", title: "Attachment target", parentId: null },
    });
    const row = JSON.parse(rowResponse.body) as { id: string };
    const createdResponse = await app.inject({
      method: "POST",
      url: `/rows/${row.id}/attachments`,
      headers: { cookie: actor.cookie },
      payload: { fileName: "../report\r\n.pdf", contentType: "application/pdf", sizeBytes: 4 },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = JSON.parse(createdResponse.body) as { id: string };
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.fileName).toBe("..-report.pdf");

    const storage = app.get(StorageService);
    const stat = vi.spyOn(storage, "statObject").mockResolvedValue({ size: 5, metaData: { "content-type": "application/pdf" } } as never);
    vi.spyOn(storage, "removeObject").mockResolvedValue(undefined);
    const rejected = await app.inject({ method: "POST", url: `/attachments/${created.id}/complete`, headers: { cookie: actor.cookie } });
    expect(rejected.statusCode).toBe(422);

    stat.mockResolvedValue({ size: 4, metaData: { "content-type": "application/pdf" } } as never);
    const completed = await app.inject({ method: "POST", url: `/attachments/${created.id}/complete`, headers: { cookie: actor.cookie } });
    expect(completed.statusCode).toBe(201);
    vi.restoreAllMocks();
  });
});
