import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const manifest = JSON.parse(await readFile(new globalThis.URL("../dist/.vite/manifest.json", import.meta.url), "utf8"));
const entry = manifest["index.html"];
if (!entry) throw new Error("Vite manifest entry index.html was not found");

const initialFiles = new Set();
const visit = (chunk) => {
  if (!chunk || initialFiles.has(chunk.file)) return;
  initialFiles.add(chunk.file);
  for (const imported of chunk.imports ?? []) visit(manifest[imported]);
};
visit(entry);

const javascript = Object.values(manifest).filter((chunk) => chunk.file.endsWith(".js"));
const rows = [];
for (const chunk of javascript) {
  const fileUrl = new globalThis.URL(`../dist/${chunk.file}`, import.meta.url);
  const size = (await stat(fileUrl)).size;
  const gzip = gzipSync(await readFile(fileUrl)).byteLength;
  rows.push({ file: chunk.file, size, gzip, initial: initialFiles.has(chunk.file) });
}

const maxChunkGzip = 180 * 1024;
const maxInitialGzip = 180 * 1024;
const initialGzip = rows.filter((row) => row.initial).reduce((sum, row) => sum + row.gzip, 0);
const oversized = rows.filter((row) => row.gzip > maxChunkGzip);

for (const row of rows.sort((a, b) => b.gzip - a.gzip)) {
  globalThis.console.log(`${row.initial ? "initial" : "lazy   "} ${(row.gzip / 1024).toFixed(1).padStart(7)} KiB gzip ${row.file}`);
}
globalThis.console.log(`initial ${(initialGzip / 1024).toFixed(1)} KiB gzip total`);

if (oversized.length > 0 || initialGzip > maxInitialGzip) {
  throw new Error(`Bundle budget exceeded: max chunk ${maxChunkGzip / 1024} KiB gzip, initial ${maxInitialGzip / 1024} KiB gzip`);
}
