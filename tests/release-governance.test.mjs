import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, resolveProductionDeploymentMetadata } from "../scripts/release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fullSha = "0123456789abcdef0123456789abcdef01234567";

test("production dry-run validates artifacts without executing remote D1 writes", async (t) => {
  const bin = await mkdtemp(join(tmpdir(), "aims-dry-run-"));
  t.after(() => rm(bin, { recursive: true, force: true }));
  for (const command of ["npm", "npx"]) {
    const path = join(bin, command);
    await writeFile(path, `#!/bin/sh\nprintf '%s\\n' '${command}' "$@"\n`);
    await chmod(path, 0o755);
  }
  const env = {
    PATH: bin, WORKERS_CI_COMMIT_SHA: fullSha, WORKERS_CI_BRANCH: "main",
    WRANGLER_COMMAND: "deploy", AIMS_UI_DEPLOY_DRY_RUN: "1",
  };
  const run = (dryRun) => spawnSync(process.execPath, [join(root, "scripts/wrangler-build.mjs")], {
    encoding: "utf8", env: { ...env, AIMS_UI_DEPLOY_DRY_RUN: dryRun },
  });
  const dry = run("1");
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /build:production/);
  assert.match(dry.stdout, /verify:deploy-artifact/);
  assert.doesNotMatch(dry.stdout, /npx|--remote/);
  const live = run("0");
  assert.equal(live.status, 0, live.stderr);
  assert.match(live.stdout, /--remote/);
  const wrapper = await readFile(join(root, "scripts/deploy-production.mjs"), "utf8");
  assert.match(wrapper, /AIMS_UI_DEPLOY_DRY_RUN: extraArguments.includes\("--dry-run"\) \? "1" : "0"/);
});

test("production deployment accepts main and rejects feature branches including disguised provider builds", () => {
  assert.equal(resolveProductionDeploymentMetadata({ env: {}, git: gitFixture() }).releaseBranch, "main");
  assert.throws(() => resolveProductionDeploymentMetadata({ env: {}, git: gitFixture({ branch: "codex/recovery" }) }), /requires the main branch/);
  assert.throws(() => resolveProductionDeploymentMetadata({
    env: { AIMS_UI_RELEASE_SHA: fullSha, AIMS_UI_RELEASE_BRANCH: "main", WORKERS_CI_BRANCH: "codex/recovery" },
    git: gitFixture({ branch: "" }),
  }), /requires the main branch/);
  assert.equal(resolveProductionDeploymentMetadata({
    env: { WORKERS_CI_COMMIT_SHA: fullSha, WORKERS_CI_BRANCH: "main" },
    git: gitFixture({ branch: "" }),
  }).releaseBranch, "main");
  // PR builds remain available to the release gate.
  assert.equal(resolveReleaseMetadata({ required: true, env: {}, git: gitFixture({ branch: "codex/recovery" }) }).releaseBranch, "codex/recovery");
});

test("blocked Cloudflare deployments identify conflicting branch and commit signals without exposing environment secrets", () => {
  assert.throws(
    () => resolveProductionDeploymentMetadata({
      env: {
        WORKERS_CI_BRANCH: "feature/cloudflare-preview",
        WORKERS_CI_COMMIT_SHA: fullSha,
        AIMS_API_KEY: "must-not-appear",
      },
      git: gitFixture({ branch: "" }),
    }),
    (error) => {
      assert.match(error.message, /requires the main branch/);
      assert.equal(JSON.parse(error.message.split("Branch evidence: ")[1]).workersCiBranch, "feature/cloudflare-preview");
      assert.equal(JSON.parse(error.message.split("Branch evidence: ")[1]).gitBranch, "(detached/unavailable)");
      assert.match(error.message, new RegExp(fullSha));
      assert.doesNotMatch(error.message, /must-not-appear|AIMS_API_KEY/);
      return true;
    },
  );
});

test("both production entry points reject a feature branch before invoking build or remote schema tools", () => {
  for (const script of ["deploy-production.mjs", "wrangler-build.mjs"]) {
    const result = spawnSync(process.execPath, [join(root, "scripts", script)], {
      encoding: "utf8",
      env: { PATH: "", WORKERS_CI_COMMIT_SHA: fullSha, WORKERS_CI_BRANCH: "codex/recovery", WRANGLER_COMMAND: "deploy" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Production deployment requires the main branch/);
    assert.equal(result.stdout, "");
  }
});

function gitFixture({ sha = fullSha, branch = "main" } = {}) {
  return (args) => {
    if (args.join(" ") === "rev-parse HEAD") return sha;
    if (args.join(" ") === "branch --show-current") return branch;
    return "";
  };
}

test("production release metadata requires an exact SHA and branch", () => {
  assert.deepEqual(resolveReleaseMetadata({
    required: true,
    env: {},
    git: gitFixture({}),
  }), {
    releaseSha: fullSha,
    releaseBranch: "main",
  });

  assert.throws(() => resolveReleaseMetadata({
    required: true,
    env: { AIMS_UI_RELEASE_SHA: "abc123", AIMS_UI_RELEASE_BRANCH: "main" },
    git: () => "",
  }), /exact full Git SHA/);

  assert.throws(() => resolveReleaseMetadata({
    required: true,
    env: { AIMS_UI_RELEASE_SHA: fullSha },
    git: () => "",
  }), /branch cannot be determined/);
});

test("production release metadata rejects a checkout mismatch", () => {
  const differentSha = "fedcba9876543210fedcba9876543210fedcba98";
  assert.throws(() => resolveReleaseMetadata({
    required: true,
    env: { AIMS_UI_RELEASE_SHA: differentSha, AIMS_UI_RELEASE_BRANCH: "main" },
    git: gitFixture({}),
  }), /does not match checked-out Git SHA/);

  assert.throws(() => resolveReleaseMetadata({
    required: true,
    env: { AIMS_UI_RELEASE_SHA: fullSha, AIMS_UI_RELEASE_BRANCH: "release" },
    git: gitFixture({}),
  }), /does not match checked-out Git branch/);
});

test("production deployment is governed by validation, production build and artifact verification", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(packageJson.repositoryIdentity, "AIMS-UI");
  assert.equal(packageJson.scripts["deploy:production"], "node scripts/deploy-production.mjs");
  assert.match(packageJson.scripts.validate, /npm run secret:scan/);
  assert.match(packageJson.scripts.validate, /npm run audit:dependencies/);

  const deployScript = await readFile(join(root, "scripts", "deploy-production.mjs"), "utf8");
  assert.match(deployScript, /\["run", "validate"\]/);
  assert.match(deployScript, /\["run", "build:production"\]/);
  assert.match(deployScript, /\["run", "verify:deploy-artifact"\]/);
  assert.match(deployScript, /wrangler@4\.135\.0/);
  // The deploy wrapper must not provision D1 a second time: Wrangler's build hook owns it.
  assert.doesNotMatch(deployScript, /"d1", "execute"/);
  assert.doesNotMatch(deployScript, /workers\/gateway\/schema\.sql/);
  assert.match(deployScript, /allowedArguments = new Set\(\["--dry-run"\]\)/);

  const wrangler = await readFile(join(root, "wrangler.toml"), "utf8");
  assert.match(wrangler, /^main = "dist\/gateway\/index\.js"$/m);
  assert.match(wrangler, /\[build\][\s\S]*command = "node scripts\/wrangler-build\.mjs"/);

  const wranglerBuild = await readFile(join(root, "scripts", "wrangler-build.mjs"), "utf8");
  assert.match(wranglerBuild, /wranglerCommand === "deploy"/);
  assert.match(wranglerBuild, /\["build:production", "verify:deploy-artifact"\]/);
  // Cloudflare Workers Builds deploys through `wrangler deploy`, which runs
  // this hook but not the npm deploy:production wrapper, so the deploy hook
  // must provision the D1 schema the public widget depends on.
  assert.match(wranglerBuild, /"d1", "execute"/);
  assert.match(wranglerBuild, /workers\/gateway\/schema\.sql/);
  assert.match(wranglerBuild, /--remote/);
});

test("readiness documentation matches the non-querying D1 readiness contract", async () => {
  for (const file of ["README.md", "workers/gateway/README.md"]) {
    const text = await readFile(join(root, file), "utf8");
    assert.doesNotMatch(text, /readiness probe verifies that .*tables are queryable/i);
    assert.doesNotMatch(text, /D1 schema is queryable/i);
    assert.match(text, /does not query D1/i);
  }
});
