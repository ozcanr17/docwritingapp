import { PrismaClient } from "@docsys/database";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StorageService } from "../src/storage/storage.service";
import { buildApp, createDocument, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("lifecycle capabilities", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let teammate: TestActor;
  let workspaceId: string;
  let requirementDocumentId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    actor = await registerActor(app, "lifecycle-owner");
    const created = await createOrgWorkspaceDocument(app, actor);
    teammate = await registerActor(app, "lifecycle-teammate");
    await prisma.organizationMember.create({ data: { organizationId: created.org.id, userId: teammate.userId } });
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
    const row = JSON.parse(rowResponse.body) as { id: string; objectNumber: number };
    const view = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/views`, headers: { cookie: actor.cookie }, payload: { name: "Safety", scope: "team", filters: [], sorting: [], visibleColumns: ["requirementNo", "title"], frozenColumns: ["requirementNo"], linkProjection: {}, isDefault: false } });
    expect(view.statusCode).toBe(201);
    const search = await app.inject({ method: "GET", url: `/workspaces/${workspaceId}/search?q=Propulsion`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(search.body)).toEqual(expect.arrayContaining([expect.objectContaining({ id: row.id })]));
    const objectSearch = await app.inject({ method: "GET", url: `/workspaces/${workspaceId}/search?q=${row.objectNumber}`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(objectSearch.body)).toEqual(expect.arrayContaining([expect.objectContaining({ rowId: row.id, objectNumber: row.objectNumber })]));
    const document = await prisma.document.findUniqueOrThrow({ where: { id: requirementDocumentId } });
    const documentSearch = await app.inject({ method: "GET", url: `/workspaces/${workspaceId}/search?q=${encodeURIComponent(document.title)}`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(documentSearch.body)).toEqual(expect.arrayContaining([expect.objectContaining({ id: `document:${requirementDocumentId}`, rowId: null })]));
    const quality = await app.inject({ method: "GET", url: `/documents/${requirementDocumentId}/quality`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(quality.body).summary.untestedRequirement).toBe(1);
    const readiness = await app.inject({ method: "GET", url: `/documents/${requirementDocumentId}/release-readiness`, headers: { cookie: actor.cookie } });
    expect(readiness.statusCode).toBe(200);
    expect(JSON.parse(readiness.body)).toEqual(expect.objectContaining({
      status: "blocked",
      score: expect.any(Number),
      gates: expect.arrayContaining([expect.objectContaining({ key: "traceability", status: "failed" })]),
      counts: expect.objectContaining({ uncoveredRequirements: 1 }),
      issues: expect.arrayContaining([expect.objectContaining({ rule: "uncovered_requirement", rowId: row.id })]),
    }));
    const reviewWithoutBaseline = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/reviews`, headers: { cookie: actor.cookie }, payload: { title: "Formal review", reviewerIds: [actor.userId], activate: true } });
    expect(reviewWithoutBaseline.statusCode).toBe(422);
    const baselineResponse = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/baselines`, headers: { cookie: actor.cookie }, payload: { label: "Review package" } });
    const baseline = JSON.parse(baselineResponse.body) as { revisionNumber: number; semanticVersion: string };
    const reviewResponse = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/reviews`, headers: { cookie: actor.cookie }, payload: { title: "Formal review", reviewerIds: [actor.userId], activate: true } });
    expect(reviewResponse.statusCode).toBe(201);
    expect(JSON.parse(reviewResponse.body)).toEqual(expect.objectContaining({ baselineRevisionNumber: baseline.revisionNumber, baselineSemanticVersion: baseline.semanticVersion, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    const outsider = await registerActor(app, "review-outsider");
    const invalidReview = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/reviews`, headers: { cookie: actor.cookie }, payload: { title: "Invalid external review", reviewerIds: [outsider.userId], activate: true } });
    expect(invalidReview.statusCode).toBe(422);
    expect(await prisma.notification.count({ where: { recipientId: outsider.userId, type: "review_requested" } })).toBe(0);
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
    const evidenceResponse = await app.inject({ method: "POST", url: `/executions/${execution.id}/steps/${step.id}/evidence`, headers: { cookie: actor.cookie }, payload: { kind: "defect", reference: "BUG-42", summary: "Stop command is ignored", url: "https://issues.example.test/BUG-42" } });
    expect(evidenceResponse.statusCode).toBe(201);
    const evidence = JSON.parse(evidenceResponse.body).evidence as Array<{ id: string; kind: string; reference: string }>;
    expect(evidence).toEqual([expect.objectContaining({ kind: "defect", reference: "BUG-42" })]);
    const attachmentResponse = await app.inject({ method: "POST", url: `/rows/${step.id}/attachments`, headers: { cookie: actor.cookie }, payload: { fileName: "execution.log", contentType: "text/plain", sizeBytes: 4 } });
    const attachment = JSON.parse(attachmentResponse.body) as { id: string };
    const storage = app.get(StorageService);
    vi.spyOn(storage, "statObject").mockResolvedValue({ size: 4, metaData: { "content-type": "text/plain" } } as never);
    const attachmentEvidenceResponse = await app.inject({ method: "POST", url: `/executions/${execution.id}/steps/${step.id}/evidence`, headers: { cookie: actor.cookie }, payload: { kind: "attachment", attachmentId: attachment.id } });
    expect(attachmentEvidenceResponse.statusCode).toBe(201);
    const attachmentEvidence = (JSON.parse(attachmentEvidenceResponse.body).evidence as Array<{ id: string; kind: string; fileName?: string }>).find((item) => item.kind === "attachment");
    expect(attachmentEvidence).toMatchObject({ fileName: "execution.log" });
    const removeEvidence = await app.inject({ method: "DELETE", url: `/executions/${execution.id}/steps/${step.id}/evidence/${attachmentEvidence?.id}`, headers: { cookie: actor.cookie } });
    expect(removeEvidence.statusCode).toBe(200);
    vi.restoreAllMocks();
    const executionsWithEvidence = await app.inject({ method: "GET", url: `/rows/${testCase.id}/executions`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(executionsWithEvidence.body)[0].steps[0].evidence).toEqual([expect.objectContaining({ reference: "BUG-42" })]);
    const evidenceAudit = await prisma.auditEvent.findFirst({ where: { action: "test_execution.evidence_added", entityId: execution.id } });
    expect(evidenceAudit).not.toBeNull();
    await app.inject({ method: "PATCH", url: `/executions/${execution.id}/steps/${step.id}`, headers: { cookie: actor.cookie }, payload: { status: "passed", actualResult: "Stopped" } });
    const complete = await app.inject({ method: "POST", url: `/executions/${execution.id}/complete`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(complete.body).status).toBe("passed");
    const immutableEvidence = await app.inject({ method: "POST", url: `/executions/${execution.id}/steps/${step.id}/evidence`, headers: { cookie: actor.cookie }, payload: { kind: "defect", reference: "BUG-99" } });
    expect(immutableEvidence.statusCode).toBe(422);
  });

  it("notifies mentioned and assigned users and exposes a searchable personal work list", async () => {
    const testDocument = await createDocument(app, actor, workspaceId, "test", "Personal work");
    const testCaseResponse = await app.inject({ method: "POST", url: `/documents/${testDocument.id}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "test_case", title: "Assigned verification", parentId: null } });
    const testCase = JSON.parse(testCaseResponse.body) as { id: string; version: number };
    const people = await app.inject({ method: "GET", url: `/rows/${testCase.id}/people?q=teammate`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(people.body)).toEqual(expect.arrayContaining([expect.objectContaining({ id: teammate.userId })]));
    const assignment = await app.inject({ method: "PATCH", url: `/rows/${testCase.id}`, headers: { cookie: actor.cookie }, payload: { expectedVersion: testCase.version, testCaseDetail: { assigneeId: teammate.userId } } });
    expect(assignment.statusCode).toBe(200);
    const comment = await app.inject({ method: "POST", url: `/rows/${testCase.id}/comments`, headers: { cookie: actor.cookie }, payload: { body: "Please review", mentionUserIds: [teammate.userId] } });
    expect(comment.statusCode).toBe(201);
    const notifications = await app.inject({ method: "GET", url: "/notifications", headers: { cookie: teammate.cookie } });
    expect(JSON.parse(notifications.body)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "assignment" }), expect.objectContaining({ type: "mention" })]));
    const work = await app.inject({ method: "GET", url: "/my-work?q=assigned", headers: { cookie: teammate.cookie } });
    expect(JSON.parse(work.body)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "assignment", rowId: testCase.id })]));
    const mentions = await app.inject({ method: "GET", url: "/my-work?kind=mention", headers: { cookie: teammate.cookie } });
    expect(JSON.parse(mentions.body)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "mention", rowId: testCase.id })]));
    const readAll = await app.inject({ method: "POST", url: "/notifications/read-all", headers: { cookie: teammate.cookie } });
    expect(JSON.parse(readAll.body).updated).toBeGreaterThanOrEqual(2);
    const readNotifications = await app.inject({ method: "GET", url: "/notifications", headers: { cookie: teammate.cookie } });
    expect(JSON.parse(readNotifications.body).every((item: { readAt: string | null }) => item.readAt !== null)).toBe(true);
  });

  it("reuses section snapshots and turns anchored suggestions into proposals", async () => {
    const headingResponse = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "heading", title: "Reusable section", parentId: null },
    });
    const heading = JSON.parse(headingResponse.body) as { id: string };
    const requirementResponse = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "requirement", title: "Review selected text", parentId: heading.id },
    });
    const requirement = JSON.parse(requirementResponse.body) as { id: string };
    const createdTemplate = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/templates`,
      headers: { cookie: actor.cookie },
      payload: { name: "Review section", sourceRowId: heading.id },
    });
    expect(createdTemplate.statusCode).toBe(201);
    const template = JSON.parse(createdTemplate.body) as { id: string; templateKind: string };
    expect(template.templateKind).toBe("section");
    const applied = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/templates/${template.id}/apply`,
      headers: { cookie: actor.cookie },
      payload: { parentId: null },
    });
    expect(JSON.parse(applied.body)).toEqual(expect.objectContaining({ rowsCreated: 2, rootIds: expect.any(Array) }));
    const comment = await app.inject({
      method: "POST",
      url: `/rows/${requirement.id}/comments`,
      headers: { cookie: actor.cookie },
      payload: {
        body: "Use a clearer term",
        mentionUserIds: [],
        anchor: { field: "title", start: 7, end: 15, quotedText: "selected" },
        suggestedReplacement: "approved",
      },
    });
    expect(comment.statusCode).toBe(201);
    expect(JSON.parse(comment.body).anchor.quotedText).toBe("selected");
    const proposals = await app.inject({ method: "GET", url: `/rows/${requirement.id}/proposals`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(proposals.body)).toEqual(expect.arrayContaining([expect.objectContaining({ status: "submitted", proposedPatch: expect.objectContaining({ title: "Review approved text" }) })]));
  });

  it("runs heading-based tests and updates step status from the row", async () => {
    const testDocument = await createDocument(app, actor, workspaceId, "test", "Heading execution");
    const template = await app.inject({ method: "POST", url: `/documents/${testDocument.id}/test-templates`, headers: { cookie: actor.cookie }, payload: { name: "Login", parentId: null, sectionTitles: ["Preconditions", "Inputs", "Constraints", "Steps"], defaultContent: "None." } });
    const created = JSON.parse(template.body) as { root: { id: string }; step: { id: string } };
    const executionResponse = await app.inject({ method: "POST", url: `/rows/${created.root.id}/executions`, headers: { cookie: actor.cookie }, payload: {} });
    expect(executionResponse.statusCode).toBe(201);
    const status = await app.inject({ method: "PATCH", url: `/test-steps/${created.step.id}/status`, headers: { cookie: actor.cookie }, payload: { status: "passed" } });
    expect(status.statusCode).toBe(200);
    const runs = await app.inject({ method: "GET", url: `/documents/${testDocument.id}/executions`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(runs.body)[0]).toEqual(expect.objectContaining({ status: "running", testCaseRow: expect.objectContaining({ title: "Login" }) }));
    const execution = JSON.parse(executionResponse.body) as { id: string };
    const stopped = await app.inject({ method: "POST", url: `/executions/${execution.id}/stop`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(stopped.body).status).toBe("skipped");
  });

  it("turns change impact into an auditable retest package and execution", async () => {
    const requirementResponse = await app.inject({ method: "POST", url: `/documents/${requirementDocumentId}/rows`, headers: { cookie: actor.cookie }, payload: { rowType: "requirement", title: "Brake on command", parentId: null } });
    const requirement = JSON.parse(requirementResponse.body) as { id: string; version: number };
    const testDocument = await createDocument(app, actor, workspaceId, "test", "Impact verification");
    const stepResponse = await app.inject({
      method: "POST",
      url: `/documents/${testDocument.id}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "test_step", title: "Apply brake", parentId: null, testStepDetail: { action: "Apply brake", expectedResult: "Vehicle stops" } },
    });
    const step = JSON.parse(stepResponse.body) as { id: string; version: number };
    await app.inject({
      method: "PATCH",
      url: `/rows/${step.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: step.version, testStepDetail: { action: "Apply brake", expectedResult: "Vehicle stops" } },
    });
    const linkResponse = await app.inject({ method: "POST", url: `/rows/${step.id}/links`, headers: { cookie: actor.cookie }, payload: { targetRowId: requirement.id, linkType: "verifies" } });
    expect(linkResponse.statusCode).toBe(201);
    const readinessBeforeExecution = await app.inject({ method: "GET", url: `/documents/${testDocument.id}/release-readiness`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(readinessBeforeExecution.body)).toEqual(expect.objectContaining({
      status: "ready",
      gates: expect.arrayContaining([expect.objectContaining({ key: "verification", required: false, status: "warning" })]),
    }));
    const updateResponse = await app.inject({ method: "PATCH", url: `/rows/${requirement.id}`, headers: { cookie: actor.cookie }, payload: { expectedVersion: requirement.version, title: "Brake within one second" } });
    expect(updateResponse.statusCode).toBe(200);

    const impactResponse = await app.inject({ method: "GET", url: `/documents/${requirementDocumentId}/impact-analysis?depth=1`, headers: { cookie: actor.cookie } });
    expect(impactResponse.statusCode).toBe(200);
    const impact = JSON.parse(impactResponse.body) as { retestCandidates: Array<{ rowId: string; reason: string }> };
    expect(impact.retestCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ rowId: step.id, reason: "suspect_link" })]));

    const stalePackageResponse = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/retest-packages`,
      headers: { cookie: actor.cookie },
      payload: { name: "Stale selection", candidateRowIds: [crypto.randomUUID()], impactDepth: 1 },
    });
    expect(stalePackageResponse.statusCode).toBe(422);

    const packageResponse = await app.inject({
      method: "POST",
      url: `/documents/${requirementDocumentId}/retest-packages`,
      headers: { cookie: actor.cookie },
      payload: { name: "Brake change verification", candidateRowIds: [step.id], impactDepth: 1 },
    });
    expect(packageResponse.statusCode).toBe(201);
    const createdPackage = JSON.parse(packageResponse.body) as { id: string; items: Array<{ id: string }> };
    const executionResponse = await app.inject({ method: "POST", url: `/rows/${step.id}/executions`, headers: { cookie: actor.cookie }, payload: { retestPackageItemId: createdPackage.items[0]!.id } });
    expect(executionResponse.statusCode).toBe(201);
    const execution = JSON.parse(executionResponse.body) as { id: string };
    await app.inject({ method: "PATCH", url: `/executions/${execution.id}/steps/${step.id}`, headers: { cookie: actor.cookie }, payload: { status: "passed", actualResult: "Stopped" } });
    const completeResponse = await app.inject({ method: "POST", url: `/executions/${execution.id}/complete`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(completeResponse.body).status).toBe("passed");

    const packagesResponse = await app.inject({ method: "GET", url: `/documents/${requirementDocumentId}/retest-packages`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(packagesResponse.body)).toEqual(expect.arrayContaining([expect.objectContaining({ id: createdPackage.id, status: "completed", progress: { total: 1, completed: 1, passed: 1, failed: 0 } })]));
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: "retest_package", entityId: createdPackage.id, action: "retest_package.created" } });
    expect(audit).not.toBeNull();
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
