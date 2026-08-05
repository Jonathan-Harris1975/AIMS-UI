import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "apps/console/index.html",
  "apps/console/app.js",
  "apps/widget/cognipal-widget.js",
  "apps/widget/assets/CogniPal.jpg",
  "workers/gateway/index.js",
  "workers/gateway/schema.sql",
  "packages/theme/tokens.css",
];

for (const file of required) await access(join(root, file));

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

const consoleIndex = await readFile(join(root, "apps/console/index.html"), "utf8");
if (!consoleIndex.includes('lang="en-GB"')) throw new Error("Console document language must be en-GB.");
const widget = await readFile(join(root, "apps/widget/cognipal-widget.js"), "utf8");
if (!widget.includes("attachShadow")) throw new Error("CogniPal widget must retain Shadow DOM isolation.");
if (!widget.includes("https://assets.jonathan-harris.online/CogniPal.jpg")) throw new Error("CogniPal icon default is missing.");

console.log(`Checked ${scripts.length} JavaScript modules and ${required.length} required files.`);
