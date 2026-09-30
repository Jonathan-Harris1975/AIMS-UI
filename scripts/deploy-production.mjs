import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const allowedArguments = new Set(["--dry-run"]);
const extraArguments = process.argv.slice(2);
for (const argument of extraArguments) {
  if (!allowedArguments.has(argument)) {
    throw new Error(`Unsupported production deployment argument: ${argument}`);
  }
}

const { releaseSha, releaseBranch } = resolveReleaseMetadata({ required: true });
const env = {
  ...process.env,
  AIMS_UI_RELEASE_SHA: releaseSha,
  AIMS_UI_RELEASE_BRANCH: releaseBranch,
};

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function d1DatabaseName() {
  const config = readFileSync(join(root, "wrangler.toml"), "utf8");
  const match = config.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("wrangler.toml must declare a D1 database_name for schema provisioning.");
  return match[1];
}

run("npm", ["run", "validate"]);
run("npm", ["run", "build:production"]);
run("npm", ["run", "verify:deploy-artifact"]);

const dryRun = extraArguments.includes("--dry-run");
if (!dryRun) {
  run("npx", ["--yes", "wrangler@4.135.0", "d1", "execute", d1DatabaseName(), "--remote", "--file", "workers/gateway/schema.sql", "--config", "wrangler.toml", "--yes"]);
}

const wranglerArguments = ["--yes", "wrangler@4.135.0", "deploy", "--config", "wrangler.toml", ...extraArguments];
run("npx", wranglerArguments);
