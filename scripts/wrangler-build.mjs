import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const wranglerCommand = String(process.env.WRANGLER_COMMAND || "").trim();
const productionCommand = wranglerCommand === "deploy";
const scripts = productionCommand
  ? ["build:production", "verify:deploy-artifact"]
  : ["build"];

for (const script of scripts) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}

// The public widget persists sessions and messages in D1, and Cloudflare
// Workers Builds runs this hook through `wrangler deploy` without ever calling
// the npm `deploy:production` wrapper. Apply the idempotent schema from every
// Wrangler deploy path so the published Worker always has its tables. Wrangler
// sets WRANGLER_COMMAND, so `wrangler dev` leaves the database untouched.
if (productionCommand) {
  const config = readFileSync(join(root, "wrangler.toml"), "utf8");
  const match = config.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("wrangler.toml must declare a D1 database_name for schema provisioning.");
  const result = spawnSync("npx", [
    "--yes", "wrangler@4.135.0", "d1", "execute", match[1],
    "--remote", "--file", "workers/gateway/schema.sql", "--config", "wrangler.toml", "--yes",
  ], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}
