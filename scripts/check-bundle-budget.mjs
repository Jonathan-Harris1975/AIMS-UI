import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleBudgetFailures, javascriptBudgetStatus, loadBundleBudget } from "./bundle-budget.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const budgetPath = process.env.AIMS_UI_BUNDLE_BUDGET_CONFIG || join(root, "config", "bundle-budget.json");
const budget = await loadBundleBudget(budgetPath);

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
const javascript = javascriptBudgetStatus(javascriptGzipBytes, budget);
const failures = bundleBudgetFailures(measurements, budget);

console.log(JSON.stringify({ ok: failures.length === 0, measurements, javascript, budget }, null, 2));
if (javascript.state === "warning") {
  console.warn(
    `WARNING: gzipped JavaScript is in the bundle warning band: ${javascript.actualGzipBytes} bytes; `
      + `warning ${javascript.warningLimit}; hard ${javascript.hardLimit}; remaining ${javascript.remainingBytes}; `
      + `${javascript.percentageConsumed}% consumed.`,
  );
}
if (failures.length) {
  for (const [name, actual, maximum] of failures) console.error(`${name} exceeded budget: ${actual} > ${maximum}`);
  process.exitCode = 1;
}
