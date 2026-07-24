import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const sourceDir = resolve(cwd, process.argv[2] ?? "src");
const entrypoint = resolve(cwd, process.argv[3] ?? "dist/main.js");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

let runtime = null;
let rebuilding = false;
let rebuildQueued = false;
let timer = null;
let stopping = false;

function startRuntime() {
  runtime = spawn(process.execPath, ["--enable-source-maps", entrypoint], {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  runtime.once("exit", (code, signal) => {
    runtime = null;
    if (!stopping && !rebuilding && code !== 0) {
      console.error(`[watch] service exited (${signal ?? code}); waiting for a source change`);
    }
  });
}

async function stopRuntime() {
  if (!runtime) return;
  const child = runtime;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

async function rebuild() {
  if (rebuilding) {
    rebuildQueued = true;
    return;
  }
  rebuilding = true;
  await stopRuntime();
  const compiler = spawn(npx, ["tsc", "-p", "tsconfig.json"], {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  const code = await new Promise((resolveExit) => compiler.once("exit", resolveExit));
  if (code === 0 && !stopping) {
    console.log("[watch] build complete; restarting service");
    startRuntime();
  } else if (!stopping) {
    console.error("[watch] build failed; service remains stopped until the next source change");
  }
  rebuilding = false;
  if (rebuildQueued && !stopping) {
    rebuildQueued = false;
    void rebuild();
  }
}

function scheduleRebuild() {
  clearTimeout(timer);
  timer = setTimeout(() => void rebuild(), 150);
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  watcher.close();
  await stopRuntime();
  process.exit(0);
}

const watcher = watch(sourceDir, { recursive: true }, (_event, fileName) => {
  if (fileName?.endsWith(".ts")) scheduleRebuild();
});

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.on("uncaughtException", (error) => {
  console.error(error);
  void shutdown();
});

console.log(`[watch] monitoring ${sourceDir}`);
startRuntime();
