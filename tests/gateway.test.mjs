import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import gateway, {
  cogniPalWebhookSignature,
  consoleTargetPath,
  createSessionToken,
  createHiveHandoffToken,
  delegatedIdentitySignature,
  gatewayConfigurationStatus,
  isAllowedOrigin,
  isCogniPalIntakePath,
  proxyCogniPalIntake,
  requireConsoleOrigin,
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


test("console origin accepts same-origin GET Referer when Origin is absent", async () => {
  const request = new Request("https://chat.jonathan-harris.online/console/api/ui/bootstrap", {
    method: "GET",
    headers: { referer: "https://chat.jonathan-harris.online/console/" },
  });
  assert.equal(
    await requireConsoleOrigin(request, { CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online" }),
    "https://chat.jonathan-harris.online",
  );
});

test("console origin accepts browser same-origin GET when Origin and Referer are absent", async () => {
  const request = new Request("https://chat.jonathan-harris.online/console/api/ui/bootstrap", {
    method: "GET",
    headers: { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" },
  });
  assert.equal(
    await requireConsoleOrigin(request, { CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online" }),
    "https://chat.jonathan-harris.online",
  );
});

test("console origin does not trust cross-site Sec-Fetch-Site without Origin", async () => {
  const request = new Request("https://chat.jonathan-harris.online/console/api/ui/bootstrap", {
    method: "GET",
    headers: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" },
  });
  await assert.rejects(
    () => requireConsoleOrigin(request, { CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online" }),
    { code: "origin_denied" },
  );
});

test("console origin rejects lookalike Referer and does not use Referer fallback for mutations", async () => {
  const env = { CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online" };
  const lookalike = new Request("https://chat.jonathan-harris.online/console/api/ui/bootstrap", {
    method: "GET",
    headers: { referer: "https://chat.jonathan-harris.online.attacker.test/console/" },
  });
  await assert.rejects(() => requireConsoleOrigin(lookalike, env), { code: "origin_denied" });

  const mutation = new Request("https://chat.jonathan-harris.online/console/api/queue", {
    method: "POST",
    headers: { referer: "https://chat.jonathan-harris.online/console/" },
  });
  await assert.rejects(() => requireConsoleOrigin(mutation, env), { code: "origin_denied" });
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


test("gateway configuration status uses the production DB binding name", () => {
  const fakeDb = { prepare() {} };
  const fakeAssets = { fetch() {} };
  assert.deepEqual(gatewayConfigurationStatus({
    AIMS_API_BASE_URL: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app",
    AIMS_API_KEY: "api-key",
    COMMS_HUB_RBAC_DELEGATION_SECRET: "delegation-secret",
    HIVE_COMMS_HANDOFF_SECRET: "handoff-secret",
    DB: fakeDb,
    ASSETS: fakeAssets,
  }), {
    aimsApiBaseUrl: true,
    aimsApiKey: true,
    delegationSecret: true,
    hiveHandoffSecret: true,
    d1: true,
    assets: true,
  });

  assert.equal(gatewayConfigurationStatus({ CHAT_DB: fakeDb }).d1, false);
});

test("CogniPal first-party intake paths are explicit POST-only gateway routes", () => {
  assert.equal(isCogniPalIntakePath("/comms-hub/intake/chat", "POST"), true);
  assert.equal(isCogniPalIntakePath("/comms-hub/intake/chat/sync", "POST"), true);
  assert.equal(isCogniPalIntakePath("/comms-hub/intake/chat", "GET"), false);
  assert.equal(isCogniPalIntakePath("/comms-hub/intake/chat/other", "POST"), false);
});

test("CogniPal intake proxy preserves the exact signed body and HMAC headers", async () => {
  const rawBody = '{"sessionId":"session-123","visitorId":"visitor-123","websiteId":"jonathan-harris.online"}';
  const request = new Request("https://chat.jonathan-harris.online/comms-hub/intake/chat/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-coginpal-timestamp": "1786882265635",
      "x-coginpal-nonce": "nonce-12345678",
      "x-coginpal-signature": "sha256=abc123",
      "user-agent": "jonathan-harris-website-cognipal/1.1",
    },
    body: rawBody,
  });
  let seen = null;
  const response = await proxyCogniPalIntake(
    request,
    { AIMS_API_BASE_URL: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app" },
    new URL(request.url),
    async (target, init) => {
      seen = {
        target,
        method: init.method,
        body: new TextDecoder().decode(init.body),
        timestamp: init.headers.get("x-coginpal-timestamp"),
        nonce: init.headers.get("x-coginpal-nonce"),
        signature: init.headers.get("x-coginpal-signature"),
      };
      return new Response(JSON.stringify({ ok: true, messages: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.deepEqual(seen, {
    target: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/comms-hub/intake/chat/sync",
    method: "POST",
    body: rawBody,
    timestamp: "1786882265635",
    nonce: "nonce-12345678",
    signature: "sha256=abc123",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, messages: [] });
});


test("HIVE handoff is exchanged for an HttpOnly host-only console cookie", async () => {
  const secret = "test-hive-handoff-secret";
  const token = await createHiveHandoffToken({ actor: "hive-owner", role: "operator", ttlSeconds: 300 }, secret);
  const response = await gateway.fetch(new Request("https://chat.jonathan-harris.online/console/api/auth/handoff", {
    method: "POST",
    headers: {
      origin: "https://chat.jonathan-harris.online",
      authorization: `Bearer ${token}`,
    },
  }), {
    HIVE_COMMS_HANDOFF_SECRET: secret,
    CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online",
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie") || "";
  assert.match(cookie, /__Host-aims_console_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(cookie.includes("Domain="), false);
});


test("HIVE handoff remains compatible with the existing identity verifier when no shared secret is configured", async () => {
  const originalFetch = globalThis.fetch;
  const token = "legacy-handoff-token";
  let seenAuthorization = "";
  globalThis.fetch = async (target, init = {}) => {
    assert.equal(String(target), "https://hive.jonathan-harris.online/api/auth/comms-identity");
    seenAuthorization = new Headers(init.headers).get("authorization") || "";
    return new Response(JSON.stringify({ actor: "hive-owner", role: "operator" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const response = await gateway.fetch(new Request("https://chat.jonathan-harris.online/console/api/auth/handoff", {
      method: "POST",
      headers: {
        origin: "https://chat.jonathan-harris.online",
        authorization: `Bearer ${token}`,
      },
    }), {
      HIVE_IDENTITY_VERIFY_METHOD: "GET",
      CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online",
    });
    assert.equal(response.status, 200);
    assert.equal(seenAuthorization, `Bearer ${token}`);
    assert.match(response.headers.get("set-cookie") || "", /__Host-aims_console_session=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy identity verification receives the HttpOnly cookie token as a Bearer credential", async () => {
  const originalFetch = globalThis.fetch;
  const token = "legacy-handoff-token";
  let identityAuthorization = "";
  globalThis.fetch = async (target, init = {}) => {
    const url = String(target);
    if (url === "https://hive.jonathan-harris.online/api/auth/comms-identity") {
      identityAuthorization = new Headers(init.headers).get("authorization") || "";
      return new Response(JSON.stringify({ actor: "hive-owner", role: "operator" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    assert.equal(url, "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app/comms-hub/ui/bootstrap");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await gateway.fetch(new Request("https://chat.jonathan-harris.online/console/api/ui/bootstrap", {
      method: "GET",
      headers: {
        referer: "https://chat.jonathan-harris.online/console/",
        cookie: `__Host-aims_console_session=${encodeURIComponent(token)}`,
      },
    }), {
      ENVIRONMENT: "production",
      AIMS_API_BASE_URL: "https://zeroth-kara-jonathanharris-3296ed37.koyeb.app",
      AIMS_API_KEY: "aims-api-key",
      COMMS_HUB_RBAC_DELEGATION_SECRET: "delegation-secret",
      HIVE_IDENTITY_VERIFY_METHOD: "GET",
      CONSOLE_ALLOWED_ORIGINS: "https://chat.jonathan-harris.online",
    });
    assert.equal(response.status, 200);
    assert.equal(identityAuthorization, `Bearer ${token}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("console HTML receives a restrictive CSP", async () => {
  const response = await gateway.fetch(new Request("https://chat.jonathan-harris.online/console/"), {
    ASSETS: { fetch: async () => new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } }) },
  });
  const csp = response.headers.get("content-security-policy") || "";
  assert.match(csp, /script-src 'self'(?:;|$)/);
  assert.doesNotMatch(csp, /'unsafe-inline'[^;]*;?\s*script-src|script-src[^;]*'unsafe-inline'/);
  assert.match(csp, /script-src-attr 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
});
