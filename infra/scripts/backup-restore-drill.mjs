import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required");
const drillName = `docsys_restore_${Date.now()}`;
const admin = new URL(sourceUrl);
admin.pathname = "/postgres";
const target = new URL(sourceUrl);
target.pathname = `/${drillName}`;
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, ...options });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
};
const backupOutput = run(process.execPath, ["infra/scripts/backup-database.mjs"], { env: { ...process.env, DATABASE_URL: sourceUrl, BACKUP_DIR: process.env.BACKUP_DIR ?? "output/backup-drills", LC_ALL: "C" } });
const backup = JSON.parse(backupOutput.split("\n").at(-1));
try {
  run("createdb", ["--maintenance-db", admin.toString(), drillName]);
  run(process.execPath, ["infra/scripts/restore-database.mjs", backup.dumpPath], { env: { ...process.env, TARGET_DATABASE_URL: target.toString(), RESTORE_CONFIRM: drillName, LC_ALL: "C" }, stdio: "inherit" });
  const schemaCount = Number(run("psql", [target.toString(), "--tuples-only", "--no-align", "--command", "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"]));
  const migrationCount = Number(run("psql", [target.toString(), "--tuples-only", "--no-align", "--command", "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"]));
  if (schemaCount < 20 || migrationCount < 1) throw new Error("Restored database verification failed");
  process.stdout.write(`${JSON.stringify({ verified: true, schemaCount, migrationCount, backup: backup.dumpPath })}\n`);
} finally {
  spawnSync("dropdb", ["--maintenance-db", admin.toString(), "--if-exists", drillName], { stdio: "inherit", env: { ...process.env, LC_ALL: "C" } });
  if (process.env.KEEP_DRILL_BACKUP !== "1") {
    await rm(backup.dumpPath, { force: true });
    await rm(`${backup.dumpPath}.json`, { force: true });
  }
}
