import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { WsAdapter } from "@nestjs/platform-ws";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { apiEnv } from "./env";

export async function createApp(): Promise<NestFastifyApplication> {
  const env = apiEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 5 * 1024 * 1024 }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  await app.register(fastifyCookie as never, { secret: env.JWT_SECRET } as never);
  await app.register(fastifyHelmet as never, { contentSecurityPolicy: false } as never);
  await app.register(fastifyRateLimit as never, { max: 600, timeWindow: "1 minute" } as never);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS.split(","),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  app.enableShutdownHooks();
  const openApiConfig = new DocumentBuilder()
    .setTitle("ReqTrack API")
    .setDescription("Requirements, test, and document management API")
    .setVersion("0.1.0")
    .addCookieAuth("reqtrack_session")
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApiConfig));
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen({ port: apiEnv().API_PORT, host: "0.0.0.0" });
}

if (require.main === module) {
  void bootstrap();
}
