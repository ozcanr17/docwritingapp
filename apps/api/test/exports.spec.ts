import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseImportCsv } from "../src/exports/exports.service";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("exports and imports", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let documentId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    actor = await registerActor(app, "export-owner");
    const created = await createOrgWorkspaceDocument(app, actor);
    documentId = created.document.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("parses CSV into typed rows with levels", () => {
    const rows = parseImportCsv("level,type,title,description\n0,heading,Intro,\n1,requirement,Login,User logs in");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ level: 0, rowType: "heading", title: "Intro" });
    expect(rows[1]).toMatchObject({ level: 1, rowType: "requirement", title: "Login", description: "User logs in" });
  });

  it("imports a CSV and rebuilds the hierarchy", async () => {
    const csv = [
      "level,type,title,description",
      "0,heading,Introduction,",
      "1,requirement,First requirement,Must work",
      "1,requirement,Second requirement,",
      "0,heading,Scope,",
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/imports`,
      headers: { cookie: actor.cookie },
      payload: { csv },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).importedRows).toBe(4);

    const outline = await app.inject({
      method: "GET",
      url: `/documents/${documentId}/outline`,
      headers: { cookie: actor.cookie },
    });
    const rows = JSON.parse(outline.body) as Array<{ title: string; displayNumber: string; depth: number }>;
    const byTitle = new Map(rows.map((r) => [r.title, r]));
    expect(byTitle.get("Introduction")?.displayNumber).toBe("1");
    expect(byTitle.get("First requirement")?.displayNumber).toBe("1.1");
    expect(byTitle.get("Second requirement")?.displayNumber).toBe("1.2");
    expect(byTitle.get("Scope")?.displayNumber).toBe("2");
  });

  it("previews migration findings without changing the document", async () => {
    const before = await prisma.documentRow.count({ where: { documentId } });
    const csv = [
      "level,type,requirement_no,title,description",
      "0,heading,,Imported chapter,",
      "1,requirement,GER-100,Unique requirement,Must remain unique",
    ].join("\n");
    const response = await app.inject({ method: "POST", url: `/documents/${documentId}/imports/preview`, headers: { cookie: actor.cookie }, payload: { csv } });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({ valid: true, rowCount: 2, counts: { heading: 1, requirement: 1 }, findings: [] });
    expect(await prisma.documentRow.count({ where: { documentId } })).toBe(before);
  });

  it("blocks duplicate identifiers and invalid hierarchy before mutation", async () => {
    const before = await prisma.documentRow.count({ where: { documentId } });
    const csv = [
      "level,type,requirement_no,title,description",
      "1,requirement,REQ-001,Duplicate existing,",
      "0,requirement,NEW-001,First,",
      "0,requirement,NEW-001,Duplicate incoming,",
      "0,test_step,,Wrong document type,",
    ].join("\n");
    const preview = await app.inject({ method: "POST", url: `/documents/${documentId}/imports/preview`, headers: { cookie: actor.cookie }, payload: { csv } });
    expect(preview.statusCode).toBe(201);
    const body = JSON.parse(preview.body) as { valid: boolean; findings: Array<{ code: string }> };
    expect(body.valid).toBe(false);
    expect(body.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["hierarchy_level_gap", "duplicate_number_in_document", "duplicate_number_in_file", "row_type_not_allowed"]));
    const attempted = await app.inject({ method: "POST", url: `/documents/${documentId}/imports`, headers: { cookie: actor.cookie }, payload: { csv } });
    expect(attempted.statusCode).toBe(422);
    expect(await prisma.documentRow.count({ where: { documentId } })).toBe(before);
  });

  it("requires document write access for migration preview", async () => {
    const outsider = await registerActor(app, "preview-outsider");
    const response = await app.inject({ method: "POST", url: `/documents/${documentId}/imports/preview`, headers: { cookie: outsider.cookie }, payload: { csv: "type,title\nheading,Hidden" } });
    expect(response.statusCode).toBe(403);
  });

  it("creates a pending export job and enqueues it", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/exports`,
      headers: { cookie: actor.cookie },
      payload: { format: "csv" },
    });
    expect(response.statusCode).toBe(201);
    const job = JSON.parse(response.body) as { id: string; status: string; jobType: string };
    expect(job.status).toBe("pending");
    expect(job.jobType).toBe("csv");

    const persisted = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(persisted.documentId).toBe(documentId);
    expect(persisted.requestedById).toBe(actor.userId);

    const status = await app.inject({
      method: "GET",
      url: `/exports/${job.id}`,
      headers: { cookie: actor.cookie },
    });
    expect(status.statusCode).toBe(200);
    expect(JSON.parse(status.body).id).toBe(job.id);
  });

  it("rejects download before the export is ready", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/exports`,
      headers: { cookie: actor.cookie },
      payload: { format: "docx" },
    });
    const job = JSON.parse(create.body) as { id: string };
    const download = await app.inject({
      method: "GET",
      url: `/exports/${job.id}/download`,
      headers: { cookie: actor.cookie },
    });
    expect(download.statusCode).toBe(422);
  });

  it("creates a directional traceability export job", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/exports`,
      headers: { cookie: actor.cookie },
      payload: { format: "xlsx", scope: "traceability", traceabilityDirection: "test_to_requirement", locale: "tr" },
    });
    expect(response.statusCode).toBe(201);
    const job = JSON.parse(response.body) as { id: string };
    const persisted = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(persisted.parameters).toEqual(expect.objectContaining({ scope: "traceability", traceabilityDirection: "test_to_requirement" }));
  });

  it("prevents a non-member from exporting another tenant's document", async () => {
    const outsider = await registerActor(app, "export-outsider");
    const response = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/exports`,
      headers: { cookie: outsider.cookie },
      payload: { format: "csv" },
    });
    expect(response.statusCode).toBe(403);
  });
});
