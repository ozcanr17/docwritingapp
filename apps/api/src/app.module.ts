import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "crypto";
import { AccessModule } from "./access/access.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { apiEnv } from "./env";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RowsModule } from "./rows/rows.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { TreeModule } from "./tree/tree.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: apiEnv().LOG_LEVEL,
        genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
        redact: ["req.headers.cookie", "req.headers.authorization"],
        autoLogging: apiEnv().NODE_ENV !== "test",
      },
    }),
    PrismaModule,
    EventsModule,
    AccessModule,
    AuditModule,
    AuthModule,
    TenancyModule,
    TreeModule,
    RowsModule,
    HealthModule,
  ],
})
export class AppModule {}
