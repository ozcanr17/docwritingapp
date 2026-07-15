import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@docsys/database";
import jwt from "jsonwebtoken";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://docsys:docsys@localhost:5432/docsys_test";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:3001";
const jwtSecret = process.env.JWT_SECRET ?? "test-secret-at-least-16-chars";
const rowCount = Number(process.env.LARGE_DOC_ROWS ?? 10000);
const iterations = Number(process.env.LARGE_DOC_ITERATIONS ?? 5);
const maxP95Ms = Number(process.env.LARGE_DOC_MAX_P95_MS ?? 2500);
const resultPath = process.env.PERF_RESULT_PATH ?? "large-document-results.json";

process.env.DATABASE_URL = databaseUrl;
const prisma = new PrismaClient();

function percentile(values, percentileValue) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil((percentileValue / 100) * ordered.length) - 1)];
}

async function insertRows(documentId, organizationId) {
  const ids = Array.from({ length: rowCount }, () => randomUUID());
  const batchSize = 1000;
  for (let start = 0; start < ids.length; start += batchSize) {
    const batch = ids.slice(start, start + batchSize);
    await prisma.documentRow.createMany({
      data: batch.map((id, offset) => {
        const index = start + offset;
        return {
          id,
          organizationId,
          documentId,
          rank: `i${index.toString(36).padStart(8, "0")}z`,
          rowType: index % 12 === 0 ? "heading" : "requirement",
          title: index % 12 === 0 ? `Section ${index}` : `Requirement ${index}`,
          description: `Benchmark requirement description ${index}`,
          customFields: { subsystem: `S${index % 20}`, verification: index % 2 ? "analysis" : "test" },
        };
      }),
    });
    await prisma.requirementDetail.createMany({
      data: batch.flatMap((rowId, offset) => {
        const index = start + offset;
        return index % 12 === 0 ? [] : [{ rowId, requirementNo: `REQ-${String(index).padStart(7, "0")}` }];
      }),
    });
  }
  return ids;
}

async function main() {
  const suffix = Date.now();
  const user = await prisma.user.create({ data: { email: `perf-${suffix}@docsys.local`, displayName: "Performance Runner" } });
  const organization = await prisma.organization.create({ data: { name: "Performance", slug: `perf-${suffix}` } });
  const workspace = await prisma.workspace.create({ data: { organizationId: organization.id, name: "Benchmark", slug: "benchmark" } });
  const document = await prisma.document.create({
    data: { organizationId: organization.id, workspaceId: workspace.id, documentType: "requirement", title: `${rowCount} row benchmark`, rank: "i" },
  });
  const role = await prisma.role.findFirstOrThrow({ where: { key: "organization_admin", organizationId: null } });
  await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id } });
  await prisma.memberRole.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id, scopeType: "organization" } });

  try {
    const seedStartedAt = performance.now();
    await insertRows(document.id, organization.id);
    const seedMs = performance.now() - seedStartedAt;
    const token = jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "15m" });
    const samples = [];
    let responseBytes = 0;

    for (let iteration = 0; iteration <= iterations; iteration += 1) {
      const startedAt = performance.now();
      const response = await fetch(`${apiUrl}/documents/${document.id}/outline`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.arrayBuffer();
      if (!response.ok) throw new Error(`outline request failed with ${response.status}`);
      responseBytes = body.byteLength;
      if (iteration > 0) samples.push(performance.now() - startedAt);
    }

    const result = {
      rowCount,
      iterations,
      seedMs: Number(seedMs.toFixed(1)),
      responseMiB: Number((responseBytes / 1024 / 1024).toFixed(2)),
      minMs: Number(Math.min(...samples).toFixed(1)),
      medianMs: Number(percentile(samples, 50).toFixed(1)),
      p95Ms: Number(percentile(samples, 95).toFixed(1)),
      maxMs: Number(Math.max(...samples).toFixed(1)),
      budgetMs: maxP95Ms,
    };
    await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    globalThis.console.log(JSON.stringify(result, null, 2));
    if (result.p95Ms > maxP95Ms) throw new Error(`p95 ${result.p95Ms} ms exceeds ${maxP95Ms} ms budget`);
  } finally {
    await prisma.requirementDetail.deleteMany({ where: { row: { documentId: document.id } } });
    await prisma.documentRow.deleteMany({ where: { documentId: document.id } });
    await prisma.memberRole.deleteMany({ where: { organizationId: organization.id, userId: user.id } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: organization.id, userId: user.id } });
    await prisma.document.delete({ where: { id: document.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    globalThis.console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
