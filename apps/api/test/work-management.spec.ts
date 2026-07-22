import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase } from "./helpers";

describe("work management", () => {
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

  it("tracks a linked defect with optimistic updates, comments, and audit", async () => {
    const owner = await registerActor(app, "work-owner");
    const { workspace, document } = await createOrgWorkspaceDocument(app, owner);
    const projectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Delivery", code: "DEL" } });
    const project = JSON.parse(projectResponse.body) as { id: string };
    const rowResponse = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "requirement", title: "User sessions are protected", parentId: null } });
    const row = JSON.parse(rowResponse.body) as { id: string };
    const createdResponse = await app.inject({
      method: "POST",
      url: `/projects/${project.id}/work-items`,
      headers: { cookie: owner.cookie },
      payload: { type: "bug", title: "Session remains active", priority: "critical", assigneeId: owner.userId, labels: ["security"], artifact: { rowId: row.id, role: "affects" } },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = JSON.parse(createdResponse.body) as { id: string; key: string; version: number; artifactLinks: unknown[] };
    expect(created).toEqual(expect.objectContaining({ key: "DEL-1", version: 1, artifactLinks: [expect.objectContaining({ rowId: row.id })] }));
    const updatedResponse = await app.inject({ method: "PATCH", url: `/work-items/${created.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: 1, status: "in_progress" } });
    expect(updatedResponse.statusCode).toBe(200);
    expect(JSON.parse(updatedResponse.body)).toEqual(expect.objectContaining({ status: "in_progress", version: 2 }));
    const staleResponse = await app.inject({ method: "PATCH", url: `/work-items/${created.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: 1, status: "done" } });
    expect(staleResponse.statusCode).toBe(409);
    const commentResponse = await app.inject({ method: "POST", url: `/work-items/${created.id}/comments`, headers: { cookie: owner.cookie }, payload: { body: "Reproduction confirmed", mentionUserIds: [] } });
    expect(commentResponse.statusCode).toBe(201);
    const myWorkResponse = await app.inject({ method: "GET", url: "/my-work?kind=assignment&q=Session", headers: { cookie: owner.cookie } });
    expect(JSON.parse(myWorkResponse.body)).toContainEqual(expect.objectContaining({ workItemId: created.id, kind: "assignment" }));
    const events = await prisma.auditEvent.findMany({ where: { entityType: "work_item", entityId: created.id } });
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["work_item.created", "work_item.updated", "work_item.comment_added"]));
  });

  it("creates a test plan and starts a linked real execution", async () => {
    const owner = await registerActor(app, "plan-owner");
    const { workspace } = await createOrgWorkspaceDocument(app, owner);
    const projectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Verification", code: "VER" } });
    const project = JSON.parse(projectResponse.body) as { id: string };
    const documentResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/documents`, headers: { cookie: owner.cookie }, payload: { title: "Acceptance tests", documentType: "test", folderId: null } });
    const document = JSON.parse(documentResponse.body) as { id: string };
    const testResponse = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "test_case", title: "Authentication", parentId: null } });
    const testCase = JSON.parse(testResponse.body) as { id: string };
    const stepResponse = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "test_step", title: "Sign in", parentId: testCase.id } });
    expect(stepResponse.statusCode).toBe(201);
    const step = JSON.parse(stepResponse.body) as { id: string };
    const planResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/test-plans`, headers: { cookie: owner.cookie }, payload: { name: "Release acceptance", environment: "staging", buildReference: "1.2.0" } });
    expect(planResponse.statusCode).toBe(201);
    const plan = JSON.parse(planResponse.body) as { id: string; key: string; version: number };
    expect(plan.key).toBe("VER-TP-1");
    const candidatesResponse = await app.inject({ method: "GET", url: `/test-plans/${plan.id}/candidates?q=auth`, headers: { cookie: owner.cookie } });
    expect(candidatesResponse.statusCode).toBe(200);
    expect(JSON.parse(candidatesResponse.body)).toContainEqual(expect.objectContaining({ id: testCase.id, stepCount: 1 }));
    const itemResponse = await app.inject({ method: "POST", url: `/test-plans/${plan.id}/items`, headers: { cookie: owner.cookie }, payload: { testCaseRowId: testCase.id, iteration: "Chrome" } });
    expect(itemResponse.statusCode).toBe(201);
    const item = JSON.parse(itemResponse.body) as { id: string };
    const executionResponse = await app.inject({ method: "POST", url: `/test-plan-items/${item.id}/executions`, headers: { cookie: owner.cookie }, payload: {} });
    expect(executionResponse.statusCode).toBe(201);
    const execution = JSON.parse(executionResponse.body) as { id: string; status: string; steps: Array<{ id: string }> };
    expect(execution).toEqual(expect.objectContaining({ status: "running", environment: "staging", buildReference: "1.2.0", testPlanItemId: item.id }));
    const stepExecutionId = execution.steps[0]?.id;
    if (!stepExecutionId) throw new Error("Planned execution step was not created");
    const failedResponse = await app.inject({ method: "PATCH", url: `/executions/${execution.id}/steps/${step.id}`, headers: { cookie: owner.cookie }, payload: { status: "failed", actualResult: "Authentication was accepted" } });
    expect(failedResponse.statusCode).toBe(200);
    const defectResponse = await app.inject({ method: "POST", url: `/executions/${execution.id}/steps/${step.id}/internal-defect`, headers: { cookie: owner.cookie }, payload: { projectId: project.id, title: "Invalid authentication is accepted", priority: "critical" } });
    expect(defectResponse.statusCode).toBe(201);
    const defect = JSON.parse(defectResponse.body) as { id: string; key: string; artifactLinks: Array<{ testStepExecutionId: string }> };
    expect(defect).toEqual(expect.objectContaining({ key: "VER-1", artifactLinks: [expect.objectContaining({ testStepExecutionId: stepExecutionId })] }));
    const storedStep = await prisma.testStepExecution.findUniqueOrThrow({ where: { id: stepExecutionId } });
    expect(storedStep.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "defect", reference: "VER-1", workItemId: defect.id })]));
    const removableTestResponse = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "test_case", title: "Removable test", parentId: null } });
    const removableTest = JSON.parse(removableTestResponse.body) as { id: string };
    await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "test_step", title: "Temporary step", parentId: removableTest.id } });
    const removableItemResponse = await app.inject({ method: "POST", url: `/test-plans/${plan.id}/items`, headers: { cookie: owner.cookie }, payload: { testCaseRowId: removableTest.id } });
    const removableItem = JSON.parse(removableItemResponse.body) as { id: string };
    const removedResponse = await app.inject({ method: "DELETE", url: `/test-plan-items/${removableItem.id}`, headers: { cookie: owner.cookie } });
    expect(removedResponse.statusCode).toBe(200);
    expect(await prisma.testPlanItem.findUniqueOrThrow({ where: { id: removableItem.id } })).toEqual(expect.objectContaining({ deletedById: owner.userId, deletedAt: expect.any(Date) }));
  });

  it("keeps viewer access read-only", async () => {
    const owner = await registerActor(app, "permission-owner");
    const viewer = await registerActor(app, "permission-viewer");
    const { org, workspace, document } = await createOrgWorkspaceDocument(app, owner);
    await app.inject({ method: "POST", url: `/organizations/${org.id}/members`, headers: { cookie: owner.cookie }, payload: { userId: viewer.userId, roleKey: "viewer" } });
    const projectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Read only", code: "RO" } });
    const project = JSON.parse(projectResponse.body) as { id: string };
    const rowResponse = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "requirement", title: "Restricted evidence", parentId: null } });
    const row = JSON.parse(rowResponse.body) as { id: string };
    await app.inject({ method: "POST", url: `/documents/${document.id}/access`, headers: { cookie: owner.cookie }, payload: { userId: owner.userId, accessLevel: "manage" } });
    const created = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "Visible task", artifact: { rowId: row.id, role: "relates_to" } } });
    expect(created.statusCode).toBe(201);
    const workItem = JSON.parse(created.body) as { id: string };
    const listed = await app.inject({ method: "GET", url: `/workspaces/${workspace.id}/work-items`, headers: { cookie: viewer.cookie } });
    expect(listed.statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/work-items/${workItem.id}`, headers: { cookie: viewer.cookie } });
    expect(JSON.parse(detail.body)).toEqual(expect.objectContaining({ artifactLinks: [] }));
    const denied = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: viewer.cookie }, payload: { type: "bug", title: "Denied" } });
    expect(denied.statusCode).toBe(403);
  });
});
