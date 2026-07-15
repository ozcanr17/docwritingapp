import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: [
    {
      command:
        "cd ../../apps/api && npx tsc -p tsconfig.json && DATABASE_URL=postgresql://docsys:docsys@localhost:5432/docsys REDIS_URL=redis://localhost:6379 JWT_SECRET=dev-secret-at-least-16-chars APP_BASE_URL=http://localhost:5173 CORS_ALLOWED_ORIGINS=http://localhost:5173 LOG_LEVEL=warn node dist/main.js",
      url: "http://localhost:3001/health/live",
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command:
        "cd ../../apps/collaboration && DATABASE_URL=postgresql://docsys:docsys@localhost:5432/docsys JWT_SECRET=dev-secret-at-least-16-chars COLLAB_PORT=3002 LOG_LEVEL=warn npx tsx src/main.ts",
      url: "http://localhost:3002",
      reuseExistingServer: true,
      timeout: 30000,
      ignoreHTTPSErrors: true,
    },
    {
      command:
        "cd ../../apps/worker && DATABASE_URL=postgresql://docsys:docsys@localhost:5432/docsys REDIS_URL=redis://localhost:6379 S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY=minioadmin S3_SECRET_KEY=minioadmin S3_BUCKET=docsys LOG_LEVEL=warn npx tsx src/main.ts",
      url: "http://localhost:3003",
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: "VITE_DESKTOP_MODE=true pnpm --dir ../../apps/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
