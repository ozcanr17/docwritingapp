import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const manifest = json("release.json");
const failures = [];

const expect = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, found ${actual ?? "missing"}`);
  }
};

const capture = (relativePath, pattern) => read(relativePath).match(pattern)?.[1];
const version = manifest.version;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  failures.push(`release.json version is not valid SemVer: ${version}`);
}

expect("root package", json("package.json").version, version);
expect("desktop package", json("apps/desktop/package.json").version, version);
expect("portable package", json("apps/portable/package.json").version, version);
expect("Tauri config", json("apps/desktop/src-tauri/tauri.conf.json").version, version);
expect(
  "Cargo package",
  capture("apps/desktop/src-tauri/Cargo.toml", /\[package\][\s\S]*?\r?\nversion = "([^"]+)"/),
  version,
);
expect(
  "Cargo lock package",
  capture(
    "apps/desktop/src-tauri/Cargo.lock",
    /\[\[package\]\]\r?\nname = "docsys-desktop"\r?\nversion = "([^"]+)"/,
  ),
  version,
);
expect(
  "portable client runtime",
  capture("apps/portable/client/main.go", /const version = "([^"]+)"/),
  manifest.portableClientRuntime,
);
expect(
  "portable server runtime",
  capture("apps/portable/launcher/main.go", /const version = "([^"]+)"/),
  manifest.portableServerRuntime,
);
expect(
  "portable update runtime",
  capture("infra/scripts/update-server-runtime.ps1", /runtime\\([^"\\]+)"/),
  manifest.portableServerRuntime,
);

const tagIndex = process.argv.indexOf("--tag");
if (tagIndex >= 0) {
  const tag = process.argv[tagIndex + 1];
  const supportedTags = new Set([`v${version}`, `desktop-v${version}`]);
  if (!supportedTags.has(tag)) {
    failures.push(`release tag: expected v${version}, found ${tag ?? "missing"}`);
  }
}

if (failures.length > 0) {
  console.error("Release alignment failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Release alignment passed for ${version}.`);
