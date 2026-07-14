import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, registerActor, resetDatabase } from "./helpers";

describe("auth", () => {
  let app: NestFastifyApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await resetDatabase(prisma);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("registers a user and returns a session cookie", async () => {
    const actor = await registerActor(app, "alice");
    expect(actor.cookie).toContain("docsys_session=");
  });

  it("rejects duplicate registration", async () => {
    const actor = await registerActor(app, "bob");
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: actor.email, displayName: "Bob", password: "password-123" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("logs in with valid credentials and reads profile", async () => {
    const actor = await registerActor(app, "carol");
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: actor.email, password: "password-123" },
    });
    expect(login.statusCode).toBe(201);
    const cookie = (login.headers["set-cookie"] as string).split(";")[0];
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).email).toBe(actor.email);
  });

  it("rejects wrong password", async () => {
    const actor = await registerActor(app, "dave");
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: actor.email, password: "wrong-password" },
    });
    expect(login.statusCode).toBe(401);
  });

  it("rejects unauthenticated access to protected routes", async () => {
    const response = await app.inject({ method: "GET", url: "/organizations" });
    expect(response.statusCode).toBe(401);
  });
});
