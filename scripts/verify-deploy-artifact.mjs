import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDeploymentSourceDigest } from "./deployment-artifact.mjs";
import { resolveReleaseMetadata } from "./release-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const { releaseSha, releaseBranch } = resolveReleaseMetadata({ required: true });
const manifest = JSON.parse(await readFile(join(dist, "build-manifest.json"), "utf8"));
const sourceDigest = await computeDeploymentSourceDigest(root);

if (manifest.releaseSha !== releaseSha) {
  throw new Error(`Build manifest SHA ${manifest.releaseSha} does not match intended release SHA ${releaseSha}.`);
}
if (manifest.releaseBranch !== releaseBranch) {
  throw new Error(`Build manifest branch ${manifest.releaseBranch} does not match intended release branch ${releaseBranch}.`);
}
if (manifest.sourceDigest !== sourceDigest) {
  throw new Error("Deployment sources changed after the production build; rebuild before deployment.");
}

for (const required of [
  "site/index.html",
  "site/console/index.html",
  "site/widget/cognipal-widget.js",
  "gateway/index.js",
  "gateway/build-meta.js",
]) await access(join(dist, required));

const buildMeta = await readFile(join(dist, "gateway", "build-meta.js"), "utf8");
if (!buildMeta.includes(JSON.stringify(releaseSha)) || !buildMeta.includes(JSON.stringify(releaseBranch))) {
  throw new Error("Generated Worker build metadata does not match the intended production release.");
}
if (buildMeta.includes('"development"')) {
  throw new Error("Production Worker build metadata must never contain development placeholders.");
}

console.log(`Verified deploy artifact for ${releaseBranch}@${releaseSha}; source digest ${sourceDigest}.`);
