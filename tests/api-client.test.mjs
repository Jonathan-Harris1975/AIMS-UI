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


test("client downloads binary attachments with the console handoff token", async () => {
  let captured;
  const client = new AimsCommsClient({
    baseUrl: "/console/api",
    tokenProvider: () => "handoff-token",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(new Blob(["hello"], { type: "text/plain" }), {
        status: 200,
        headers: {
          "content-type": "text/plain",
          "content-disposition": 'attachment; filename="test.txt"',
        },
      });
    },
  });
  const result = await client.downloadAttachment("att_test");
  assert.equal(captured.url, "/console/api/attachments/att_test");
  assert.equal(captured.options.headers.get("authorization"), "Bearer handoff-token");
  assert.equal(result.filename, "test.txt");
  assert.equal(await result.blob.text(), "hello");
});


test("client exposes social status, setup and action endpoints", async () => {
  const calls = [];
  const client = new AimsCommsClient({
    baseUrl: "https://example.test/comms-hub",
    fetchImpl: async (url, options) => {
      calls.push([String(url), options.method, options.body ? JSON.parse(options.body) : null]);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await client.socialStatus();
  await client.reconcileSocialWebhooks();
  await client.drainSocialPoll(10);
  await client.socialAction("cnv-1", "reply", { message: "hello" });
  await client.requestSocialApproval("cnv-1", "delete", {});
  assert.match(calls[0][0], /\/social\/status$/);
  assert.match(calls[1][0], /\/social\/webhooks\/reconcile-all$/);
  assert.deepEqual(calls[2][2], { limit: 10 });
  assert.match(calls[3][0], /\/social\/conversations\/cnv-1\/actions\/reply$/);
  assert.match(calls[4][0], /\/social\/conversations\/cnv-1\/approvals\/delete$/);
});


test("social action can reuse the approval idempotency key for scoped execution", async () => {
  let captured;
  const client = new AimsCommsClient({
    baseUrl: "https://example.test/comms-hub",
    fetchImpl: async (_url, options) => {
      captured = options;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await client.socialAction("cnv-1", "delete", { approvalId: "apr-1" }, { idempotencyKey: "approval-action-123" });
  assert.equal(captured.headers.get("idempotency-key"), "approval-action-123");
});
