import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(directory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const desktopPackage = JSON.parse(readFileSync(resolve(desktopRoot, "package.json"), "utf8"));
const rootPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
const tauri = JSON.parse(readFileSync(resolve(desktopRoot, "src-tauri/tauri.conf.json"), "utf8"));
const cargo = readFileSync(resolve(desktopRoot, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = cargo.match(/^version = "([^"]+)"$/m)?.[1];
const failures = [];

if (new Set([rootPackage.version, desktopPackage.version, tauri.version, cargoVersion]).size !== 1) {
  failures.push("Root, desktop package, Tauri and Cargo versions must match");
}
if (tauri.bundle?.active !== true || tauri.bundle?.createUpdaterArtifacts !== true) {
  failures.push("Desktop bundles and signed updater artifacts must be enabled");
}
if (tauri.bundle?.targets !== "all") failures.push("All native bundle targets must be enabled");
const endpoints = tauri.plugins?.updater?.endpoints ?? [];
if (!endpoints.length || endpoints.some((endpoint) => !endpoint.startsWith("https://") || !endpoint.endsWith("/latest.json"))) {
  failures.push("Updater endpoints must use HTTPS and target latest.json");
}
if (typeof tauri.plugins?.updater?.pubkey !== "string" || tauri.plugins.updater.pubkey.length < 64) {
  failures.push("A valid updater public key is required");
}
const csp = tauri.app?.security?.csp ?? "";
if (csp.includes("'unsafe-eval'") || !csp.includes("object-src 'none'") || !csp.includes("frame-ancestors 'none'")) {
  failures.push("Desktop CSP must block eval, embedded objects and framing");
}
for (const icon of tauri.bundle?.icon ?? []) {
  if (!existsSync(resolve(desktopRoot, "src-tauri", icon))) failures.push(`Missing desktop icon: ${icon}`);
}

if (failures.length) {
  throw new Error(failures.map((failure) => `Desktop readiness: ${failure}`).join("\n"));
}
globalThis.console.log(`Desktop readiness OK: DocSys ${tauri.version}, ${endpoints.length} signed update endpoint`);
