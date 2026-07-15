import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./helpers";

describe("performance observability", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts Web Vitals and exposes Prometheus metrics", async () => {
    const telemetry = await app.inject({
      method: "POST",
      url: "/telemetry/web-vitals",
      payload: { name: "INP", value: 84, rating: "good", page: "/documents/example" },
    });
    expect(telemetry.statusCode).toBe(201);

    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("docsys_web_vital_value");
    expect(metrics.body).toContain("docsys_http_request_duration_seconds");
  });
});
