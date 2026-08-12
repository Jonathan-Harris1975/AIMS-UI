import test from "node:test";
import assert from "node:assert/strict";
import { AimsApiError, AimsCommsClient, makeUrl } from "../packages/api-client/index.js";

test("makeUrl normalises relative paths and filters empty query values", () => {
  assert.equal(makeUrl("/console/api/", "queue", { status: "open", overdue: false, empty: "" }), "/console/api/queue?status=open");
});

test("makeUrl retains an absolute API base", () => {
  assert.equal(makeUrl("https://example.test/api", "/queue", { channel: "chat" }), "https://example.test/api/queue?channel=chat");
});

test("client adds one idempotency key to mutations", async () => {
  let captured;
  const client = new AimsCommsClient({
    baseUrl: "https://example.test",
    fetchImpl: async (_url, options) => {
      captured = options;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await client.updateStatus("cnv-1", "resolved");
  assert.match(captured.headers.get("idempotency-key"), /^ui-/);
  assert.equal(captured.method, "PATCH");
});


test("client never rebinds the supplied fetch implementation", async () => {
  const requiredThis = globalThis;
  const brandSensitiveFetch = function (_url, options) {
    assert.equal(this, undefined);
    return Promise.resolve(new Response(JSON.stringify({ ok: true, options }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  };
  const client = new AimsCommsClient({
    baseUrl: "https://example.test",
    fetchImpl: brandSensitiveFetch,
  });
  const result = await client.bootstrap();
  assert.equal(result.ok, true);
  assert.equal(requiredThis, globalThis);
});

test("client exposes AIMS error payloads", async () => {
  const client = new AimsCommsClient({
    baseUrl: "https://example.test",
    fetchImpl: async () => new Response(JSON.stringify({ error: "permission_denied", message: "No." }), { status: 403, headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(() => client.queue(), (error) => {
    assert.ok(error instanceof AimsApiError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "permission_denied");
    return true;
  });
});
