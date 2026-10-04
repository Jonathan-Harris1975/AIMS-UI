import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionDeploymentMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const wranglerCommand = String(process.env.WRANGLER_COMMAND || "").trim();
const productionCommand = wranglerCommand === "deploy";
if (productionCommand) resolveProductionDeploymentMetadata();
const scripts = productionCommand
  ? ["build:production", "verify:deploy-artifact"]
  : ["build"];

for (const script of scripts) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}

// The public widget persists sessions and messages in D1. Provision the
// idempotent schema from every Wrangler deploy path because Cloudflare Workers
// Builds invokes `wrangler deploy` directly, which runs this hook but never the
// npm `deploy:production` wrapper. Applying the schema here keeps the deployed
// gateway writable regardless of which release entry point is used.
if (productionCommand) {
  const config = readFileSync(join(root, "wrangler.toml"), "utf8");
  const match = config.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("wrangler.toml must declare a D1 database_name for schema provisioning.");
  const result = spawnSync("npx", [
    "--yes", "wrangler@4.135.0", "d1", "execute", match[1],
    "--remote", "--file", join(root, "workers/gateway/schema.sql"),
    "--config", join(root, "wrangler.toml"), "--yes",
  ], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}
