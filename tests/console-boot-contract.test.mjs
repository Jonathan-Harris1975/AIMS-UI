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

test("failed bootstrap removes the loading layout before rendering the error shell", async () => {
  const app = await readFile(resolve(root, "apps/console/app.js"), "utf8");
  const renderStart = app.indexOf("function render() {");
  assert.ok(renderStart >= 0, "Missing console render function");
  const renderEnd = app.indexOf("\nfunction bindEvents()", renderStart);
  assert.ok(renderEnd > renderStart, "Console render must end before bindEvents");
  const render = app.slice(renderStart, renderEnd);
  assert.match(render, /root\.className = "";\s*if \(state\.error && !state\.bootstrap\) \{\s*root\.innerHTML = errorView\(\)/);
});


test("static console icons are supplied by the inert document template", async () => {
  const html = await readFile(resolve(root, "apps/console/index.html"), "utf8");
  const app = await readFile(resolve(root, "apps/console/app.js"), "utf8");
  const template = html.match(/<template id="console-icons">([\s\S]*?)<\/template>/);
  assert.ok(template);
  const names = [...template[1].matchAll(/<svg data-icon="([^"]+)"[^>]*aria-hidden="true"/g)].map(match => match[1]);
  assert.equal(names.length, 22);
  assert.equal(new Set(names).size, names.length);
  for (const [, name] of app.matchAll(/\bicons\.(\w+)/g)) assert.ok(names.includes(name), "Missing icon: " + name);
  assert.match(app, /document\.querySelector\("#console-icons"\)\.content/);
});


test("static editor templates preserve fields and permission placeholders", async () => {
  const html = await readFile(resolve(root, "apps/console/index.html"), "utf8");
  const app = await readFile(resolve(root, "apps/console/app.js"), "utf8");
  for (const id of ["mail-compose", "contact-editor", "reply-composer"]) {
    assert.ok(html.includes('<template id="' + id + '">'));
    assert.ok(app.includes('staticMarkup("' + id + '"'));
  }
  assert.match(html, /name="displayName"[^>]*data-slot-6=""/);
  assert.match(html, /name="message"[^>]*data-slot-0=""/s);
  assert.match(app, /canEdit \? "" : "disabled"/);
  assert.match(app, /socialThread && socialMonitorOnly \? "disabled" : ""/);
});
