import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProductionDeploymentMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const allowedArguments = new Set(["--dry-run"]);
const extraArguments = process.argv.slice(2);
for (const argument of extraArguments) {
  if (!allowedArguments.has(argument)) {
    throw new Error(`Unsupported production deployment argument: ${argument}`);
  }
}

const { releaseSha, releaseBranch } = resolveProductionDeploymentMetadata();
const env = {
  ...process.env,
  AIMS_UI_RELEASE_SHA: releaseSha,
  AIMS_UI_RELEASE_BRANCH: releaseBranch,
  AIMS_UI_DEPLOY_DRY_RUN: extraArguments.includes("--dry-run") ? "1" : "0",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("npm", ["run", "validate"]);
run("npm", ["run", "build:production"]);
run("npm", ["run", "verify:deploy-artifact"]);

// Wrangler invokes scripts/wrangler-build.mjs, which provisions D1 once for real deploys.
// Do not apply the remote schema here as well: ambiguous failures must not replay writes.
const wranglerArguments = ["--yes", "wrangler@4.135.0", "deploy", "--config", "wrangler.toml", ...extraArguments];
run("npx", wranglerArguments);
