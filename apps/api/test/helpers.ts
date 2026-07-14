import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@reqtrack/database";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://reqtrack:reqtrack@localhost:5432/reqtrack_v2_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.JWT_SECRET = "test-secret-at-least-16-chars";
process.env.APP_BASE_URL = "http://localhost:5173";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
process.env.LOG_LEVEL = "error";

export async function buildApp(): Promise<NestFastifyApplication> {
  const { createApp } = await import("../src/main");
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
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
}

export interface TestActor {
  cookie: string;
  userId: string;
  email: string;
}

let userCounter = 0;

export async function registerActor(app: NestFastifyApplication, label: string): Promise<TestActor> {
  userCounter += 1;
  const email = `${label}-${userCounter}@example.com`;
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email, displayName: label, password: "password-123" },
  });
  if (response.statusCode !== 201) throw new Error(`register failed: ${response.body}`);
  const setCookie = response.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!cookieHeader) throw new Error("no session cookie");
  const cookie = cookieHeader.split(";")[0] ?? "";
  const body = JSON.parse(response.body) as { user: { id: string } };
  return { cookie, userId: body.user.id, email };
}

export async function createOrgWorkspaceDocument(app: NestFastifyApplication, actor: TestActor) {
  const orgRes = await app.inject({
    method: "POST",
    url: "/organizations",
    headers: { cookie: actor.cookie },
    payload: { name: "Test Org", slug: `org-${Date.now()}-${Math.floor(Math.random() * 10000)}` },
  });
  const org = JSON.parse(orgRes.body) as { id: string };
  const wsRes = await app.inject({
    method: "POST",
    url: `/organizations/${org.id}/workspaces`,
    headers: { cookie: actor.cookie },
    payload: { name: "Main", slug: "main" },
  });
  const workspace = JSON.parse(wsRes.body) as { id: string };
  const docRes = await app.inject({
    method: "POST",
    url: `/workspaces/${workspace.id}/documents`,
    headers: { cookie: actor.cookie },
    payload: { title: "Spec", documentType: "requirement", folderId: null },
  });
  const document = JSON.parse(docRes.body) as { id: string; version: number };
  return { org, workspace, document };
}
