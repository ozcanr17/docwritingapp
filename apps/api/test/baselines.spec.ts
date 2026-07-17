import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createDocument, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("baselines and coverage", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let documentId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    actor = await registerActor(app, "baseline-owner");
    const created = await createOrgWorkspaceDocument(app, actor);
    documentId = created.document.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createRow(payload: Record<string, unknown>) {
    const response = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/rows`,
      headers: { cookie: actor.cookie, "idempotency-key": crypto.randomUUID() },
      payload,
    });
    return JSON.parse(response.body) as { id: string; version: number };
  }

  it("captures a baseline and diffs it against later changes", async () => {
    const keep = await createRow({ rowType: "requirement", title: "Stable requirement", parentId: null });
    const toChange = await createRow({ rowType: "requirement", title: "Original title", parentId: null });
    const toDelete = await createRow({ rowType: "requirement", title: "Will be removed", parentId: null });

    const baseline = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/baselines`,
      headers: { cookie: actor.cookie },
      payload: { label: "Release 1.0" },
    });
    expect(baseline.statusCode).toBe(201);
    const created = JSON.parse(baseline.body) as { revisionNumber: number; semanticVersion: string; rowCount: number };
    expect(created.rowCount).toBe(3);
    expect(created.semanticVersion).toBe("1.0");

    const baselineOutline = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/outline`,
      headers: { cookie: actor.cookie },
    });
    expect(JSON.parse(baselineOutline.body)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: keep.id, changeState: "baseline" }),
      expect.objectContaining({ id: toChange.id, changeState: "baseline" }),
    ]));

    await app.inject({
      method: "PATCH",
      url: `/rows/${toChange.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: toChange.version, title: "Updated title" },
    });
    await app.inject({
      method: "DELETE",
      url: `/rows/${toDelete.id}`,
      headers: { cookie: actor.cookie },
      payload: {},
    });
    const added = await createRow({ rowType: "requirement", title: "New requirement", parentId: null });

    const changedOutline = JSON.parse((await app.inject({
      method: "GET",
      url: `/documents/${documentId}/outline`,
      headers: { cookie: actor.cookie },
    })).body) as Array<{ id: string; changeState: string }>;
    expect(changedOutline.find((row) => row.id === keep.id)?.changeState).toBe("baseline");
    expect(changedOutline.find((row) => row.id === toChange.id)?.changeState).toBe("saved_self");
    expect(changedOutline.find((row) => row.id === added.id)?.changeState).toBe("saved_self");

    const diff = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/baselines/${created.revisionNumber}/diff`,
      headers: { cookie: actor.cookie },
    });
    expect(diff.statusCode).toBe(200);
    const body = JSON.parse(diff.body) as {
      summary: { added: number; removed: number; modified: number };
      added: { id: string; objectNumber: number; before: null; after: { title: string }; changedFields: string[] }[];
      removed: { id: string; objectNumber: number; before: { title: string }; after: null; changedFields: string[] }[];
      modified: { id: string; before: { title: string }; after: { title: string }; changedFields: string[] }[];
    };
    expect(body.summary).toEqual({ added: 1, removed: 1, modified: 1 });
    expect(body.added[0]?.id).toBe(added.id);
    expect(body.added[0]).toEqual(expect.objectContaining({ before: null, after: expect.objectContaining({ title: "New requirement" }), changedFields: ["row"] }));
    expect(body.removed[0]?.id).toBe(toDelete.id);
    expect(body.removed[0]).toEqual(expect.objectContaining({ before: expect.objectContaining({ title: "Will be removed" }), after: null, changedFields: ["row"] }));
    expect(body.modified[0]?.id).toBe(toChange.id);
    expect(body.modified[0]).toEqual(expect.objectContaining({ before: expect.objectContaining({ title: "Original title" }), after: expect.objectContaining({ title: "Updated title" }), changedFields: ["title"] }));
    expect(keep.id).toBeTruthy();

    const list = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/baselines`,
      headers: { cookie: actor.cookie },
    });
    expect(JSON.parse(list.body)).toHaveLength(1);
    const next = await app.inject({ method: "POST", url: `/documents/${documentId}/baselines`, headers: { cookie: actor.cookie }, payload: {} });
    expect(JSON.parse(next.body).semanticVersion).toBe("1.1");
  });

  it("reports requirement coverage from verifying links", async () => {
    const created = await createOrgWorkspaceDocument(app, actor);
    const doc = created.document.id;
    const testDocument = await createDocument(app, actor, created.workspace.id, "test", "Verification tests");
    const makeRow = (payload: Record<string, unknown>, targetDocumentId = doc) =>
      app
        .inject({
          method: "POST",
          url: `/documents/${targetDocumentId}/rows`,
          headers: { cookie: actor.cookie, "idempotency-key": crypto.randomUUID() },
          payload,
        })
        .then((r) => JSON.parse(r.body) as { id: string });

    const req1 = await makeRow({ rowType: "requirement", title: "Covered req", parentId: null });
    await makeRow({ rowType: "requirement", title: "Uncovered req", parentId: null });
    const test = await makeRow({ rowType: "heading", title: "Brake verification", parentId: null }, testDocument.id);
    const testSteps = await makeRow({ rowType: "heading", title: "Test Steps", parentId: test.id }, testDocument.id);
    const step = await makeRow({ rowType: "test_step", title: "", parentId: testSteps.id }, testDocument.id);
    const unlinkedTest = await makeRow({ rowType: "heading", title: "Unlinked verification", parentId: null }, testDocument.id);
    const unlinkedSteps = await makeRow({ rowType: "heading", title: "Test Steps", parentId: unlinkedTest.id }, testDocument.id);
    await makeRow({ rowType: "test_step", title: "", parentId: unlinkedSteps.id }, testDocument.id);

    await app.inject({
      method: "POST",
      url: `/rows/${step.id}/links`,
      headers: { cookie: actor.cookie },
      payload: { targetRowId: req1.id, linkType: "verifies" },
    });

    const coverage = await app.inject({
      method: "GET",
      url: `/documents/${doc}/coverage`,
      headers: { cookie: actor.cookie },
    });
    const body = JSON.parse(coverage.body) as { totalRequirements: number; covered: number; uncovered: number };
    expect(body.totalRequirements).toBe(2);
    expect(body.covered).toBe(1);
    expect(body.uncovered).toBe(1);

    const matrix = await app.inject({
      method: "GET",
      url: `/documents/${doc}/traceability`,
      headers: { cookie: actor.cookie },
    });
    const rows = JSON.parse(matrix.body) as Array<{ id: string; requirementNo: string | null; links: { sourceId: string; sourceScenarioId: string; sourceTitle: string; sourceDocument: { id: string; title: string; documentType: string } }[] }>;
    expect(rows).toHaveLength(2);
    const coveredRow = rows.find((r) => r.id === req1.id);
    expect(coveredRow?.requirementNo).toBe("REQ-001");
    expect(coveredRow?.links).toHaveLength(1);
    expect(coveredRow?.links[0]?.sourceId).toBe(step.id);
    expect(coveredRow?.links[0]?.sourceScenarioId).toBe(test.id);
    expect(coveredRow?.links[0]?.sourceTitle).toBe("Brake verification");
    expect(coveredRow?.links[0]?.sourceDocument).toEqual({ id: testDocument.id, title: "Verification tests", documentType: "test" });

    const testCoverage = await app.inject({
      method: "GET",
      url: `/documents/${testDocument.id}/coverage`,
      headers: { cookie: actor.cookie },
    });
    const testCoverageBody = JSON.parse(testCoverage.body) as { mode: string; totalItems: number; covered: number; uncovered: number; uncoveredRows: Array<{ id: string; title: string }> };
    expect(testCoverageBody).toEqual(expect.objectContaining({ mode: "test", totalItems: 2, covered: 1, uncovered: 1 }));
    expect(testCoverageBody.uncoveredRows).toEqual([expect.objectContaining({ id: unlinkedTest.id, title: "Unlinked verification" })]);

    const testMatrix = await app.inject({
      method: "GET",
      url: `/documents/${testDocument.id}/traceability`,
      headers: { cookie: actor.cookie },
    });
    const testMatrixRows = JSON.parse(testMatrix.body) as Array<{ id: string; links: Array<{ sourceScenarioId: string; sourceTitle: string }> }>;
    expect(testMatrixRows).toEqual([
      expect.objectContaining({
        id: req1.id,
        links: [expect.objectContaining({ sourceScenarioId: test.id, sourceTitle: "Brake verification" })],
      }),
    ]);

    const reverseMatrix = await app.inject({
      method: "GET",
      url: `/documents/${testDocument.id}/traceability?direction=test_to_requirement`,
      headers: { cookie: actor.cookie },
    });
    const reverseRows = JSON.parse(reverseMatrix.body) as Array<{
      id: string;
      title: string;
      requirements: Array<{ requirementId: string; requirementNo: string | null }>;
    }>;
    expect(reverseRows).toEqual([
      expect.objectContaining({
        id: test.id,
        title: "Brake verification",
        requirements: [expect.objectContaining({ requirementId: req1.id, requirementNo: "REQ-001" })],
      }),
      expect.objectContaining({
        id: unlinkedTest.id,
        title: "Unlinked verification",
        requirements: [],
      }),
    ]);
  });
});
