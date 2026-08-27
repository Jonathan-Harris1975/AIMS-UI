import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "apps/console/index.html",
  "apps/console/app.js",
  "apps/widget/cognipal-widget.js",
  "apps/console/assets/CogniPal.jpg",
  "workers/gateway/index.js",
  "workers/gateway/schema.sql",
  "packages/theme/tokens.css",
];

for (const file of required) await access(join(root, file));

const forbiddenArtifacts = [
  "apps/console/mock-data.js",
  "apps/widget/demo.html",
  "gateway.test.mjs",
];
for (const file of forbiddenArtifacts) {
  try {
    await access(join(root, file));
    throw new Error(`Production bundle must not contain ${file}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", ".git", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else found.push(path);
  }
  return found;
}

const files = await walk(root);
const scripts = files.filter((file) => [".js", ".mjs"].includes(extname(file)));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`Syntax check failed: ${relative(root, file)}`);
  }
}

const forbidden = [
  /COMMS_HUB_RBAC_DELEGATION_SECRET\s*=\s*["'][^"']{12,}/,
  /COGNIPAL_API_KEY\s*=\s*["'][^"']{12,}/,
  /COGNIPAL_WEBHOOK_SECRET\s*=\s*["'][^"']{12,}/,
  /CHAT_SESSION_SECRET\s*=\s*["'][^"']{12,}/,
];
for (const file of files.filter((item) => [".js", ".mjs", ".html", ".toml", ".md"].includes(extname(item)))) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) throw new Error(`Possible embedded secret in ${relative(root, file)}`);
  }
}

const productionRuntimeFiles = files.filter((item) => {
  const rel = relative(root, item).replaceAll("\\", "/");
  return rel.startsWith("apps/") || rel.startsWith("workers/");
});
const forbiddenRuntimeMarkers = ["demoMode", "?demo=1", "demo-token", "mock-data.js"];
for (const file of productionRuntimeFiles) {
  if (![".js", ".mjs", ".html"].includes(extname(file))) continue;
  const source = await readFile(file, "utf8");
  for (const marker of forbiddenRuntimeMarkers) {
    if (source.includes(marker)) throw new Error(`Production demo marker ${marker} found in ${relative(root, file)}`);
  }
}

const consoleIndex = await readFile(join(root, "apps/console/index.html"), "utf8");
if (!consoleIndex.includes('lang="en-GB"')) throw new Error("Console document language must be en-GB.");
if (/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(consoleIndex)) throw new Error("Console HTML must not contain inline scripts or import maps.");
const consoleApp = await readFile(join(root, "apps/console/app.js"), "utf8");
for (const bareSpecifier of ["@aims/api", "@aims/shared", "@aims/contracts"]) {
  if (consoleApp.includes(`from "${bareSpecifier}"`) || consoleApp.includes(`from '${bareSpecifier}'`)) {
    throw new Error(`Console app must not depend on an inline import map for ${bareSpecifier}.`);
  }
}
const widget = await readFile(join(root, "apps/widget/cognipal-widget.js"), "utf8");
if (!widget.includes("attachShadow")) throw new Error("CogniPal widget must retain Shadow DOM isolation.");
if (!widget.includes("https://assets.jonathan-harris.online/CogniPal.jpg")) throw new Error("CogniPal icon default is missing.");

const wrangler = await readFile(join(root, "wrangler.toml"), "utf8");
if (!/\[observability\]\s*\r?\n\s*enabled\s*=\s*true\b/.test(wrangler)) {
  throw new Error("Cloudflare Workers observability must be enabled in production.");
}
if (!/\[observability\.logs\]\s*\r?\n\s*enabled\s*=\s*true\b/.test(wrangler)) {
  throw new Error("Cloudflare Workers logs must be enabled in production.");
}
if (!/\[observability\.traces\]\s*\r?\n\s*enabled\s*=\s*true\b/.test(wrangler)) {
  throw new Error("Cloudflare Workers traces must be enabled in production.");
}

console.log(`Checked ${scripts.length} JavaScript modules and ${required.length} required files.`);
