import { z } from "zod";

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

let cached: ApiEnv | null = null;

export function apiEnv(): ApiEnv {
  if (cached) return cached;
  const parsed = apiEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid API environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
