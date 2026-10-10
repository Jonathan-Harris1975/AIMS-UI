import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const SOURCE_DIRECTORIES = ["apps", "packages", "workers/gateway", "scripts"];
const SOURCE_FILES = ["README.md", "THIRD_PARTY_NOTICES.md", "package.json", "wrangler.toml"];
const IGNORED_SOURCE_FILES = new Set(["workers/gateway/build-meta.js"]);

async function walk(root, directory) {
  const files = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const relativePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else throw new Error(`Deployment inputs must be regular files: ${relativePath}`);
  }
  return files;
}

export async function deploymentSourceFiles(root) {
  const nested = (await Promise.all(SOURCE_DIRECTORIES.map((directory) => walk(root, directory)))).flat();
  return [...SOURCE_FILES, ...nested]
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !IGNORED_SOURCE_FILES.has(file))
    .sort();
}

export async function computeDeploymentSourceDigest(root) {
  const hash = createHash("sha256");
  for (const file of await deploymentSourceFiles(root)) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

// Hash the complete generated payload, including filenames, so additions,
// removals and edits all invalidate the manifest. The manifest cannot hash itself.
export async function computeDeploymentArtifactDigest(dist) {
  const hash = createHash("sha256");
  const files = (await walk(dist, "."))
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file !== "build-manifest.json")
    .sort();
  if (!files.length) throw new Error("Deployment artifact is empty.");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(dist, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function relativePath(root, path) {
  return relative(root, path).replaceAll("\\", "/");
}
