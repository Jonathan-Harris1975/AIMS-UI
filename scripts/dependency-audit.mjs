import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const dependencyCount = Object.keys(packageJson.dependencies || {}).length + Object.keys(packageJson.devDependencies || {}).length;

if (dependencyCount === 0) {
  console.log("Dependency audit passed: package.json declares no npm dependencies.");
  process.exit(0);
}

try {
  await access(join(root, "package-lock.json"));
} catch {
  throw new Error("package-lock.json is required before npm dependencies can be audited reproducibly.");
}

const result = spawnSync("npm", ["audit", "--audit-level=high", "--no-fund"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.status !== 0) process.exit(result.status || 1);
