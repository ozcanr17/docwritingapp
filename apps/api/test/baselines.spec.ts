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
    const created = JSON.parse(baseline.body) as { revisionNumber: number; rowCount: number };
    expect(created.rowCount).toBe(3);

    // Modify one, delete one, add one after the baseline.
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

    const diff = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/baselines/${created.revisionNumber}/diff`,
      headers: { cookie: actor.cookie },
    });
    expect(diff.statusCode).toBe(200);
    const body = JSON.parse(diff.body) as {
      summary: { added: number; removed: number; modified: number };
      added: { id: string }[];
      removed: { id: string }[];
      modified: { id: string }[];
    };
    expect(body.summary).toEqual({ added: 1, removed: 1, modified: 1 });
    expect(body.added[0]?.id).toBe(added.id);
    expect(body.removed[0]?.id).toBe(toDelete.id);
    expect(body.modified[0]?.id).toBe(toChange.id);
    expect(keep.id).toBeTruthy();

    const list = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/baselines`,
      headers: { cookie: actor.cookie },
    });
    expect(JSON.parse(list.body)).toHaveLength(1);
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
    const test = await makeRow({ rowType: "test_case", title: "Verifies req1", parentId: null }, testDocument.id);

    await app.inject({
      method: "POST",
      url: `/rows/${test.id}/links`,
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
    const rows = JSON.parse(matrix.body) as Array<{ id: string; links: { sourceId: string }[] }>;
    expect(rows).toHaveLength(2);
    const coveredRow = rows.find((r) => r.id === req1.id);
    expect(coveredRow?.links).toHaveLength(1);
    expect(coveredRow?.links[0]?.sourceId).toBe(test.id);
  });
});
