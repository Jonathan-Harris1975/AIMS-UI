import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const budget = JSON.parse(await readFile(join(root, "config", "bundle-budget.json"), "utf8"));

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(dist);
let totalBytes = 0;
let javascriptGzipBytes = 0;
let cssGzipBytes = 0;
let largest = { path: "", bytes: 0 };

for (const file of files) {
  const bytes = (await stat(file)).size;
  totalBytes += bytes;
  if (bytes > largest.bytes) largest = { path: relative(root, file).replaceAll("\\", "/"), bytes };
  const extension = extname(file).toLowerCase();
  if ([".js", ".mjs"].includes(extension)) javascriptGzipBytes += gzipSync(await readFile(file), { level: 9 }).byteLength;
  if (extension === ".css") cssGzipBytes += gzipSync(await readFile(file), { level: 9 }).byteLength;
}

const measurements = {
  totalBytes,
  javascriptGzipBytes,
  cssGzipBytes,
  largestAssetBytes: largest.bytes,
  largestAsset: largest.path,
};
const checks = [
  ["total bundle bytes", totalBytes, budget.maxTotalBytes],
  ["gzipped JavaScript bytes", javascriptGzipBytes, budget.maxJavaScriptGzipBytes],
  ["gzipped CSS bytes", cssGzipBytes, budget.maxCssGzipBytes],
  ["largest single asset bytes", largest.bytes, budget.maxSingleAssetBytes],
];
const failures = checks.filter(([, actual, maximum]) => actual > maximum);
console.log(JSON.stringify({ ok: failures.length === 0, measurements, budget }, null, 2));
if (failures.length) {
  for (const [name, actual, maximum] of failures) console.error(`${name} exceeded budget: ${actual} > ${maximum}`);
  process.exitCode = 1;
}
