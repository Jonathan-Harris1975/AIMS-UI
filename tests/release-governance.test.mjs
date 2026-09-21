import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata } from "../scripts/release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fullSha = "0123456789abcdef0123456789abcdef01234567";

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

  const wrangler = await readFile(join(root, "wrangler.toml"), "utf8");
  assert.match(wrangler, /^main = "dist\/gateway\/index\.js"$/m);
  assert.match(wrangler, /\[build\][\s\S]*command = "node scripts\/wrangler-build\.mjs"/);

  const wranglerBuild = await readFile(join(root, "scripts", "wrangler-build.mjs"), "utf8");
  assert.match(wranglerBuild, /wranglerCommand === "deploy"/);
  assert.match(wranglerBuild, /\["build:production", "verify:deploy-artifact"\]/);
});

test("readiness documentation matches the non-querying D1 readiness contract", async () => {
  for (const file of ["README.md", "workers/gateway/README.md"]) {
    const text = await readFile(join(root, file), "utf8");
    assert.doesNotMatch(text, /readiness probe verifies that .*tables are queryable/i);
    assert.doesNotMatch(text, /D1 schema is queryable/i);
    assert.match(text, /does not query D1/i);
  }
});
