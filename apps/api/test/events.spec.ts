import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase, TestActor } from "./helpers";

describe("domain event websocket", () => {
  let app: NestFastifyApplication;
  let actor: TestActor;
  let documentId: string;
  let baseUrl: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `127.0.0.1:${port}`;
    actor = await registerActor(app, "ws-owner");
    const created = await createOrgWorkspaceDocument(app, actor);
    documentId = created.document.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function connect(cookie?: string): WebSocket {
    return new WebSocket(`ws://${baseUrl}/ws/events`, { headers: cookie ? { cookie } : {} });
  }

  it("rejects unauthenticated connections", async () => {
    const socket = connect();
    const code = await new Promise<number>((resolve) => {
      socket.on("close", (closeCode) => resolve(closeCode));
    });
    expect(code).toBe(4401);
  });

  it("delivers domain events to joined clients after REST mutations", async () => {
    const socket = connect(actor.cookie);
    await new Promise<void>((resolve, reject) => {
      socket.on("open", () => resolve());
      socket.on("error", reject);
    });

    const events: Array<{ event: string; data: { type?: string; entityId?: string } }> = [];
    socket.on("message", (raw) => {
      events.push(JSON.parse(String(raw)));
    });

    socket.send(JSON.stringify({ event: "join", data: { documentId } }));
    await waitFor(() => events.some((e) => e.event === "joined"));

    const rowRes = await app.inject({
      method: "POST",
      url: `/documents/${documentId}/rows`,
      headers: { cookie: actor.cookie },
      payload: { rowType: "requirement", title: "Realtime row", parentId: null },
    });
    expect(rowRes.statusCode).toBe(201);
    const row = JSON.parse(rowRes.body) as { id: string };

    await waitFor(() => events.some((e) => e.event === "domain" && e.data.type === "row.created" && e.data.entityId === row.id));
    socket.close();
  });

  it("authenticates desktop event sockets without putting tokens in the URL", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-docsys-client": "desktop" },
      payload: { identifier: actor.email, password: "password-123" },
    });
    const token = (JSON.parse(login.body) as { token: string }).token;
    const socket = new WebSocket(`ws://${baseUrl}/ws/events`, ["docsys.events", `docsys.jwt.${token}`]);
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
    const events: Array<{ event: string }> = [];
    socket.on("message", (raw) => events.push(JSON.parse(String(raw))));
    socket.send(JSON.stringify({ event: "join", data: { documentId } }));
    await waitFor(() => events.some((event) => event.event === "joined"));
    socket.close();
  });

  it("refuses joining a document from another tenant", async () => {
    const outsider = await registerActor(app, "ws-outsider");
    const socket = connect(outsider.cookie);
    await new Promise<void>((resolve, reject) => {
      socket.on("open", () => resolve());
      socket.on("error", reject);
    });
    const events: Array<{ event: string; data: unknown }> = [];
    socket.on("message", (raw) => events.push(JSON.parse(String(raw))));
    socket.send(JSON.stringify({ event: "join", data: { documentId } }));
    await waitFor(() => events.some((e) => e.event === "error"));
    expect(events.some((e) => e.event === "joined")).toBe(false);
    socket.close();
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
