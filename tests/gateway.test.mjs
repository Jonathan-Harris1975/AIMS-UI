import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  cogniPalWebhookSignature,
  consoleTargetPath,
  createSessionToken,
  createHiveHandoffToken,
  delegatedIdentitySignature,
  isAllowedOrigin,
  verifySessionToken,
  verifyHiveHandoffToken,
} from "../workers/gateway/index.js";

test("delegated identity signature matches AIMS Node implementation", async () => {
  const input = { method: "PATCH", path: "/comms-hub/conversations/cnv-1/status", timestamp: "1785888000000", actor: "reviewer@example.com", role: "reviewer" };
  const secret = "test-delegation-secret";
  const expected = createHmac("sha256", secret).update([input.method, input.path, input.timestamp, input.actor, input.role].join("\n")).digest("hex");
  assert.equal(await delegatedIdentitySignature(input, secret), expected);
});

test("CogniPal webhook signature covers timestamp, nonce and exact body", async () => {
  const input = { timestamp: "1785888000000", nonce: "nonce-123456", rawBody: '{"message":"hello"}' };
  const secret = "test-webhook-secret";
  const expected = createHmac("sha256", secret).update(`${input.timestamp}.${input.nonce}.${input.rawBody}`).digest("hex");
  assert.equal(await cogniPalWebhookSignature(input, secret), expected);
});

test("session token is scoped and expires", async () => {
  const secret = "test-session-secret";
  const payload = { sid: "session-1", vid: "visitor-1", site: "example.test", exp: 2_000_000_000 };
  const token = await createSessionToken(payload, secret);
  assert.deepEqual(await verifySessionToken(token, secret, { now: 1_900_000_000_000 }), payload);
  assert.equal(await verifySessionToken(token, secret, { now: 2_100_000_000_000 }), null);
  assert.equal(await verifySessionToken(`${token}x`, secret, { now: 1_900_000_000_000 }), null);
});

test("origin allowlist is exact rather than suffix based", () => {
  assert.equal(isAllowedOrigin("https://jonathan-harris.online", "https://jonathan-harris.online", "https://gateway.test"), true);
  assert.equal(isAllowedOrigin("https://jonathan-harris.online.attacker.test", "https://jonathan-harris.online", "https://gateway.test"), false);
});

test("console proxy blocks intake and traversal paths", () => {
  assert.equal(consoleTargetPath("/console/api/queue"), "/comms-hub/queue");
  assert.equal(consoleTargetPath("/console/api/intake/chat"), null);
  assert.equal(consoleTargetPath("/console/api/../intake/chat"), null);
});


test("HIVE communications handoff is short-lived and audience scoped", async () => {
  const secret = "test-hive-handoff-secret";
  const now = 1_900_000_000_000;
  const token = await createHiveHandoffToken({ actor: "hive-owner", role: "admin", ttlSeconds: 300, now }, secret);
  assert.deepEqual(await verifyHiveHandoffToken(token, secret, { now: now + 60_000 }), { actor: "hive-owner", role: "admin" });
  assert.equal(await verifyHiveHandoffToken(token, secret, { now: now + 301_000 }), null);
  assert.equal(await verifyHiveHandoffToken(`${token}x`, secret, { now: now + 60_000 }), null);
});
