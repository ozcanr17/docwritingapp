import { HocuspocusProvider } from "@hocuspocus/provider";
import { PrismaClient } from "@docsys/database";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import * as Y from "yjs";

const CLIENT_COUNT = Number(process.env.COLLAB_CLIENTS ?? 50);
const COLLAB_URL = process.env.COLLAB_URL ?? "ws://127.0.0.1:3002";
const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-at-least-16-chars";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://docsys:docsys@localhost:5432/docsys_test";

process.env.DATABASE_URL = DATABASE_URL;
const prisma = new PrismaClient();

async function seed() {
  const suffix = Date.now();
  const user = await prisma.user.create({
    data: { email: `load-${suffix}@example.com`, displayName: "Load Tester" },
  });
  const org = await prisma.organization.create({ data: { name: "LoadOrg", slug: `load-${suffix}` } });
  const workspace = await prisma.workspace.create({
    data: { organizationId: org.id, name: "LoadWS", slug: "load-ws" },
  });
  const document = await prisma.document.create({
    data: {
      organizationId: org.id,
      workspaceId: workspace.id,
      documentType: "general_document",
      title: "Load Doc",
      rank: "i",
    },
  });
  let role = await prisma.role.findFirst({ where: { key: "organization_admin", organizationId: null } });
  if (!role) {
    role = await prisma.role.create({ data: { key: "organization_admin", name: "Organization Admin", isSystem: true } });
    const permission = await prisma.permission.upsert({
      where: { key: "document.read" },
      update: {},
      create: { key: "document.read" },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  await prisma.memberRole.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      roleId: role.id,
      scopeType: "organization",
    },
  });
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
  return { document, token };
}

function createClient(index, documentId, token) {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: COLLAB_URL,
    name: documentId,
    token,
    document: ydoc,
    WebSocketPolyfill: WebSocket,
  });
  const synced = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`client ${index} sync timeout`)), 30000);
    provider.on("synced", () => {
      clearTimeout(timer);
      resolve();
    });
    provider.on("authenticationFailed", () => {
      clearTimeout(timer);
      reject(new Error(`client ${index} authentication failed`));
    });
  });
  return { ydoc, provider, synced };
}

async function main() {
  const { document, token } = await seed();
  console.log(`document ${document.id}; connecting ${CLIENT_COUNT} clients to ${COLLAB_URL}`);

  const startedAt = Date.now();
  const clients = Array.from({ length: CLIENT_COUNT }, (_, i) => createClient(i, document.id, token));
  await Promise.all(clients.map((c) => c.synced));
  console.log(`all clients synced in ${Date.now() - startedAt} ms`);

  const writeStart = Date.now();
  clients.forEach((client, index) => {
    const text = client.ydoc.getText("content");
    text.insert(0, `[client-${index}]`);
  });

  const expectedMarkers = Array.from({ length: CLIENT_COUNT }, (_, i) => `[client-${i}]`);
  const deadline = Date.now() + 60000;
  for (;;) {
    const converged = clients.every((client) => {
      const value = client.ydoc.getText("content").toString();
      return expectedMarkers.every((marker) => value.includes(marker));
    });
    if (converged) break;
    if (Date.now() > deadline) throw new Error("convergence timeout");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(`all ${CLIENT_COUNT} clients converged in ${Date.now() - writeStart} ms after writes`);

  const reference = clients[0].ydoc.getText("content").toString();
  const allEqual = clients.every((client) => client.ydoc.getText("content").toString() === reference);
  if (!allEqual) throw new Error("client states diverged");
  console.log(`final text length: ${reference.length}; states identical across clients`);

  clients.forEach((client) => client.provider.destroy());
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const snapshots = await prisma.collaborationSnapshot.count({ where: { documentId: document.id } });
  console.log(`persisted snapshots: ${snapshots}`);
  await prisma.$disconnect();
  if (snapshots < 1) throw new Error("no snapshot persisted");
  console.log("LOAD_TEST_PASSED");
  process.exit(0);
}

main().catch(async (error) => {
  console.error("LOAD_TEST_FAILED:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});
