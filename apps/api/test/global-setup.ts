import { execSync } from "child_process";

export default function setup(): void {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? "postgresql://reqtrack:reqtrack@localhost:5432/reqtrack_v2_test";
  process.env.DATABASE_URL = databaseUrl;
  execSync("npx prisma migrate deploy", {
    cwd: `${__dirname}/../../../packages/database`,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
