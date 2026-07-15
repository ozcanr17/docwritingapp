import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createDocument, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("document rows", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let documentId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    actor = await registerActor(app, "rows-owner");
    const created = await createOrgWorkspaceDocument(app, actor);
    documentId = created.document.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createRow(payload: Record<string, unknown>, idempotencyKey?: string, targetDocumentId = documentId) {
    const response = await app.inject({
      method: "POST",
      url: `/documents/${targetDocumentId}/rows`,
      headers: { cookie: actor.cookie, ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
      payload,
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as { id: string; objectNumber: number; version: number; rank: string; depth: number };
  }

  it("creates a hierarchy and derives display numbers", async () => {
    const heading = await createRow({ rowType: "heading", title: "Introduction", parentId: null });
    const req1 = await createRow({ rowType: "requirement", title: "Req 1", parentId: heading.id });
    await createRow({ rowType: "requirement", title: "Req 2", parentId: heading.id });
    await createRow({ rowType: "heading", title: "Scope", parentId: null });

    const outline = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/outline`,
      headers: { cookie: actor.cookie },
    });
    expect(outline.statusCode).toBe(200);
    const rows = JSON.parse(outline.body) as Array<{ title: string; objectNumber: number; displayNumber: string; requirementNo: string | null }>;
    const byTitle = new Map(rows.map((r) => [r.title, r.displayNumber]));
    expect(byTitle.get("Introduction")).toBe("1");
    expect(byTitle.get("Req 1")).toBe("1.1");
    expect(byTitle.get("Req 2")).toBe("1.2");
    expect(byTitle.get("Scope")).toBe("2");
    expect(rows.find((row) => row.title === "Introduction")?.objectNumber).toBe(1);
    expect(rows.find((row) => row.title === "Req 1")?.objectNumber).toBe(2);
    expect(rows.find((row) => row.title === "Req 2")?.objectNumber).toBe(3);
    expect(rows.find((row) => row.title === "Scope")?.objectNumber).toBe(4);
    expect(rows.find((row) => row.title === "Req 1")?.requirementNo).toBe("REQ-001");
    expect(rows.find((row) => row.title === "Req 2")?.requirementNo).toBe("REQ-002");
    expect(req1.depth).toBe(1);
  });

  it("keeps requirement numbers unique inside a document", async () => {
    const first = await createRow({ rowType: "requirement", title: "Numbered A", parentId: null });
    const second = await createRow({ rowType: "requirement", title: "Numbered B", parentId: null });
    const firstUpdate = await app.inject({
      method: "PATCH",
      url: `/rows/${first.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: first.version, requirementDetail: { requirementNo: "SYS-100" } },
    });
    expect(firstUpdate.statusCode).toBe(200);
    const duplicate = await app.inject({
      method: "PATCH",
      url: `/rows/${second.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: second.version, requirementDetail: { requirementNo: "sys-100" } },
    });
    expect(duplicate.statusCode).toBe(422);
  });

  it("enforces document row types and stores test step results", async () => {
    const sourceDocument = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const testDocument = await createDocument(app, actor, sourceDocument.workspaceId, "test", "Execution tests");
    const invalidRequirement = await app.inject({
      method: "POST",
      url: `/documents/${testDocument.id}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "requirement", title: "Wrong type", parentId: null },
    });
    expect(invalidRequirement.statusCode).toBe(422);

    const testCase = await createRow(
      { rowType: "test_case", title: "Login", parentId: null },
      undefined,
      testDocument.id,
    );
    const testStep = await createRow(
      { rowType: "test_step", title: "Enter credentials", parentId: testCase.id },
      undefined,
      testDocument.id,
    );
    const update = await app.inject({
      method: "PATCH",
      url: `/rows/${testStep.id}`,
      headers: { cookie: actor.cookie },
      payload: {
        expectedVersion: testStep.version,
        testStepDetail: { stepNumber: 7, action: "Enter valid credentials", expectedResult: "Dashboard opens", testResult: "Passed" },
      },
    });
    expect(update.statusCode).toBe(200);

    const outline = await app.inject({
      method: "GET",
      url: `/documents/${testDocument.id}/outline`,
      headers: { cookie: actor.cookie },
    });
    const rows = JSON.parse(outline.body) as Array<{ id: string; stepNumber: number | null; testResult: string | null }>;
    expect(rows.find((row) => row.id === testStep.id)?.testResult).toBe("Passed");
    expect(rows.find((row) => row.id === testStep.id)?.stepNumber).toBe(7);
  });

  it("creates heading-based test templates and permits root test steps", async () => {
    const sourceDocument = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const testDocument = await createDocument(app, actor, sourceDocument.workspaceId, "test", "Template tests");
    const rootStep = await createRow({ rowType: "test_step", title: "Independent step", parentId: null }, undefined, testDocument.id);
    expect(rootStep.depth).toBe(0);
    const response = await app.inject({
      method: "POST",
      url: `/documents/${testDocument.id}/test-templates`,
      headers: { cookie: actor.cookie },
      payload: { name: "Authentication", parentId: null, sectionTitles: ["Preconditions", "Inputs", "Constraints", "Steps"], defaultContent: "None." },
    });
    expect(response.statusCode).toBe(201);
    const outline = await app.inject({ method: "GET", url: `/documents/${testDocument.id}/outline`, headers: { cookie: actor.cookie } });
    const rows = JSON.parse(outline.body) as Array<{ rowType: string; title: string; displayNumber: string }>;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowType: "heading", title: "Authentication" }),
      expect.objectContaining({ rowType: "heading", title: "Preconditions" }),
      expect.objectContaining({ rowType: "test_step", title: "" }),
      expect.objectContaining({ rowType: "note", title: "None." }),
    ]));
    expect(rows.filter((row) => row.rowType === "note" && row.title === "None.")).toHaveLength(3);
    const created = JSON.parse(response.body) as { root: { id: string } };
    const removeTemplate = await app.inject({
      method: "DELETE",
      url: `/rows/${created.root.id}`,
      headers: { cookie: actor.cookie },
      payload: { childStrategy: "delete_subtree" },
    });
    expect(removeTemplate.statusCode).toBe(200);
    const removedOutline = await app.inject({ method: "GET", url: `/documents/${testDocument.id}/outline`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(removedOutline.body)).toHaveLength(1);
    const restoreTemplate = await app.inject({ method: "POST", url: `/rows/${created.root.id}/restore`, headers: { cookie: actor.cookie } });
    expect(restoreTemplate.statusCode).toBe(201);
    const restoredOutline = await app.inject({ method: "GET", url: `/documents/${testDocument.id}/outline`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(restoredOutline.body)).toHaveLength(10);
  });

  it("stores semantic cell values on headings and blank objects", async () => {
    const sourceDocument = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const testDocument = await createDocument(app, actor, sourceDocument.workspaceId, "test", "Flexible cells");
    const heading = await createRow({ rowType: "heading", title: "Editable heading", parentId: null }, undefined, testDocument.id);
    const update = await app.inject({
      method: "PATCH",
      url: `/rows/${heading.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: heading.version, testStepDetail: { action: "Heading action", expectedResult: "Heading result" } },
    });
    expect(update.statusCode).toBe(200);
    const outline = await app.inject({ method: "GET", url: `/documents/${testDocument.id}/outline`, headers: { cookie: actor.cookie } });
    expect(JSON.parse(outline.body)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: heading.id, action: "Heading action", expectedResult: "Heading result" }),
    ]));
  });

  it("returns 409 for stale version updates and does not overwrite", async () => {
    const row = await createRow({ rowType: "requirement", title: "Original", parentId: null });
    const firstUpdate = await app.inject({
      method: "PATCH",
      url: `/rows/${row.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: row.version, title: "Updated by A" },
    });
    expect(firstUpdate.statusCode).toBe(200);

    const staleUpdate = await app.inject({
      method: "PATCH",
      url: `/rows/${row.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: row.version, title: "Updated by B (stale)" },
    });
    expect(staleUpdate.statusCode).toBe(409);

    const current = await prisma.documentRow.findUniqueOrThrow({ where: { id: row.id } });
    expect(current.title).toBe("Updated by A");
    expect(current.version).toBe(row.version + 1);
  });

  it("moves a row under a new parent and rejects cycles", async () => {
    const parentA = await createRow({ rowType: "heading", title: "A", parentId: null });
    const parentB = await createRow({ rowType: "heading", title: "B", parentId: null });
    const child = await createRow({ rowType: "requirement", title: "Child", parentId: parentA.id });

    const move = await app.inject({
      method: "POST",
      url: `/rows/${child.id}/move`,
      headers: { cookie: actor.cookie },
      payload: { newParentId: parentB.id, expectedVersion: child.version },
    });
    expect(move.statusCode).toBe(201);
    const moved = JSON.parse(move.body) as { parentId: string; objectNumber: number; depth: number; version: number };
    expect(moved.parentId).toBe(parentB.id);
    expect(moved.objectNumber).toBe(child.objectNumber);
    expect(moved.depth).toBe(1);

    const cycleMove = await app.inject({
      method: "POST",
      url: `/rows/${parentB.id}/move`,
      headers: { cookie: actor.cookie },
      payload: { newParentId: child.id, expectedVersion: parentB.version },
    });
    expect(cycleMove.statusCode).toBe(422);
  });

  it("updates descendant paths when moving a subtree", async () => {
    const root = await createRow({ rowType: "heading", title: "Root", parentId: null });
    const mid = await createRow({ rowType: "heading", title: "Mid", parentId: root.id });
    const leaf = await createRow({ rowType: "requirement", title: "Leaf", parentId: mid.id });
    const other = await createRow({ rowType: "heading", title: "Other", parentId: null });

    const move = await app.inject({
      method: "POST",
      url: `/rows/${mid.id}/move`,
      headers: { cookie: actor.cookie },
      payload: { newParentId: other.id, expectedVersion: mid.version },
    });
    expect(move.statusCode).toBe(201);

    const movedLeaf = await prisma.documentRow.findUniqueOrThrow({ where: { id: leaf.id } });
    expect(movedLeaf.depth).toBe(2);
    expect(movedLeaf.ancestorPath).toBe(`${other.id}/${mid.id}/`);
  });

  it("replays idempotent creates instead of duplicating", async () => {
    const key = `create-${Date.now()}`;
    const first = await createRow({ rowType: "note", title: "Idempotent", parentId: null }, key);
    const second = await createRow({ rowType: "note", title: "Idempotent", parentId: null }, key);
    expect(second.id).toBe(first.id);
    const count = await prisma.documentRow.count({ where: { documentId, title: "Idempotent" } });
    expect(count).toBe(1);
  });

  it("soft deletes a subtree and restores it", async () => {
    const parent = await createRow({ rowType: "heading", title: "DeleteMe", parentId: null });
    const child = await createRow({ rowType: "requirement", title: "DeleteChild", parentId: parent.id });
    const target = await createRow({ rowType: "requirement", title: "DeleteTarget", parentId: null });
    const linkResponse = await app.inject({ method: "POST", url: `/rows/${child.id}/links`, headers: { cookie: actor.cookie }, payload: { targetRowId: target.id, linkType: "relates_to" } });
    const linkId = (JSON.parse(linkResponse.body) as { id: string }).id;

    const del = await app.inject({
      method: "DELETE",
      url: `/rows/${parent.id}`,
      headers: { cookie: actor.cookie },
      payload: { reason: "cleanup" },
    });
    expect(del.statusCode).toBe(200);

    const deletedChild = await prisma.documentRow.findUniqueOrThrow({ where: { id: child.id } });
    expect(deletedChild.deletedAt).not.toBeNull();

    const restore = await app.inject({
      method: "POST",
      url: `/rows/${parent.id}/restore`,
      headers: { cookie: actor.cookie },
    });
    expect(restore.statusCode).toBe(201);

    const restoredChild = await prisma.documentRow.findUniqueOrThrow({ where: { id: child.id } });
    expect(restoredChild.deletedAt).toBeNull();
    const restoredLink = await prisma.requirementLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(restoredLink.deletedAt).toBeNull();
  });

  it("continues outline numbering from a user-selected heading number", async () => {
    const first = await createRow({ rowType: "heading", title: "Custom start", parentId: null });
    await app.inject({ method: "PATCH", url: `/rows/${first.id}`, headers: { cookie: actor.cookie }, payload: { expectedVersion: first.version, numberingStart: 7 } });
    await createRow({ rowType: "heading", title: "Continued", parentId: null });
    const outline = await app.inject({ method: "GET", url: `/documents/${documentId}/outline`, headers: { cookie: actor.cookie } });
    const rows = JSON.parse(outline.body) as Array<{ title: string; displayNumber: string }>;
    expect(rows.find((row) => row.title === "Custom start")?.displayNumber).toBe("7");
    expect(rows.find((row) => row.title === "Continued")?.displayNumber).toBe("8");
  });

  it("deletes only a heading and promotes its child subtree", async () => {
    const parent = await createRow({ rowType: "heading", title: "Promote parent", parentId: null });
    const child = await createRow({ rowType: "heading", title: "Promoted child", parentId: parent.id });
    const leaf = await createRow({ rowType: "requirement", title: "Promoted leaf", parentId: child.id });
    const response = await app.inject({ method: "DELETE", url: `/rows/${parent.id}`, headers: { cookie: actor.cookie }, payload: { childStrategy: "promote_children" } });
    expect(response.statusCode).toBe(200);
    const deletedParent = await prisma.documentRow.findUniqueOrThrow({ where: { id: parent.id } });
    const promotedChild = await prisma.documentRow.findUniqueOrThrow({ where: { id: child.id } });
    const promotedLeaf = await prisma.documentRow.findUniqueOrThrow({ where: { id: leaf.id } });
    expect(deletedParent.deletedAt).not.toBeNull();
    expect(promotedChild).toMatchObject({ parentId: null, depth: 0, deletedAt: null, ancestorPath: "" });
    expect(promotedLeaf).toMatchObject({ parentId: child.id, depth: 1, deletedAt: null, ancestorPath: `${child.id}/` });
  });

  it("links a test case to a requirement and soft deletes links with the row", async () => {
    const requirement = await createRow({ rowType: "requirement", title: "Linked Req", parentId: null });
    const testDocument = await createDocument(app, actor, (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).workspaceId, "test", "Tests");
    const testCase = await createRow({ rowType: "test_case", title: "TC", parentId: null }, undefined, testDocument.id);

    const link = await app.inject({
      method: "POST",
      url: `/rows/${testCase.id}/links`,
      headers: { cookie: actor.cookie },
      payload: { targetRowId: requirement.id, linkType: "verifies" },
    });
    expect(link.statusCode).toBe(201);

    const candidates = await app.inject({
      method: "GET",
      url: `/documents/${testDocument.id}/link-candidates?q=Linked`,
      headers: { cookie: actor.cookie },
    });
    expect(candidates.statusCode).toBe(200);
    expect(JSON.parse(candidates.body)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: requirement.id, title: "Linked Req" })]),
    );

    const detail = await app.inject({
      method: "GET",
      url: `/rows/${testCase.id}`,
      headers: { cookie: actor.cookie },
    });
    const detailBody = JSON.parse(detail.body) as { outgoingLinks: Array<{ targetRow: { title: string } }> };
    expect(detailBody.outgoingLinks[0]?.targetRow.title).toBe("Linked Req");

    const testOutline = await app.inject({
      method: "GET",
      url: `/documents/${testDocument.id}/outline`,
      headers: { cookie: actor.cookie },
    });
    const testRows = JSON.parse(testOutline.body) as Array<{
      id: string;
      linkedRequirements: Array<{ id: string; requirementNo: string; title: string }>;
    }>;
    expect(testRows.find((row) => row.id === testCase.id)?.linkedRequirements).toEqual([
      expect.objectContaining({ id: requirement.id, title: "Linked Req" }),
    ]);

    await app.inject({
      method: "DELETE",
      url: `/rows/${requirement.id}`,
      headers: { cookie: actor.cookie },
      payload: {},
    });

    const links = await prisma.requirementLink.findMany({ where: { targetRowId: requirement.id } });
    expect(links).toHaveLength(1);
    expect(links[0]?.deletedAt).not.toBeNull();
  });

  it("validates custom fields against definitions", async () => {
    const fieldRes = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/fields`,
      headers: { cookie: actor.cookie },
      payload: { fieldKey: "riskLevel", displayName: "Risk Level", fieldType: "single_select", allowedValues: ["low", "high"] },
    });
    expect(fieldRes.statusCode).toBe(201);

    const valid = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "requirement", title: "With fields", parentId: null, customFields: { riskLevel: "high" } },
    });
    expect(valid.statusCode).toBe(201);

    const invalid = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "requirement", title: "Bad fields", parentId: null, customFields: { riskLevel: "extreme" } },
    });
    expect(invalid.statusCode).toBe(422);
  });

  it("writes audit events in the same transaction as mutations", async () => {
    const row = await createRow({ rowType: "requirement", title: "Audited", parentId: null });
    const events = await prisma.auditEvent.findMany({
      where: { entityType: "document_row", entityId: row.id, action: "row.created" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.actorId).toBe(actor.userId);
  });

  it("handles two users moving the same row with one 409", async () => {
    const target = await createRow({ rowType: "heading", title: "Target", parentId: null });
    const contested = await createRow({ rowType: "requirement", title: "Contested", parentId: null });

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/rows/${contested.id}/move`,
        headers: { cookie: actor.cookie },
        payload: { newParentId: target.id, expectedVersion: contested.version },
      }),
      app.inject({
        method: "POST",
        url: `/rows/${contested.id}/move`,
        headers: { cookie: actor.cookie },
        payload: { newParentId: null, expectedVersion: contested.version },
      }),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 409]);
  });
});
