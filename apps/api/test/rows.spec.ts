import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@reqtrack/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

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

  async function createRow(payload: Record<string, unknown>, idempotencyKey?: string) {
    const response = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/rows`,
      headers: { cookie: actor.cookie, ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
      payload,
    });
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as { id: string; version: number; rank: string; depth: number };
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
    const rows = JSON.parse(outline.body) as Array<{ title: string; displayNumber: string }>;
    const byTitle = new Map(rows.map((r) => [r.title, r.displayNumber]));
    expect(byTitle.get("Introduction")).toBe("1");
    expect(byTitle.get("Req 1")).toBe("1.1");
    expect(byTitle.get("Req 2")).toBe("1.2");
    expect(byTitle.get("Scope")).toBe("2");
    expect(req1.depth).toBe(1);
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
    const moved = JSON.parse(move.body) as { parentId: string; depth: number; version: number };
    expect(moved.parentId).toBe(parentB.id);
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
  });

  it("links a test case to a requirement and soft deletes links with the row", async () => {
    const requirement = await createRow({ rowType: "requirement", title: "Linked Req", parentId: null });
    const testCase = await createRow({ rowType: "test_case", title: "TC", parentId: null });

    const link = await app.inject({
      method: "POST",
      url: `/rows/${testCase.id}/links`,
      headers: { cookie: actor.cookie },
      payload: { targetRowId: requirement.id, linkType: "verifies" },
    });
    expect(link.statusCode).toBe(201);

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
