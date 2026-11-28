import test from "node:test";
import assert from "node:assert/strict";

globalThis.HTMLElement = class { attachShadow() { this.shadowRoot = {}; } };
globalThis.customElements = { get() {}, define() {} };
globalThis.document = { currentScript: null, scripts: [], hidden: false };
globalThis.location = { pathname: "/", origin: "https://example.test" };
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { CogniPalWidget } = await import("../apps/widget/cognipal-widget.js");

function widget() {
  const w = new CogniPalWidget();
  w.config = { siteId: "test", greeting: "Hello" };
  w.session = { sessionId: "s", token: "t" };
  w.open = w.consented = true;
  w.render = w.startPolling = w.stopPolling = w.scrollToEnd = () => {};
  return w;
}

test("a response for a cleared session cannot repopulate the chat", async () => {
  const w = widget();
  let resolve;
  w.transport = { messages: () => new Promise(r => { resolve = r; }) };
  const request = w.refreshMessages();
  w.resetConversation();
  resolve({ messages: [{ id: "old", text: "old" }], mode: "human" });
  await request;
  assert.deepEqual(w.messages, []);
  assert.equal(w.session, null);
  assert.equal(w.mode, "automation");
});

test("polling merges by ID and preserves draft and optimistic messages", async () => {
  const w = widget();
  w.draft = "Unsent text";
  w.messages = [{ id: "local", status: "failed", createdAt: "2026-01-01T00:00:00Z" }];
  const remote = { id: "remote", createdAt: "2026-01-01T00:00:01Z", text: "Hello" };
  w.transport = { messages: async () => ({ messages: [remote] }) };
  await w.refreshMessages();
  await w.refreshMessages();
  assert.deepEqual(w.messages.map(m => m.id), ["local", "remote"]);
  assert.equal(w.draft, "Unsent text");
});

test("closed conversations stop polling and reject sending", async () => {
  const w = widget();
  let stopped = false;
  w.stopPolling = () => { stopped = true; };
  w.transport = { messages: async () => ({ messages: [], status: "closed" }) };
  await w.refreshMessages();
  assert.equal(w.mode, "closed");
  assert.equal(stopped, true);
  w.shadowRoot.querySelector = () => ({ value: "No send" });
  await w.sendMessage();
  assert.deepEqual(w.messages, []);
});
