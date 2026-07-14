import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5173",
  },
  webServer: [
    {
      command:
        "cd ../../apps/api && npx tsc -p tsconfig.json && DATABASE_URL=postgresql://reqtrack:reqtrack@localhost:5432/reqtrack_v2 REDIS_URL=redis://localhost:6379 JWT_SECRET=dev-secret-at-least-16-chars APP_BASE_URL=http://localhost:5173 CORS_ALLOWED_ORIGINS=http://localhost:5173 LOG_LEVEL=warn node dist/main.js",
      url: "http://localhost:3001/health/live",
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: "pnpm --dir ../../apps/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
