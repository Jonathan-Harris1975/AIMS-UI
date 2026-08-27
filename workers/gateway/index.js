import { AIMS_UI_BUILD_BRANCH, AIMS_UI_BUILD_SHA } from "./build-meta.js";

const encoder = new TextEncoder();
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_MESSAGE_LENGTH = 4000;
const WIDGET_RATE_LIMIT_PER_MINUTE = 12;
const CONSOLE_SESSION_COOKIE_NAME = "__Host-aims_console_session";
const CONSOLE_SESSION_MAX_AGE_SECONDS = 600;
const ALLOWED_ROLES = new Set(["admin", "reviewer", "operator", "read_only"]);

function json(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function normalise(value) {
  return String(value ?? "").trim();
}

function baseUrl(value) {
  return normalise(value).replace(/\/+$/, "");
}

export function isCogniPalIntakePath(pathname, method = "POST") {
  if (String(method || "").toUpperCase() !== "POST") return false;
  const path = String(pathname || "").replace(/\/+$/, "").toLowerCase();
  return path === "/comms-hub/intake/chat" || path === "/comms-hub/intake/chat/sync";
}

function forwardedCogniPalHeaders(request) {
  const headers = new Headers();
  for (const name of [
    "accept",
    "content-type",
    "user-agent",
    "x-coginpal-timestamp",
    "x-coginpal-nonce",
    "x-coginpal-signature",
    "x-request-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("x-aims-ui-proxy", "cognipal-intake");
  return headers;
}

export async function proxyCogniPalIntake(request, env, url = new URL(request.url), fetchImpl = fetch) {
  if (!isCogniPalIntakePath(url.pathname, request.method)) {
    throw Object.assign(new Error("CogniPal intake proxy path is invalid."), { status: 404, code: "not_found" });
  }
  const upstreamBase = baseUrl(env?.AIMS_API_BASE_URL);
  if (!upstreamBase) throw configurationError("aims_api_base_url_unconfigured", "AIMS_API_BASE_URL is not configured.");

  for (const name of ["x-coginpal-timestamp", "x-coginpal-nonce", "x-coginpal-signature"]) {
    if (!normalise(request.headers.get(name))) {
      throw Object.assign(new Error("CogniPal signature headers are required."), { status: 401, code: "cognipal_signature_headers_missing" });
    }
  }
  const target = `${upstreamBase}${url.pathname}`;
  const rawBody = await request.arrayBuffer();
  const startedAt = Date.now();
  let response;
  try {
    response = await fetchImpl(target, {
      method: "POST",
      headers: forwardedCogniPalHeaders(request),
      body: rawBody,
      redirect: "manual",
    });
  } catch (error) {
    console.error("aimsUiGateway.cogniPalProxyFailed", {
      path: url.pathname,
      targetHost: new URL(upstreamBase).host,
      durationMs: Date.now() - startedAt,
      error: error?.message || String(error),
    });
    throw Object.assign(new Error("AIMS CogniPal intake is temporarily unreachable."), { status: 502, code: "cognipal_upstream_unreachable" });
  }

  console.info("aimsUiGateway.cogniPalProxy", {
    path: url.pathname,
    targetHost: new URL(upstreamBase).host,
    upstreamStatus: response.status,
    durationMs: Date.now() - startedAt,
  });

  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function configurationError(code, message) {
  return Object.assign(new Error(message), { status: 503, code });
}

function requireD1(env) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    throw configurationError("d1_binding_unconfigured", "Cloudflare D1 binding DB is not configured.");
  }
  return env.DB;
}

const CORE_READINESS_KEYS = Object.freeze([
  "aimsApiBaseUrl",
  "aimsApiKey",
  "delegationSecret",
  "consoleAllowedOrigins",
  "assets",
]);

export function gatewayConfigurationStatus(env = {}) {
  const status = {
    aimsApiBaseUrl: Boolean(baseUrl(env.AIMS_API_BASE_URL)),
    aimsApiKey: Boolean(normalise(env.AIMS_API_KEY)),
    delegationSecret: Boolean(normalise(env.COMMS_HUB_RBAC_DELEGATION_SECRET)),
    hiveHandoffSecret: Boolean(normalise(env.HIVE_COMMS_HANDOFF_SECRET)),
    chatSessionSecret: Boolean(normalise(env.CHAT_SESSION_SECRET)),
    cogniPalWebhookSecret: Boolean(normalise(env.COGNIPAL_WEBHOOK_SECRET)),
    cogniPalApiKey: Boolean(normalise(env.COGNIPAL_API_KEY)),
    consoleAllowedOrigins: parseCsv(env.CONSOLE_ALLOWED_ORIGINS).length > 0,
    widgetAllowedOrigins: parseCsv(env.WIDGET_ALLOWED_ORIGINS).length > 0,
    widgetAllowedSiteIds: parseCsv(env.WIDGET_ALLOWED_SITE_IDS).length > 0,
    d1: Boolean(env.DB && typeof env.DB.prepare === "function"),
    assets: Boolean(env.ASSETS && typeof env.ASSETS.fetch === "function"),
  };
  // Readiness represents the production operator console and secure AIMS proxy.
  // Widget-session/provider compatibility routes are optional capabilities: the
  // public website uses the first-party signed intake proxy, so their secrets
  // must not make the AIMS operator UI appear degraded when those routes are
  // intentionally unused. Their booleans remain visible for diagnostics.
  status.ready = CORE_READINESS_KEYS.every((key) => status[key] === true);
  return status;
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function addSeconds(iso, seconds) {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseCsv(value) {
  return normalise(value).split(",").map((item) => item.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin, allowlist, requestUrl = "") {
  if (!origin) return false;
  let parsed;
  try { parsed = new URL(origin).origin; } catch { return false; }
  const configured = Array.isArray(allowlist) ? allowlist : parseCsv(allowlist);
  if (configured.includes("*")) return true;
  if (configured.includes(parsed)) return true;
  try { return parsed === new URL(requestUrl).origin; } catch { return false; }
}

function corsHeaders(origin, { credentials = false } = {}) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,idempotency-key,x-request-id",
    "access-control-max-age": "86400",
    ...(credentials ? { "access-control-allow-credentials": "true" } : {}),
    vary: "Origin",
  };
}

function withCors(response, origin, options = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin, options))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = String(value).replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret) {
  if (!normalise(secret)) throw new Error("HMAC secret is not configured.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmacHex(secret, text) {
  const signature = await crypto.subtle.sign("HMAC", await importHmacKey(secret), encoder.encode(text));
  return bytesToHex(signature);
}

async function hmacBase64Url(secret, text) {
  const signature = await crypto.subtle.sign("HMAC", await importHmacKey(secret), encoder.encode(text));
  return base64UrlEncode(signature);
}

export async function delegatedIdentitySignature({ method, path, timestamp, actor, role }, secret) {
  return hmacHex(secret, [String(method || "GET").toUpperCase(), path, timestamp, actor, role].join("\n"));
}

export async function cogniPalWebhookSignature({ timestamp, nonce, rawBody }, secret) {
  return hmacHex(secret, `${timestamp}.${nonce}.${rawBody}`);
}

export async function createSessionToken(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await hmacBase64Url(secret, body)}`;
}

export async function verifySessionToken(token, secret, { now = Date.now() } = {}) {
  try {
    const [body, signature, extra] = normalise(token).split(".");
    if (!body || !signature || extra) return null;
    const suppliedBytes = base64UrlDecode(signature);
    const valid = await crypto.subtle.verify("HMAC", await importHmacKey(secret), suppliedBytes, encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (!payload?.sid || !payload?.vid || !payload?.site || !Number.isFinite(payload?.exp)) return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createHiveHandoffToken({ actor, role, ttlSeconds = 300, now = Date.now() }, secret) {
  const issuedAt = Math.floor(now / 1000);
  const boundedTtl = Math.min(600, Math.max(60, Number(ttlSeconds) || 300));
  const payload = { v: 1, iat: issuedAt, exp: issuedAt + boundedTtl, actor: normalise(actor).slice(0, 200), role: normalise(role).toLowerCase(), aud: "aims-comms" };
  if (!payload.actor || !ALLOWED_ROLES.has(payload.role)) throw new Error("Invalid HIVE handoff identity.");
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await hmacBase64Url(secret, body)}`;
}

export async function verifyHiveHandoffToken(token, secret, { now = Date.now() } = {}) {
  try {
    if (!normalise(secret) || normalise(token).length > 4096) return null;
    const [body, signature, extra] = normalise(token).split(".");
    if (!body || !signature || extra) return null;
    const suppliedBytes = base64UrlDecode(signature);
    const valid = await crypto.subtle.verify("HMAC", await importHmacKey(secret), suppliedBytes, encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
    if (payload?.v !== 1 || payload?.aud !== "aims-comms" || !payload?.actor || !ALLOWED_ROLES.has(normalise(payload?.role).toLowerCase())) return null;
    if (!Number.isFinite(payload?.iat) || !Number.isFinite(payload?.exp)) return null;
    const nowSeconds = Math.floor(now / 1000);
    if (payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds || payload.exp - payload.iat > 600) return null;
    return { actor: normalise(payload.actor).slice(0, 200), role: normalise(payload.role).toLowerCase() };
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function consoleSessionCookie(token, maxAge = CONSOLE_SESSION_MAX_AGE_SECONDS) {
  const bounded = Math.max(1, Math.min(CONSOLE_SESSION_MAX_AGE_SECONDS, Number(maxAge) || CONSOLE_SESSION_MAX_AGE_SECONDS));
  return `${CONSOLE_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${bounded}; HttpOnly; Secure; SameSite=Strict`;
}

function clearConsoleSessionCookie() {
  return `${CONSOLE_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function bearerToken(request) {
  return normalise(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
}

function cleanMessage(value) {
  const message = normalise(value);
  if (!message) throw Object.assign(new Error("A message is required."), { status: 400, code: "message_required" });
  if (message.length > MAX_MESSAGE_LENGTH) throw Object.assign(new Error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`), { status: 413, code: "message_too_long" });
  return message;
}

function validateSiteId(value) {
  const siteId = normalise(value).toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{2,190}$/.test(siteId)) throw Object.assign(new Error("Website identifier is invalid."), { status: 400, code: "site_id_invalid" });
  return siteId;
}

async function readJson(request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("object required");
    return payload;
  } catch {
    throw Object.assign(new Error("Request body must be a JSON object."), { status: 400, code: "json_invalid" });
  }
}

async function requireWidgetOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (!isAllowedOrigin(origin, env.WIDGET_ALLOWED_ORIGINS, request.url)) {
    throw Object.assign(new Error("This website is not allowed to open CogniPal sessions."), { status: 403, code: "origin_denied" });
  }
  return origin;
}

export async function requireConsoleOrigin(request, env) {
  const explicitOrigin = normalise(request.headers.get("origin"));
  if (explicitOrigin) {
    if (!isAllowedOrigin(explicitOrigin, env.CONSOLE_ALLOWED_ORIGINS, request.url)) {
      throw Object.assign(new Error("This console origin is not allowed."), { status: 403, code: "origin_denied" });
    }
    return new URL(explicitOrigin).origin;
  }

  // Browsers do not consistently send Origin on same-origin GET/HEAD requests.
  // Prefer Referer when it exists, but embedded console documents may use a
  // restrictive referrer policy. In that case Sec-Fetch-Site gives us a
  // browser-controlled same-origin signal. We still require the request URL's
  // exact origin to be present in the configured console allowlist.
  if (["GET", "HEAD"].includes(request.method)) {
    const referer = normalise(request.headers.get("referer"));
    if (referer) {
      let refererOrigin = "";
      try { refererOrigin = new URL(referer).origin; } catch { refererOrigin = ""; }
      if (refererOrigin && isAllowedOrigin(refererOrigin, env.CONSOLE_ALLOWED_ORIGINS, request.url)) {
        return refererOrigin;
      }
    }

    const fetchSite = normalise(request.headers.get("sec-fetch-site")).toLowerCase();
    if (fetchSite === "same-origin") {
      const requestOrigin = new URL(request.url).origin;
      if (isAllowedOrigin(requestOrigin, env.CONSOLE_ALLOWED_ORIGINS, request.url)) {
        return requestOrigin;
      }
    }
  }

  throw Object.assign(new Error("This console origin is not allowed."), { status: 403, code: "origin_denied" });
}

async function requireSession(request, env, sessionId) {
  const tokenPayload = await verifySessionToken(bearerToken(request), env.CHAT_SESSION_SECRET);
  if (!tokenPayload || tokenPayload.sid !== sessionId) {
    throw Object.assign(new Error("Conversation session is invalid or expired."), { status: 401, code: "session_invalid" });
  }
  const row = await requireD1(env).prepare(
    "SELECT id, visitor_id, site_id, origin, mode, status, expires_at FROM chat_sessions WHERE id = ?1 LIMIT 1"
  ).bind(sessionId).first();
  if (!row || row.visitor_id !== tokenPayload.vid || row.site_id !== tokenPayload.site || Date.parse(row.expires_at) <= Date.now()) {
    throw Object.assign(new Error("Conversation session is invalid or expired."), { status: 401, code: "session_invalid" });
  }
  return { token: tokenPayload, row };
}

async function enforceRateLimit(env, sessionId) {
  const threshold = new Date(Date.now() - 60_000).toISOString();
  const row = await requireD1(env).prepare(
    "SELECT COUNT(*) AS total FROM chat_messages WHERE session_id = ?1 AND role = 'visitor' AND created_at >= ?2"
  ).bind(sessionId, threshold).first();
  if (Number(row?.total || 0) >= WIDGET_RATE_LIMIT_PER_MINUTE) {
    throw Object.assign(new Error("Too many messages were sent. Please pause briefly."), { status: 429, code: "rate_limited" });
  }
}

async function createWidgetSession(request, env) {
  const origin = await requireWidgetOrigin(request, env);
  const payload = await readJson(request);
  const siteId = validateSiteId(payload.siteId);
  const allowedSites = parseCsv(env.WIDGET_ALLOWED_SITE_IDS);
  if (allowedSites.length && !allowedSites.includes(siteId)) {
    throw Object.assign(new Error("This website identifier is not configured."), { status: 403, code: "site_denied" });
  }
  const createdAt = nowIso();
  const expiresAt = addSeconds(createdAt, SESSION_TTL_SECONDS);
  const sessionId = randomId("cps");
  const visitorId = randomId("cpv");
  await requireD1(env).prepare(
    `INSERT INTO chat_sessions (id, visitor_id, site_id, origin, mode, status, page_url, referrer, created_at, updated_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, 'automation', 'open', ?5, ?6, ?7, ?7, ?8)`
  ).bind(sessionId, visitorId, siteId, origin, normalise(payload.pageUrl).slice(0, 2000), normalise(payload.referrer).slice(0, 2000), createdAt, expiresAt).run();
  const token = await createSessionToken({ sid: sessionId, vid: visitorId, site: siteId, exp: Math.floor(Date.parse(expiresAt) / 1000) }, env.CHAT_SESSION_SECRET);
  return withCors(json({ sessionId, visitorId, token, expiresAt }), origin);
}

async function listWidgetMessages(request, env, sessionId) {
  const origin = await requireWidgetOrigin(request, env);
  const session = await requireSession(request, env, sessionId);
  if (session.row.origin !== origin) throw Object.assign(new Error("Conversation origin does not match this session."), { status: 403, code: "origin_mismatch" });
  const result = await requireD1(env).prepare(
    `SELECT id, role, text, created_at AS createdAt, delivery_status AS status
     FROM chat_messages WHERE session_id = ?1 ORDER BY created_at ASC, id ASC LIMIT 500`
  ).bind(sessionId).all();
  return withCors(json({ messages: result.results || [], mode: session.row.mode, status: session.row.status }), origin);
}

async function relayVisitorMessage(request, env, sessionId) {
  const origin = await requireWidgetOrigin(request, env);
  const session = await requireSession(request, env, sessionId);
  if (session.row.origin !== origin) throw Object.assign(new Error("Conversation origin does not match this session."), { status: 403, code: "origin_mismatch" });
  if (session.row.status !== "open") throw Object.assign(new Error("This conversation has ended."), { status: 409, code: "session_closed" });
  await enforceRateLimit(env, sessionId);
  const payload = await readJson(request);
  const message = cleanMessage(payload.message);
  const clientMessageId = normalise(payload.clientMessageId || request.headers.get("idempotency-key"));
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(clientMessageId)) {
    throw Object.assign(new Error("A valid client message identifier is required."), { status: 400, code: "client_message_id_invalid" });
  }
  const existing = await requireD1(env).prepare(
    "SELECT id, delivery_status AS status FROM chat_messages WHERE id = ?1 AND session_id = ?2 LIMIT 1"
  ).bind(clientMessageId, sessionId).first();
  if (existing?.status === "accepted") return withCors(json({ ok: true, accepted: true, duplicate: true, messageId: existing.id }), origin);
  const occurredAt = nowIso();
  if (!existing) {
    await requireD1(env).prepare(
      `INSERT INTO chat_messages (id, session_id, role, text, created_at, delivery_status)
       VALUES (?1, ?2, 'visitor', ?3, ?4, 'pending')`
    ).bind(clientMessageId, sessionId, message, occurredAt).run();
  } else {
    await requireD1(env).prepare("UPDATE chat_messages SET text = ?1, delivery_status = 'pending', error_code = NULL WHERE id = ?2 AND session_id = ?3")
      .bind(message, clientMessageId, sessionId).run();
  }
  const webhook = JSON.stringify({
    sessionId,
    visitorId: session.row.visitor_id,
    websiteId: session.row.site_id,
    occurredAt,
    message: { id: clientMessageId, text: message },
  });
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = await cogniPalWebhookSignature({ timestamp, nonce, rawBody: webhook }, env.COGNIPAL_WEBHOOK_SECRET);
  let response;
  try {
    response = await fetch(`${baseUrl(env.AIMS_API_BASE_URL)}/comms-hub/intake/chat`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-coginpal-signature": `sha256=${signature}`,
        "x-coginpal-timestamp": timestamp,
        "x-coginpal-nonce": nonce,
        "x-request-id": clientMessageId,
      },
      body: webhook,
    });
    const responsePayload = await response.json().catch(() => null);
    if (!response.ok) {
      const code = normalise(responsePayload?.error || `aims_${response.status}`);
      await requireD1(env).prepare("UPDATE chat_messages SET delivery_status = 'failed', error_code = ?1 WHERE id = ?2")
        .bind(code, clientMessageId).run();
      return withCors(json({ error: code, message: responsePayload?.message || "AIMS did not accept this message." }, { status: response.status >= 500 ? 502 : response.status }), origin);
    }
    await requireD1(env).batch([
      requireD1(env).prepare("UPDATE chat_messages SET delivery_status = 'accepted', error_code = NULL WHERE id = ?1").bind(clientMessageId),
      requireD1(env).prepare("UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2").bind(occurredAt, sessionId),
    ]);
    return withCors(json({ ok: true, accepted: true, duplicate: Boolean(responsePayload?.duplicate), messageId: clientMessageId }, { status: 202 }), origin);
  } catch {
    await requireD1(env).prepare("UPDATE chat_messages SET delivery_status = 'failed', error_code = 'aims_unreachable' WHERE id = ?1")
      .bind(clientMessageId).run();
    return withCors(json({ error: "aims_unreachable", message: "CogniPal could not reach AIMS." }, { status: 502 }), origin);
  }
}

async function providerSend(request, env, sessionId) {
  if (!env.COGNIPAL_API_KEY || bearerToken(request) !== env.COGNIPAL_API_KEY) {
    return json({ error: "provider_unauthorised", message: "Provider credentials are invalid." }, { status: 401 });
  }
  const session = await requireD1(env).prepare("SELECT id, status FROM chat_sessions WHERE id = ?1 LIMIT 1").bind(sessionId).first();
  if (!session) return json({ error: "session_not_found", message: "Chat session was not found." }, { status: 404 });
  if (session.status !== "open") return json({ error: "session_closed", message: "Chat session is closed." }, { status: 409 });
  const payload = await readJson(request);
  const message = cleanMessage(payload.message);
  const idempotencyKey = normalise(request.headers.get("idempotency-key"));
  if (!/^[A-Za-z0-9_.:-]{8,200}$/.test(idempotencyKey)) {
    return json({ error: "idempotency_key_invalid", message: "A valid Idempotency-Key is required." }, { status: 400 });
  }
  const messageId = `aims_${sessionId}_${idempotencyKey}`.slice(0, 240);
  const role = payload.role === "operator" ? "operator" : "assistant";
  const createdAt = nowIso();
  const insert = await requireD1(env).prepare(
    `INSERT OR IGNORE INTO chat_messages (id, session_id, role, text, created_at, delivery_status, provider_message_id)
     VALUES (?1, ?2, ?3, ?4, ?5, 'delivered', ?6)`
  ).bind(messageId, sessionId, role, message, createdAt, `${sessionId}:${idempotencyKey}`).run();
  await requireD1(env).prepare("UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2").bind(createdAt, sessionId).run();
  return json({ ok: true, id: messageId, messageId, sessionId, duplicate: Number(insert.meta?.changes || 0) === 0 }, { status: 202 });
}

async function providerSetMode(request, env, sessionId) {
  if (!env.COGNIPAL_API_KEY || bearerToken(request) !== env.COGNIPAL_API_KEY) {
    return json({ error: "provider_unauthorised", message: "Provider credentials are invalid." }, { status: 401 });
  }
  const payload = await readJson(request);
  const mode = normalise(payload.mode);
  if (!new Set(["automation", "takeover_requested", "human", "closed"]).has(mode)) {
    return json({ error: "mode_invalid", message: "Chat mode is invalid." }, { status: 400 });
  }
  const updatedAt = nowIso();
  const update = await requireD1(env).prepare(
    "UPDATE chat_sessions SET mode = ?1, status = CASE WHEN ?1 = 'closed' THEN 'closed' ELSE status END, updated_at = ?2 WHERE id = ?3"
  ).bind(mode, updatedAt, sessionId).run();
  if (!Number(update.meta?.changes || 0)) return json({ error: "session_not_found", message: "Chat session was not found." }, { status: 404 });
  return json({ ok: true, sessionId, mode });
}

async function exchangeHiveHandoff(request, env) {
  const origin = await requireConsoleOrigin(request, env);
  if (request.method !== "POST") {
    return withCors(json({ error: "method_not_allowed", message: "Use POST to establish a console session." }, { status: 405, headers: { allow: "POST" } }), origin, { credentials: true });
  }
  const token = bearerToken(request);
  if (!token) {
    return withCors(json({ error: "hive_handoff_invalid", message: "HIVE handoff token is missing or invalid." }, { status: 401, headers: { "set-cookie": clearConsoleSessionCookie() } }), origin, { credentials: true });
  }

  // Preserve the pre-hardening deployment contract: verify locally when the
  // shared handoff secret exists, otherwise use the configured HIVE identity
  // verifier. The browser still exchanges the handoff for an HttpOnly cookie.
  const identity = await verifyHiveIdentity(request, env);
  const encodedBody = token.split(".")[0];
  let maxAge = CONSOLE_SESSION_MAX_AGE_SECONDS;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedBody)));
    if (Number.isFinite(Number(payload.exp))) {
      maxAge = Math.max(1, Math.min(CONSOLE_SESSION_MAX_AGE_SECONDS, Number(payload.exp) - Math.floor(Date.now() / 1000)));
    }
  } catch {}
  return withCors(json({ ok: true, authenticated: true, actor: identity.actor, role: identity.role }, {
    headers: { "set-cookie": consoleSessionCookie(token, maxAge) },
  }), origin, { credentials: true });
}

async function verifyHiveIdentity(request, env) {
  if (normalise(env.ENVIRONMENT).toLowerCase() !== "production" && env.DEV_CONSOLE_ACTOR) {
    const role = ALLOWED_ROLES.has(env.DEV_CONSOLE_ROLE) ? env.DEV_CONSOLE_ROLE : "admin";
    return { actor: env.DEV_CONSOLE_ACTOR, role };
  }

  const token = bearerToken(request) || readCookie(request, CONSOLE_SESSION_COOKIE_NAME);
  let localHandoffRejected = false;
  if (token && normalise(env.HIVE_COMMS_HANDOFF_SECRET)) {
    const identity = await verifyHiveHandoffToken(token, env.HIVE_COMMS_HANDOFF_SECRET);
    if (identity) return identity;
    localHandoffRejected = true;
  }

  // Backwards-compatible verifier path. When the handoff has already been
  // exchanged for an HttpOnly AIMS cookie, convert that cookie-held token back
  // into the Bearer form expected by the existing HIVE identity endpoint.
  const identityVerifyUrl = normalise(env.HIVE_IDENTITY_VERIFY_URL) || "https://hive.jonathan-harris.online/api/auth/comms-identity";
  if (identityVerifyUrl) {
    const method = normalise(env.HIVE_IDENTITY_VERIFY_METHOD || "GET").toUpperCase();
    const headers = new Headers({ accept: "application/json" });
    const originalAuthorization = request.headers.get("authorization");
    if (originalAuthorization) headers.set("authorization", originalAuthorization);
    else if (token) headers.set("authorization", `Bearer ${token}`);
    const accessAssertion = request.headers.get("cf-access-jwt-assertion");
    if (accessAssertion) headers.set("cf-access-jwt-assertion", accessAssertion);

    const response = await fetch(identityVerifyUrl, { method, headers, redirect: "manual" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error("HIVE session is not authorised."), { status: 401, code: "hive_identity_invalid" });
    const identity = payload?.identity || payload?.user || payload;
    const actor = normalise(identity?.actor || identity?.email || identity?.id).slice(0, 200);
    const role = normalise(identity?.role).toLowerCase();
    if (!actor || !ALLOWED_ROLES.has(role)) throw Object.assign(new Error("HIVE identity response is incomplete."), { status: 502, code: "hive_identity_response_invalid" });
    return { actor, role };
  }

  if (localHandoffRejected) {
    throw Object.assign(new Error("HIVE handoff token is invalid or expired."), { status: 401, code: "hive_handoff_invalid" });
  }
  throw Object.assign(new Error("HIVE communications handoff is not configured."), { status: 503, code: "hive_identity_unconfigured" });
}

export function consoleTargetPath(pathname) {
  const rest = pathname.slice("/console/api".length) || "/";
  if (!rest.startsWith("/") || rest.startsWith("/intake/") || rest.includes("..")) return null;
  return `/comms-hub${rest}`;
}

async function proxyConsole(request, env, url) {
  const origin = await requireConsoleOrigin(request, env);
  const targetPath = consoleTargetPath(url.pathname);
  if (!targetPath) return withCors(json({ error: "console_path_denied", message: "This AIMS route is not available to the console." }, { status: 403 }), origin, { credentials: true });

  const aimsBase = baseUrl(env.AIMS_API_BASE_URL);
  if (!aimsBase) throw configurationError("aims_api_base_url_unconfigured", "AIMS_API_BASE_URL is not configured.");
  if (!normalise(env.AIMS_API_KEY)) throw configurationError("aims_api_key_unconfigured", "AIMS_API_KEY is not configured.");
  if (!normalise(env.COMMS_HUB_RBAC_DELEGATION_SECRET)) {
    throw configurationError("delegation_secret_unconfigured", "COMMS_HUB_RBAC_DELEGATION_SECRET is not configured.");
  }

  const identity = await verifyHiveIdentity(request, env);
  const timestamp = String(Date.now());
  const signature = await delegatedIdentitySignature({ method: request.method, path: targetPath, timestamp, actor: identity.actor, role: identity.role }, env.COMMS_HUB_RBAC_DELEGATION_SECRET);
  const headers = new Headers();
  for (const name of ["accept", "content-type", "idempotency-key", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("authorization", `Bearer ${env.AIMS_API_KEY}`);
  headers.set("x-comms-hub-actor", identity.actor);
  headers.set("x-comms-hub-role", identity.role);
  headers.set("x-comms-hub-timestamp", timestamp);
  headers.set("x-comms-hub-signature", signature);

  const target = `${aimsBase}${targetPath}${url.search}`;
  let response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
  } catch (error) {
    console.error("aimsUiGateway.consoleProxy.upstreamFetchFailed", {
      targetPath,
      method: request.method,
      requestId: headers.get("x-request-id") || null,
      error: error?.message || String(error),
    });
    throw Object.assign(new Error("AIMS upstream could not be reached."), { status: 502, code: "aims_upstream_unreachable" });
  }

  if (!response.ok) {
    console.warn("aimsUiGateway.consoleProxy.upstreamResponse", {
      targetPath,
      method: request.method,
      status: response.status,
      requestId: headers.get("x-request-id") || response.headers.get("x-request-id") || null,
    });
  }
  return withCors(response, origin, { credentials: true });
}

function handleOptions(request, env, url) {
  const origin = request.headers.get("origin") || "";
  const isConsole = url.pathname.startsWith("/console/api");
  const allowed = isAllowedOrigin(origin, isConsole ? env.CONSOLE_ALLOWED_ORIGINS : env.WIDGET_ALLOWED_ORIGINS, request.url);
  if (!allowed) return json({ error: "origin_denied" }, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin, { credentials: isConsole }) });
}

function errorResponse(error, request, env, url) {
  const status = Number(error?.status || 500);
  const payload = { error: error?.code || (status >= 500 ? "gateway_error" : "request_rejected"), message: status >= 500 ? "The AIMS gateway could not complete this request." : error.message };
  const response = json(payload, { status });
  const origin = request.headers.get("origin") || "";
  const isConsole = url.pathname.startsWith("/console/api");
  if (isAllowedOrigin(origin, isConsole ? env.CONSOLE_ALLOWED_ORIGINS : env.WIDGET_ALLOWED_ORIGINS, request.url)) {
    return withCors(response, origin, { credentials: isConsole });
  }
  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") return handleOptions(request, env, url);
      if (request.method === "GET" && url.pathname === "/livez") {
        return json({
          ok: true,
          healthy: true,
          status: "healthy",
          service: "aims-ui-gateway",
          environment: env.ENVIRONMENT || "unknown",
          releaseSha: AIMS_UI_BUILD_SHA,
          releaseBranch: AIMS_UI_BUILD_BRANCH,
        });
      }
      if (request.method === "GET" && (url.pathname === "/readyz" || url.pathname === "/health")) {
        const configuration = gatewayConfigurationStatus(env);
        const missing = CORE_READINESS_KEYS.filter((key) => configuration[key] !== true);
        const optionalMissing = Object.entries(configuration)
          .filter(([key, value]) => key !== "ready" && !CORE_READINESS_KEYS.includes(key) && value !== true)
          .map(([key]) => key);
        return json({
          ok: configuration.ready,
          ready: configuration.ready,
          status: configuration.ready ? "ready" : "not_ready",
          service: "aims-ui-gateway",
          environment: env.ENVIRONMENT || "unknown",
          releaseSha: AIMS_UI_BUILD_SHA,
          releaseBranch: AIMS_UI_BUILD_BRANCH,
          configuration,
          missing,
          optionalMissing,
        }, { status: configuration.ready ? 200 : 503 });
      }
      if (isCogniPalIntakePath(url.pathname, request.method)) return proxyCogniPalIntake(request, env, url);
      if (url.pathname === "/console/api/auth/handoff") return exchangeHiveHandoff(request, env);
      if (url.pathname.startsWith("/console/api")) return proxyConsole(request, env, url);
      if (request.method === "POST" && url.pathname === "/widget/session") return createWidgetSession(request, env);
      const widgetMatch = url.pathname.match(/^\/widget\/sessions\/([^/]+)\/messages$/);
      if (widgetMatch && request.method === "GET") return listWidgetMessages(request, env, decodeURIComponent(widgetMatch[1]));
      if (widgetMatch && request.method === "POST") return relayVisitorMessage(request, env, decodeURIComponent(widgetMatch[1]));
      const providerMessages = url.pathname.match(/^\/sessions\/([^/]+)\/messages$/);
      if (providerMessages && request.method === "POST") return providerSend(request, env, decodeURIComponent(providerMessages[1]));
      const providerMode = url.pathname.match(/^\/sessions\/([^/]+)\/mode$/);
      if (providerMode && request.method === "PUT") return providerSetMode(request, env, decodeURIComponent(providerMode[1]));

      // The chat custom domain is attached to this Worker. Serve the console/widget
      // from the Worker static-assets binding for every non-API route instead of
      // returning a gateway 404.
      if (env.ASSETS && request.method === "GET") {
        const assetResponse = await env.ASSETS.fetch(request);
        const headers = new Headers(assetResponse.headers);
        const contentType = headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          headers.set("content-security-policy", "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src https://hive.jonathan-harris.online; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://hive.jonathan-harris.online; upgrade-insecure-requests");
        }
        headers.delete("x-frame-options");
        headers.set("cross-origin-resource-policy", "cross-origin");
        headers.set("referrer-policy", "same-origin");
        headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
        headers.set("x-content-type-options", "nosniff");
        return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
      }
      return json({ error: "not_found", message: "Route not found." }, { status: 404 });
    } catch (error) {
      console.error("aimsUiGateway.requestFailed", {
        path: url.pathname,
        method: request.method,
        status: Number(error?.status || 500),
        code: error?.code || "gateway_error",
        error: error?.message || String(error),
      });
      return errorResponse(error, request, env, url);
    }
  },
};
