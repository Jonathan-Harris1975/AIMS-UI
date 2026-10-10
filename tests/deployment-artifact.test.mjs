import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { computeDeploymentArtifactDigest, computeDeploymentSourceDigest } from "../scripts/deployment-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("payload digest detects edits, additions, deletions and rejects symbolic links", async (t) => {
  const dist = await mkdtemp(join(tmpdir(), "aims-artifact-"));
  t.after(() => rm(dist, { recursive: true, force: true }));
  await writeFile(join(dist, "worker.js"), "original");
  const digest = await computeDeploymentArtifactDigest(dist);
  await writeFile(join(dist, "build-manifest.json"), "manifest is excluded");
  assert.equal(await computeDeploymentArtifactDigest(dist), digest);
  await writeFile(join(dist, "worker.js"), "modified");
  assert.notEqual(await computeDeploymentArtifactDigest(dist), digest);
  await writeFile(join(dist, "worker.js"), "original");
  await writeFile(join(dist, "extra.js"), "extra");
  assert.notEqual(await computeDeploymentArtifactDigest(dist), digest);
  await rm(join(dist, "worker.js"));
  assert.notEqual(await computeDeploymentArtifactDigest(dist), digest);
  await symlink(join(dist, "extra.js"), join(dist, "link.js"));
  await assert.rejects(computeDeploymentArtifactDigest(dist), /regular files/);
});

test("production verification rejects altered payload and missing digest", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "aims-verification-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  for (const path of ["scripts", "apps", "packages", "workers", "README.md", "THIRD_PARTY_NOTICES.md", "package.json", "wrangler.toml"]) {
    await cp(join(root, path), join(fixture, path), { recursive: true });
  }
  const env = { ...process.env, AIMS_UI_RELEASE_SHA: "a".repeat(40), AIMS_UI_RELEASE_BRANCH: "main" };
  const run = (script) => spawnSync(process.execPath, [join(fixture, "scripts", script)], { cwd: fixture, env, encoding: "utf8" });
  const build = run("build-production.mjs");
  assert.equal(build.status, 0, build.stderr);
  assert.equal(run("verify-deploy-artifact.mjs").status, 0);
  const manifestPath = join(fixture, "dist/build-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.artifactDigest;
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.match(run("verify-deploy-artifact.mjs").stderr, /artifact content does not match/);
  assert.equal(run("build-production.mjs").status, 0);
  await writeFile(join(fixture, "dist/site/root-redirect.js"), "tampered");
  assert.match(run("verify-deploy-artifact.mjs").stderr, /artifact content does not match/);
  const digest = await computeDeploymentSourceDigest(fixture);
  await writeFile(join(fixture, "wrangler.toml"), "changed provider configuration");
  assert.notEqual(await computeDeploymentSourceDigest(fixture), digest);
  await cp(join(root, "wrangler.toml"), join(fixture, "wrangler.toml"));
  await mkdir(join(fixture, "scripts/new"));
  await writeFile(join(fixture, "scripts/new/build.mjs"), "changed build input");
  assert.notEqual(await computeDeploymentSourceDigest(fixture), digest);
});
