import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const nextVersion = process.argv[2];

if (!nextVersion || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  console.error("Usage: pnpm release:version <semver>");
  process.exit(1);
}

const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const write = (relativePath, content) => writeFileSync(`${root}/${relativePath}`, content);
const updateJson = (relativePath, mutate) => {
  const value = JSON.parse(read(relativePath));
  mutate(value);
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
};
const replace = (relativePath, pattern, replacement) => {
  const current = read(relativePath);
  const next = current.replace(pattern, replacement);
  if (next === current) {
    throw new Error(`Could not update ${relativePath}`);
  }
  write(relativePath, next);
};

const clientRuntime = `${nextVersion}-client.1`;
const serverRuntime = `${nextVersion}-server.1`;

for (const relativePath of [
  "package.json",
  "apps/desktop/package.json",
  "apps/portable/package.json",
]) {
  updateJson(relativePath, (value) => {
    value.version = nextVersion;
  });
}

updateJson("apps/desktop/src-tauri/tauri.conf.json", (value) => {
  value.version = nextVersion;
});
updateJson("release.json", (value) => {
  value.version = nextVersion;
  value.portableClientRuntime = clientRuntime;
  value.portableServerRuntime = serverRuntime;
});

replace(
  "apps/desktop/src-tauri/Cargo.toml",
  /(\[package\][\s\S]*?\r?\nversion = ")[^"]+("\r?\n)/,
  `$1${nextVersion}$2`,
);
replace(
  "apps/desktop/src-tauri/Cargo.lock",
  /(\[\[package\]\]\r?\nname = "docsys-desktop"\r?\nversion = ")[^"]+("\r?\n)/,
  `$1${nextVersion}$2`,
);
replace(
  "apps/portable/client/main.go",
  /const version = "[^"]+"/,
  `const version = "${clientRuntime}"`,
);
replace(
  "apps/portable/launcher/main.go",
  /const version = "[^"]+"/,
  `const version = "${serverRuntime}"`,
);
replace(
  "infra/scripts/update-server-runtime.ps1",
  /runtime\\[^"\\]+"/,
  `runtime\\${serverRuntime}"`,
);

console.log(`Release version updated to ${nextVersion}.`);
console.log("Run pnpm install --lockfile-only and pnpm release:check next.");
