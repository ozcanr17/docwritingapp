import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compactSnapshots, runPurge } from "../src/purge";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://docsys:docsys@localhost:5432/docsys_test";

const prisma = new PrismaClient();

const OLD = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
const RECENT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

async function seedTenant(slugSuffix: string) {
  const org = await prisma.organization.create({ data: { name: "PurgeOrg", slug: `purge-${slugSuffix}` } });
  const workspace = await prisma.workspace.create({
    data: { organizationId: org.id, name: "WS", slug: "ws" },
  });
  const document = await prisma.document.create({
    data: {
      organizationId: org.id,
      workspaceId: workspace.id,
      documentType: "requirement",
      title: "Doc",
      rank: "i",
    },
  });
  return { org, workspace, document };
}

async function seedDeletedRow(orgId: string, documentId: string, deletedAt: Date) {
  return prisma.documentRow.create({
    data: {
      organizationId: orgId,
      documentId,
      rank: "i",
      rowType: "requirement",
      title: "DeadRow",
      deletedAt,
    },
  });
}

describe("purge job", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      DO $$
      DECLARE tbl text;
      BEGIN
        FOR tbl IN
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations')
        LOOP
          EXECUTE format('TRUNCATE TABLE %I CASCADE', tbl);
        END LOOP;
      END $$;
    `);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("purges rows past retention, keeps recent ones, and writes purge audit events", async () => {
    const { org, document } = await seedTenant("basic");
    const expired = await seedDeletedRow(org.id, document.id, OLD);
    const recent = await seedDeletedRow(org.id, document.id, RECENT);

    const result = await runPurge(prisma, 30);
    expect(result.purgedRows).toBe(1);

    expect(await prisma.documentRow.findFirst({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.documentRow.findFirst({ where: { id: recent.id } })).not.toBeNull();

    const audit = await prisma.auditEvent.findMany({
      where: { action: "row.purged", entityId: expired.id },
    });
    expect(audit).toHaveLength(1);
  });

  it("respects legal holds", async () => {
    const { org, document } = await seedTenant("hold");
    const held = await seedDeletedRow(org.id, document.id, OLD);
    await prisma.legalHold.create({
      data: { organizationId: org.id, scopeType: "organization", scopeId: org.id, reason: "litigation" },
    });

    const result = await runPurge(prisma, 30);
    expect(await prisma.documentRow.findFirst({ where: { id: held.id } })).not.toBeNull();
    expect(result.skippedForLegalHold).toBeGreaterThan(0);
  });

  it("is idempotent when re-run after completion", async () => {
    const { org, document } = await seedTenant("idem");
    await seedDeletedRow(org.id, document.id, OLD);
    const first = await runPurge(prisma, 30);
    const second = await runPurge(prisma, 30);
    expect(first.purgedRows).toBeGreaterThan(0);
    expect(second.purgedRows).toBe(0);
  });

  it("purges empty deleted documents together with their dependents", async () => {
    const { org, workspace } = await seedTenant("docs");
    const deadDoc = await prisma.document.create({
      data: {
        organizationId: org.id,
        workspaceId: workspace.id,
        documentType: "test",
        title: "DeadDoc",
        rank: "j",
        deletedAt: OLD,
      },
    });
    await prisma.collaborationSnapshot.create({
      data: { organizationId: org.id, documentId: deadDoc.id, sequence: 1n, snapshotData: Buffer.from([1, 2]) },
    });
    const result = await runPurge(prisma, 30);
    expect(result.purgedDocuments).toBeGreaterThan(0);
    expect(await prisma.document.findFirst({ where: { id: deadDoc.id } })).toBeNull();
    expect(await prisma.collaborationSnapshot.count({ where: { documentId: deadDoc.id } })).toBe(0);
  });

  it("compacts collaboration snapshots keeping the latest N", async () => {
    const { org, document } = await seedTenant("compact");
    for (let i = 1; i <= 8; i += 1) {
      await prisma.collaborationSnapshot.create({
        data: {
          organizationId: org.id,
          documentId: document.id,
          sequence: BigInt(i),
          snapshotData: Buffer.from([i]),
        },
      });
    }
    const removed = await compactSnapshots(prisma, 5);
    expect(removed).toBe(3);
    const remaining = await prisma.collaborationSnapshot.findMany({
      where: { documentId: document.id },
      orderBy: { sequence: "asc" },
    });
    expect(remaining.map((s) => Number(s.sequence))).toEqual([4, 5, 6, 7, 8]);
  });
});
