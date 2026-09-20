import { spawnSync } from "node:child_process";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

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

run("npm", ["run", "validate"]);
run("npm", ["run", "build:production"]);
run("npm", ["run", "verify:deploy-artifact"]);

const wranglerArguments = ["--yes", "wrangler@4.135.0", "deploy", "--config", "wrangler.toml", ...extraArguments];
run("npx", wranglerArguments);
