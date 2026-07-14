import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("suspect links", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let documentId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    actor = await registerActor(app, "trace-owner");
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

  it("marks a link suspect when a linked row changes and clears it on acknowledge", async () => {
    const requirement = await createRow({ rowType: "requirement", title: "Requirement", parentId: null });
    const testCase = await createRow({ rowType: "test_case", title: "Test", parentId: null });

    const linkRes = await app.inject({
      method: "POST",
      url: `/rows/${testCase.id}/links`,
      headers: { cookie: actor.cookie },
      payload: { targetRowId: requirement.id, linkType: "verifies" },
    });
    const link = JSON.parse(linkRes.body) as { id: string; suspect: boolean };
    expect(link.suspect).toBe(false);

    // Change the requirement (the target of the link).
    const update = await app.inject({
      method: "PATCH",
      url: `/rows/${requirement.id}`,
      headers: { cookie: actor.cookie },
      payload: { expectedVersion: requirement.version, title: "Requirement (changed)" },
    });
    expect(update.statusCode).toBe(200);

    const afterChange = await prisma.requirementLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(afterChange.suspect).toBe(true);
    expect(afterChange.suspectReason).toBe("linked row changed");

    const suspectList = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/suspect-links`,
      headers: { cookie: actor.cookie },
    });
    expect(JSON.parse(suspectList.body)).toHaveLength(1);

    const ack = await app.inject({
      method: "POST",
      url: `/links/${link.id}/acknowledge`,
      headers: { cookie: actor.cookie },
    });
    expect(ack.statusCode).toBe(201);

    const afterAck = await prisma.requirementLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(afterAck.suspect).toBe(false);
    expect(afterAck.suspectSince).toBeNull();
  });
});
