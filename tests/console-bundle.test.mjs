import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createConsoleBundle } from "../scripts/console-bundle.mjs";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production console bundles internal modules into one browser module", async () => {
  const bundle = createConsoleBundle({
    apiClient: await source("../packages/api-client/index.js"),
    format: await source("../packages/shared/format.js"),
    contracts: await source("../packages/shared/contracts.js"),
    app: await source("../apps/console/app.js"),
  });

  assert.doesNotMatch(bundle, /^\s*import\s/m);
  assert.doesNotMatch(bundle, /^\s*export\s/m);
  assert.match(bundle, /class AimsCommsClient/);
  assert.match(bundle, /function roleAllows/);
  assert.match(bundle, /function escapeHtml/);
  assert.match(bundle, /loadBootstrap\(\);/);
});

test("production console bundler fails closed when source imports drift", () => {
  assert.throws(() => createConsoleBundle({
    apiClient: "export class AimsCommsClient {}",
    format: "export function escapeHtml() {}",
    contracts: "export function roleAllows() {}",
    app: "import { changed } from './new-module.js';\nchanged();\n",
  }), /import contract changed/);
});
