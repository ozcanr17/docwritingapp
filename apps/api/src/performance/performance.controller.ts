import { Body, Controller, Get, Headers, Post, Res, UnauthorizedException } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { apiEnv } from "../env";
import { Public } from "../auth/public.decorator";
import { performanceRegistry, webVitalSamples, webVitalValue } from "./performance.metrics";

const webVitalSchema = z.object({
  name: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
  value: z.number().finite().nonnegative(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  page: z.string().max(200),
});

type WebVitalInput = z.infer<typeof webVitalSchema>;

@Controller()
export class PerformanceController {
  @Public()
  @Post("telemetry/web-vitals")
  recordWebVital(@Body(new ZodBodyPipe(webVitalSchema)) body: WebVitalInput) {
    const page = body.page === "/login" ? "/login" : "/app";
    const labels = { metric: body.name, rating: body.rating, page };
    webVitalValue.set(labels, body.value);
    webVitalSamples.inc(labels);
    return { accepted: true };
  }

  @Public()
  @Get("metrics")
  async metrics(@Headers("authorization") authorization: string | undefined, @Res() reply: FastifyReply) {
    const token = apiEnv().METRICS_TOKEN;
    const provided = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (token && !this.equalToken(token, provided)) throw new UnauthorizedException("Invalid metrics token");
    return reply.type(performanceRegistry.contentType).send(await performanceRegistry.metrics());
  }

  private equalToken(expected: string, provided: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  }
}
