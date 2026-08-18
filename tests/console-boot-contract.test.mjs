import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import gateway from "../workers/gateway/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("console boot does not depend on an inline import map blocked by CSP", async () => {
  const [html, app] = await Promise.all([
    readFile(resolve(root, "apps/console/index.html"), "utf8"),
    readFile(resolve(root, "apps/console/app.js"), "utf8"),
  ]);

  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /type=["']importmap["']/i);
  assert.match(app, /from ["']\.\.\/\.\.\/packages\/api-client\/index\.js["']/);
  assert.match(app, /from ["']\.\.\/\.\.\/packages\/shared\/format\.js["']/);
  assert.match(app, /from ["']\.\.\/\.\.\/packages\/shared\/contracts\.js["']/);

  const response = await gateway.fetch(new Request("https://chat.jonathan-harris.online/console/"), {
    ASSETS: {
      fetch: async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    },
  });
  const csp = response.headers.get("content-security-policy") || "";
  assert.match(csp, /(?:^|;)\s*script-src 'self'(?:;|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*sha256-/);
});
