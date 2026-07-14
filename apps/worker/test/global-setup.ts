import { execSync } from "child_process";

export default function setup(): void {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? "postgresql://docsys:docsys@localhost:5432/docsys_test";
  process.env.DATABASE_URL = databaseUrl;
  execSync("npx prisma migrate deploy", {
    cwd: `${__dirname}/../../../packages/database`,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
