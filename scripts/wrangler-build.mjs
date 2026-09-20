import { spawnSync } from "node:child_process";

const wranglerCommand = String(process.env.WRANGLER_COMMAND || "").trim();
const productionCommand = wranglerCommand === "deploy";
const scripts = productionCommand
  ? ["build:production", "verify:deploy-artifact"]
  : ["build"];

for (const script of scripts) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}
