import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { PrismaClient } from "@docsys/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, createOrgWorkspaceDocument, registerActor, resetDatabase } from "./helpers";

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
    expect(JSON.parse(login.body).token).toBeUndefined();
    const cookie = (login.headers["set-cookie"] as string).split(";")[0];
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).email).toBe(actor.email);
  });

  it("uses a persistent cookie only when remember me is selected", async () => {
    const actor = await registerActor(app, "remember");
    const sessionLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { identifier: actor.email, password: "password-123", rememberMe: false } });
    expect(String(sessionLogin.headers["set-cookie"])).not.toContain("Max-Age=");
    const rememberedLogin = await app.inject({ method: "POST", url: "/auth/login", payload: { identifier: actor.email, password: "password-123", rememberMe: true } });
    expect(String(rememberedLogin.headers["set-cookie"])).toContain("Max-Age=2592000");
  });

  it("updates a profile and exposes it to users in the same organization", async () => {
    const owner = await registerActor(app, "profile-owner");
    const colleague = await registerActor(app, "profile-colleague");
    const { org } = await createOrgWorkspaceDocument(app, owner);
    const addMember = await app.inject({ method: "POST", url: `/organizations/${org.id}/members`, headers: { cookie: owner.cookie }, payload: { userId: colleague.userId, roleKey: "viewer" } });
    expect(addMember.statusCode).toBe(201);
    const update = await app.inject({
      method: "PATCH",
      url: "/auth/me",
      headers: { cookie: colleague.cookie },
      payload: { email: colleague.email, displayName: "Profile Colleague", firstName: "Profile", lastName: "Colleague", department: "Systems", phone: "+90 555 000 00 00", jobTitle: "Engineer", bio: "Test profile" },
    });
    expect(update.statusCode).toBe(200);
    const visible = await app.inject({ method: "GET", url: `/auth/users/${colleague.userId}`, headers: { cookie: owner.cookie } });
    expect(visible.statusCode).toBe(200);
    expect(JSON.parse(visible.body)).toMatchObject({ displayName: "Profile Colleague", department: "Systems", jobTitle: "Engineer" });
    const outsider = await registerActor(app, "profile-outsider");
    const hidden = await app.inject({ method: "GET", url: `/auth/users/${colleague.userId}`, headers: { cookie: outsider.cookie } });
    expect(hidden.statusCode).toBe(403);
  });

  it("logs in to local accounts with a username", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "local-user@docsys.local", displayName: "Local User", password: "password-123" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-docsys-client": "desktop" },
      payload: { identifier: "local-user", password: "password-123" },
    });
    expect(login.statusCode).toBe(201);
    expect(JSON.parse(login.body).token).toBeTypeOf("string");
  });

  it("provides public desktop client configuration", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/client-config" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).collaborationUrl).toBe("ws://localhost:3002");
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

  it("rejects cross-site cookie mutations", async () => {
    const actor = await registerActor(app, "csrf");
    const response = await app.inject({
      method: "POST",
      url: "/organizations",
      headers: {
        cookie: actor.cookie,
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      payload: { name: "Rejected", slug: "rejected" },
    });
    expect(response.statusCode).toBe(403);
  });
});
