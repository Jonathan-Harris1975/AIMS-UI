import test from "node:test";
import assert from "node:assert/strict";

test("module loader mounts one widget from module-script data attributes", async () => {
  const moduleUrl = new URL("../apps/widget/cognipal-widget.js", import.meta.url).href;
  let appended = null;
  const registry = new Map();

  globalThis.HTMLElement = class {
    constructor() { this.dataset = {}; }
    attachShadow() { return { addEventListener() {}, querySelector() { return null; }, innerHTML: "" }; }
  };
  globalThis.customElements = {
    get(name) { return registry.get(name); },
    define(name, constructor) { registry.set(name, constructor); },
  };
  globalThis.location = { search: "", hostname: "example.test", href: "https://example.test/", origin: "https://example.test" };
  globalThis.document = {
    currentScript: null,
    baseURI: "https://example.test/",
    scripts: [{ src: moduleUrl, dataset: { siteId: "example.test" } }],
    readyState: "complete",
    querySelector() { return null; },
    createElement(name) { return { localName: name, dataset: {} }; },
    body: { append(element) { appended = element; } },
  };

  await import(moduleUrl);
  assert.ok(registry.has("cognipal-widget"));
  assert.equal(appended?.localName, "cognipal-widget");
  assert.equal(appended?.dataset?.siteId, "example.test");

  delete globalThis.HTMLElement;
  delete globalThis.customElements;
  delete globalThis.location;
  delete globalThis.document;
});
