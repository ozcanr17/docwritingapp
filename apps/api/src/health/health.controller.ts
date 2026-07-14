import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../events/redis.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "down";
    }
    try {
      await this.redis.client.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "down";
    }
    if (Object.values(checks).some((v) => v !== "ok")) {
      throw new ServiceUnavailableException({ status: "degraded", checks });
    }
    return { status: "ok", checks };
  }
}
