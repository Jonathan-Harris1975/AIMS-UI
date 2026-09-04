import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectories = ["apps", "packages", "scripts", "tests", "workers"];
const supportedExtensions = new Set([".js", ".mjs"]);
const maxLineLength = 200;

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (supportedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = (await Promise.all(sourceDirectories.map((directory) => walk(join(root, directory)))))
  .flat()
  .sort();
const violations = [];

for (const file of files) {
  const lines = (await readFile(file, "utf8")).split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (line.length <= maxLineLength) return;
    violations.push({
      file: relative(root, file).replaceAll("\\", "/"),
      line: index + 1,
      length: line.length,
    });
  });
}

if (violations.length) {
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} exceeds ${maxLineLength} characters (${violation.length}).`);
  }
  throw new Error(`Lint failed with ${violations.length} overlong line${violations.length === 1 ? "" : "s"}.`);
}

console.log(`Linted ${files.length} JavaScript modules; no line exceeds ${maxLineLength} characters.`);
