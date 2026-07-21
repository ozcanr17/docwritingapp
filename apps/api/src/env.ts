import { z } from "zod";

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3001"),
  COLLAB_PUBLIC_URL: z.string().url().default("ws://localhost:3002"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  COOKIE_SECURE: z.enum(["true", "false"]).transform((value) => value === "true").default("false"),
  ALLOW_PUBLIC_REGISTRATION: z.enum(["true", "false"]).transform((value) => value === "true").default("false"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("docsys"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  METRICS_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
}).superRefine((env, context) => {
  if (env.NODE_ENV !== "production") return;
  if (env.JWT_SECRET.length < 32) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_SECRET"], message: "Must contain at least 32 characters in production" });
  }
  if (!env.COOKIE_SECURE) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["COOKIE_SECURE"], message: "Must be true in production" });
  }
  if (!env.METRICS_TOKEN) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["METRICS_TOKEN"], message: "Required in production" });
  }
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
