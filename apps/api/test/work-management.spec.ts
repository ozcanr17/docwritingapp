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
      payload: {
        type: "bug",
        title: "Session remains active",
        description: "A revoked session remains usable.",
        stepsToReproduce: "1. Sign in\n2. Revoke the session\n3. Refresh the protected page",
        expectedResult: "The user is redirected to sign in.",
        actualResult: "The protected page remains available.",
        environment: "Windows 11 / Chrome 130 / QA",
        affectedVersion: "0.1.7",
        priority: "critical",
        reporterId: owner.userId,
        assigneeId: owner.userId,
        labels: ["security", "regression"],
        artifacts: [{ rowId: row.id, role: "affects" }, { documentId: document.id, role: "affects" }],
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = JSON.parse(createdResponse.body) as { id: string; key: string; version: number; artifactLinks: unknown[] };
    expect(created).toEqual(expect.objectContaining({
      key: "DEL-1",
      version: 1,
      reporterId: owner.userId,
      stepsToReproduce: expect.stringContaining("Revoke"),
      expectedResult: "The user is redirected to sign in.",
      actualResult: "The protected page remains available.",
      environment: "Windows 11 / Chrome 130 / QA",
      affectedVersion: "0.1.7",
      labels: ["security", "regression"],
      artifactLinks: expect.arrayContaining([expect.objectContaining({ rowId: row.id }), expect.objectContaining({ documentId: document.id })]),
    }));
    expect(created.artifactLinks).toHaveLength(2);
    const documentsResponse = await app.inject({ method: "GET", url: `/workspaces/${workspace.id}/work-documents`, headers: { cookie: owner.cookie } });
    expect(documentsResponse.statusCode).toBe(200);
    expect(JSON.parse(documentsResponse.body)).toContainEqual(expect.objectContaining({ id: document.id }));
    const dashboardResponse = await app.inject({ method: "GET", url: `/projects/${project.id}/work-dashboard`, headers: { cookie: owner.cookie } });
    expect(dashboardResponse.statusCode).toBe(200);
    expect(JSON.parse(dashboardResponse.body)).toEqual(expect.objectContaining({
      myOpenBugs: [expect.objectContaining({ id: created.id })],
      metrics: expect.objectContaining({ total: 1, open: 1, criticalOpen: 1, requirements: 1, testCases: 0, executions: 0, openDefects: 1, linkedEvidence: 2 }),
    }));
    const designResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/documents`, headers: { cookie: owner.cookie }, payload: { title: "Session Design", documentType: "general_document", folderId: null } });
    const design = JSON.parse(designResponse.body) as { id: string };
    const batchLinkResponse = await app.inject({
      method: "POST",
      url: `/work-items/${created.id}/artifacts/batch`,
      headers: { cookie: owner.cookie },
      payload: { artifacts: [{ documentId: design.id, role: "relates_to" }] },
    });
    expect(batchLinkResponse.statusCode).toBe(201);
    expect(JSON.parse(batchLinkResponse.body)).toEqual([expect.objectContaining({ documentId: design.id })]);
    const duplicateBatchResponse = await app.inject({
      method: "POST",
      url: `/work-items/${created.id}/artifacts/batch`,
      headers: { cookie: owner.cookie },
      payload: { artifacts: [{ documentId: design.id, role: "relates_to" }] },
    });
    expect(duplicateBatchResponse.statusCode).toBe(409);
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
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["work_item.created", "work_item.transitioned", "work_item.comment_added"]));
  });

  it("enforces configurable workflows and persists audited ordering", async () => {
    const owner = await registerActor(app, "workflow-owner");
    const editor = await registerActor(app, "workflow-editor");
    const { org, workspace } = await createOrgWorkspaceDocument(app, owner);
    await app.inject({
      method: "POST",
      url: `/organizations/${org.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: editor.userId, roleKey: "editor" },
    });
    const projectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Controlled delivery", code: "FLOW" } });
    const project = JSON.parse(projectResponse.body) as { id: string };
    const workflowResponse = await app.inject({ method: "GET", url: `/projects/${project.id}/workflow`, headers: { cookie: owner.cookie } });
    expect(workflowResponse.statusCode).toBe(200);
    const workflow = JSON.parse(workflowResponse.body) as {
      version: number;
      customized: boolean;
      schemes: Record<string, {
        transitions: Record<string, string[]>;
        requiredFields: Record<string, string[]>;
        transitionRoles: Record<string, Record<string, string[]>>;
      }>;
    };
    expect(workflow.customized).toBe(false);
    const presetsResponse = await app.inject({ method: "GET", url: `/projects/${project.id}/workflow-presets`, headers: { cookie: owner.cookie } });
    expect(presetsResponse.statusCode).toBe(200);
    expect(JSON.parse(presetsResponse.body)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "standard" }),
      expect.objectContaining({ key: "controlled" }),
      expect.objectContaining({ key: "verification" }),
    ]));
    workflow.schemes.task.transitions.backlog = ["ready"];
    workflow.schemes.task.requiredFields.ready = ["description"];
    workflow.schemes.task.transitionRoles.backlog.ready = ["project_manager"];
    const savedWorkflow = await app.inject({ method: "PUT", url: `/projects/${project.id}/workflow`, headers: { cookie: owner.cookie }, payload: { expectedVersion: workflow.version, schemes: workflow.schemes } });
    expect(savedWorkflow.statusCode).toBe(200);
    expect(JSON.parse(savedWorkflow.body)).toEqual(expect.objectContaining({ version: 2, customized: true }));
    const staleWorkflow = await app.inject({ method: "PUT", url: `/projects/${project.id}/workflow`, headers: { cookie: owner.cookie }, payload: { expectedVersion: workflow.version, schemes: workflow.schemes } });
    expect(staleWorkflow.statusCode).toBe(409);

    const firstResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "First task" } });
    const secondResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "Second task" } });
    const thirdResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "Third task" } });
    const first = JSON.parse(firstResponse.body) as { id: string; version: number };
    const second = JSON.parse(secondResponse.body) as { id: string; version: number };
    const third = JSON.parse(thirdResponse.body) as { id: string; version: number };
    const invalidTransition = await app.inject({ method: "PATCH", url: `/work-items/${first.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: first.version, status: "in_progress" } });
    expect(invalidTransition.statusCode).toBe(422);
    const missingRequiredField = await app.inject({ method: "PATCH", url: `/work-items/${first.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: first.version, status: "ready" } });
    expect(missingRequiredField.statusCode).toBe(422);
    const deniedByRole = await app.inject({ method: "PATCH", url: `/work-items/${first.id}`, headers: { cookie: editor.cookie }, payload: { expectedVersion: first.version, status: "ready", description: "Ready for implementation" } });
    expect(deniedByRole.statusCode).toBe(403);
    await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/members`,
      headers: { cookie: owner.cookie },
      payload: { userId: editor.userId, roleKey: "project_manager" },
    });
    const validTransition = await app.inject({ method: "PATCH", url: `/work-items/${first.id}`, headers: { cookie: editor.cookie }, payload: { expectedVersion: first.version, status: "ready", description: "Ready for implementation" } });
    expect(validTransition.statusCode).toBe(200);
    const moved = await app.inject({ method: "POST", url: `/work-items/${second.id}/move`, headers: { cookie: owner.cookie }, payload: { expectedVersion: second.version, targetStatus: "backlog", anchorId: first.id, position: "before" } });
    expect(moved.statusCode).toBe(400);
    const reordered = await app.inject({ method: "POST", url: `/work-items/${third.id}/move`, headers: { cookie: owner.cookie }, payload: { expectedVersion: third.version, targetStatus: "backlog", anchorId: second.id, position: "before" } });
    expect(reordered.statusCode).toBe(200);
    const orderedResponse = await app.inject({ method: "GET", url: `/workspaces/${workspace.id}/work-items?projectId=${project.id}&status=backlog`, headers: { cookie: owner.cookie } });
    expect((JSON.parse(orderedResponse.body) as Array<{ id: string }>).map((item) => item.id)).toEqual([third.id, second.id]);
    const events = await prisma.auditEvent.findMany({ where: { OR: [{ entityType: "project", entityId: project.id }, { entityType: "work_item", entityId: third.id }] } });
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["work_item.workflow_updated", "work_item.moved"]));
  });

  it("persists advisory board settings and rejects invalid board input", async () => {
    const owner = await registerActor(app, "board-owner");
    const { workspace } = await createOrgWorkspaceDocument(app, owner);
    const projectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Board settings", code: "BRD" } });
    const project = JSON.parse(projectResponse.body) as { id: string };
    const initialResponse = await app.inject({ method: "GET", url: `/projects/${project.id}/workflow`, headers: { cookie: owner.cookie } });
    const initial = JSON.parse(initialResponse.body) as {
      version: number;
      board: { wipLimits: Record<string, number>; defaultSwimlane: string };
      schemes: Record<string, unknown>;
    };
    expect(initial.board).toEqual({ wipLimits: {}, defaultSwimlane: "none" });

    const saved = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/workflow`,
      headers: { cookie: owner.cookie },
      payload: { expectedVersion: initial.version, schemes: initial.schemes, board: { wipLimits: { in_progress: 1, done: null }, defaultSwimlane: "assignee" } },
    });
    expect(saved.statusCode).toBe(200);
    expect((JSON.parse(saved.body) as { board: unknown }).board).toEqual({ wipLimits: { in_progress: 1 }, defaultSwimlane: "assignee" });

    const rejectedLimit = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/workflow`,
      headers: { cookie: owner.cookie },
      payload: { expectedVersion: 2, schemes: initial.schemes, board: { wipLimits: { in_progress: 0 }, defaultSwimlane: "none" } },
    });
    expect(rejectedLimit.statusCode).toBe(400);
    const rejectedSwimlane = await app.inject({
      method: "PUT",
      url: `/projects/${project.id}/workflow`,
      headers: { cookie: owner.cookie },
      payload: { expectedVersion: 2, schemes: initial.schemes, board: { wipLimits: {}, defaultSwimlane: "sprint" } },
    });
    expect(rejectedSwimlane.statusCode).toBe(400);

    const firstResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "First board task" } });
    const secondResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "Second board task" } });
    const first = JSON.parse(firstResponse.body) as { id: string; version: number };
    const second = JSON.parse(secondResponse.body) as { id: string; version: number };
    const firstMove = await app.inject({ method: "PATCH", url: `/work-items/${first.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: first.version, status: "in_progress" } });
    expect(firstMove.statusCode).toBe(200);
    const secondMove = await app.inject({ method: "PATCH", url: `/work-items/${second.id}`, headers: { cookie: owner.cookie }, payload: { expectedVersion: second.version, status: "in_progress" } });
    expect(secondMove.statusCode).toBe(200);
  });

  it("manages releases and iterations as project entities", async () => {
    const owner = await registerActor(app, "planning-owner");
    const viewer = await registerActor(app, "planning-viewer");
    const { org, workspace } = await createOrgWorkspaceDocument(app, owner);
    await app.inject({ method: "POST", url: `/organizations/${org.id}/members`, headers: { cookie: owner.cookie }, payload: { userId: viewer.userId, roleKey: "viewer" } });
    const projectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Planning", code: "PLN" } });
    const project = JSON.parse(projectResponse.body) as { id: string };

    const releaseResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/releases`, headers: { cookie: owner.cookie }, payload: { name: "1.0", releaseDate: "2026-09-01" } });
    expect(releaseResponse.statusCode).toBe(201);
    const release = JSON.parse(releaseResponse.body) as { id: string; status: string };
    expect(release.status).toBe("planned");
    const iterationResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/iterations`, headers: { cookie: owner.cookie }, payload: { name: "Sprint 1", startDate: "2026-08-01", endDate: "2026-08-14" } });
    expect(iterationResponse.statusCode).toBe(201);
    const iteration = JSON.parse(iterationResponse.body) as { id: string };

    const duplicate = await app.inject({ method: "POST", url: `/projects/${project.id}/iterations`, headers: { cookie: owner.cookie }, payload: { name: "Sprint 1" } });
    expect(duplicate.statusCode).toBe(409);
    const invalidRange = await app.inject({ method: "POST", url: `/projects/${project.id}/iterations`, headers: { cookie: owner.cookie }, payload: { name: "Sprint 2", startDate: "2026-08-20", endDate: "2026-08-10" } });
    expect(invalidRange.statusCode).toBe(409);

    const viewerRead = await app.inject({ method: "GET", url: `/projects/${project.id}/iterations`, headers: { cookie: viewer.cookie } });
    expect(viewerRead.statusCode).toBe(200);
    const viewerWrite = await app.inject({ method: "POST", url: `/projects/${project.id}/iterations`, headers: { cookie: viewer.cookie }, payload: { name: "Sprint 9" } });
    expect(viewerWrite.statusCode).toBe(403);

    const itemResponse = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "Planned task", releaseId: release.id, iterationId: iteration.id } });
    expect(itemResponse.statusCode).toBe(201);
    const item = JSON.parse(itemResponse.body) as { id: string; version: number; release: { name: string }; iteration: { name: string } };
    expect(item.release.name).toBe("1.0");
    expect(item.iteration.name).toBe("Sprint 1");

    const otherProjectResponse = await app.inject({ method: "POST", url: `/workspaces/${workspace.id}/projects`, headers: { cookie: owner.cookie }, payload: { name: "Other", code: "OTH" } });
    const otherProject = JSON.parse(otherProjectResponse.body) as { id: string };
    const foreign = await app.inject({ method: "POST", url: `/projects/${otherProject.id}/work-items`, headers: { cookie: owner.cookie }, payload: { type: "task", title: "Foreign", iterationId: iteration.id } });
    expect(foreign.statusCode).toBe(404);

    const filtered = await app.inject({ method: "GET", url: `/workspaces/${workspace.id}/work-items?projectId=${project.id}&iterationId=${iteration.id}`, headers: { cookie: owner.cookie } });
    expect((JSON.parse(filtered.body) as Array<{ id: string }>).map((entry) => entry.id)).toEqual([item.id]);
    const unplanned = await app.inject({ method: "GET", url: `/workspaces/${workspace.id}/work-items?projectId=${project.id}&iterationId=none`, headers: { cookie: owner.cookie } });
    expect(JSON.parse(unplanned.body)).toEqual([]);

    const listed = await app.inject({ method: "GET", url: `/projects/${project.id}/iterations`, headers: { cookie: owner.cookie } });
    expect(JSON.parse(listed.body)).toEqual([expect.objectContaining({ name: "Sprint 1", workItemCount: 1, completedCount: 0 })]);

    // Archiving is a reversible soft delete that releases its work items rather
    // than deleting them.
    const archived = await app.inject({ method: "DELETE", url: `/iterations/${iteration.id}`, headers: { cookie: owner.cookie } });
    expect(archived.statusCode).toBe(200);
    const afterArchive = await app.inject({ method: "GET", url: `/projects/${project.id}/iterations`, headers: { cookie: owner.cookie } });
    expect(JSON.parse(afterArchive.body)).toEqual([]);
    const keptItem = await app.inject({ method: "GET", url: `/work-items/${item.id}`, headers: { cookie: owner.cookie } });
    expect(keptItem.statusCode).toBe(200);
    expect(JSON.parse(keptItem.body)).toEqual(expect.objectContaining({ iteration: null, release: expect.objectContaining({ name: "1.0" }) }));

    const reusedName = await app.inject({ method: "POST", url: `/projects/${project.id}/iterations`, headers: { cookie: owner.cookie }, payload: { name: "Sprint 1" } });
    expect(reusedName.statusCode).toBe(201);

    const events = await prisma.auditEvent.findMany({ where: { entityType: { in: ["project_release", "project_iteration"] } } });
    expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["release.created", "iteration.created", "iteration.archived"]));
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
    expect(plan.key).toMatch(/^VER-\d+$/);
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
    expect(defect.key).toMatch(/^VER-\d+$/);
    expect(defect).toEqual(expect.objectContaining({
      stepsToReproduce: "Sign in",
      actualResult: "Authentication was accepted",
      environment: "staging",
      affectedVersion: "1.2.0",
      artifactLinks: [expect.objectContaining({ testStepExecutionId: stepExecutionId })],
    }));
    const storedStep = await prisma.testStepExecution.findUniqueOrThrow({ where: { id: stepExecutionId } });
    expect(storedStep.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "defect", reference: defect.key, workItemId: defect.id })]));
    const removableTestResponse = await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "test_case", title: "Removable test", parentId: null } });
    const removableTest = JSON.parse(removableTestResponse.body) as { id: string };
    await app.inject({ method: "POST", url: `/documents/${document.id}/rows`, headers: { cookie: owner.cookie }, payload: { rowType: "test_step", title: "Temporary step", parentId: removableTest.id } });
    const removableItemResponse = await app.inject({ method: "POST", url: `/test-plans/${plan.id}/items`, headers: { cookie: owner.cookie }, payload: { testCaseRowId: removableTest.id } });
    const removableItem = JSON.parse(removableItemResponse.body) as { id: string };
    const removedResponse = await app.inject({ method: "DELETE", url: `/test-plan-items/${removableItem.id}`, headers: { cookie: owner.cookie } });
    expect(removedResponse.statusCode).toBe(200);
    expect(await prisma.testPlanItem.findUniqueOrThrow({ where: { id: removableItem.id } })).toEqual(expect.objectContaining({ deletedById: owner.userId, deletedAt: expect.any(Date) }));
    const dashboardResponse = await app.inject({ method: "GET", url: `/projects/${project.id}/work-dashboard`, headers: { cookie: owner.cookie } });
    expect(JSON.parse(dashboardResponse.body).metrics).toEqual(expect.objectContaining({
      testCases: 2,
      plannedTests: 1,
      executions: 1,
      failedExecutions: 1,
      executionPassRate: 0,
      openDefects: 1,
      linkedEvidence: 1,
    }));
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
    const workflow = await app.inject({ method: "GET", url: `/projects/${project.id}/workflow`, headers: { cookie: viewer.cookie } });
    expect(workflow.statusCode).toBe(200);
    const workflowBody = JSON.parse(workflow.body) as { version: number; schemes: unknown };
    const deniedWorkflow = await app.inject({ method: "PUT", url: `/projects/${project.id}/workflow`, headers: { cookie: viewer.cookie }, payload: { expectedVersion: workflowBody.version, schemes: workflowBody.schemes } });
    expect(deniedWorkflow.statusCode).toBe(403);
    const detail = await app.inject({ method: "GET", url: `/work-items/${workItem.id}`, headers: { cookie: viewer.cookie } });
    expect(JSON.parse(detail.body)).toEqual(expect.objectContaining({ artifactLinks: [] }));
    const denied = await app.inject({ method: "POST", url: `/projects/${project.id}/work-items`, headers: { cookie: viewer.cookie }, payload: { type: "bug", title: "Denied" } });
    expect(denied.statusCode).toBe(403);
  });
});
