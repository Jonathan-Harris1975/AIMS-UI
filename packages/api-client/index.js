function cleanBaseUrl(value) {
  const base = String(value || "").trim();
  if (!base) throw new TypeError("AIMS API base URL is required.");
  return base.replace(/\/+$/, "");
}

function cleanPath(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value}`;
}

export function makeUrl(baseUrl, path, query = {}) {
  const base = cleanBaseUrl(baseUrl);
  const pathname = cleanPath(path);
  const isAbsolute = /^https?:\/\//i.test(base);
  const url = new URL(`${base}${pathname}`, isAbsolute ? undefined : globalThis.location?.origin || "http://localhost");
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    url.searchParams.set(key, String(value));
  }
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

export class AimsApiError extends Error {
  constructor(message, { status = 0, code = "aims_api_error", payload = null } = {}) {
    super(message);
    this.name = "AimsApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function newIdempotencyKey(prefix = "ui") {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

export class AimsCommsClient {
  constructor({ baseUrl, fetchImpl = globalThis.fetch, tokenProvider = null } = {}) {
    this.baseUrl = cleanBaseUrl(baseUrl);
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.fetchImpl = fetchImpl;
    this.tokenProvider = typeof tokenProvider === "function" ? tokenProvider : null;
  }

  async request(path, { method = "GET", query, body, headers = {}, signal, idempotent = false } = {}) {
    const token = await this.tokenProvider?.();
    const requestHeaders = new Headers(headers);
    requestHeaders.set("accept", "application/json");
    if (token) requestHeaders.set("authorization", `Bearer ${token}`);
    if (body !== undefined) requestHeaders.set("content-type", "application/json");
    if (idempotent && !requestHeaders.has("idempotency-key")) {
      requestHeaders.set("idempotency-key", newIdempotencyKey());
    }
    const response = await this.fetchImpl(makeUrl(this.baseUrl, path, query), {
      method,
      credentials: "include",
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AimsApiError(
        payload?.message || payload?.error || `AIMS request failed with status ${response.status}.`,
        { status: response.status, code: payload?.error || "aims_api_error", payload },
      );
    }
    return payload;
  }

  bootstrap() { return this.request("/ui/bootstrap"); }
  queue(filters = {}) { return this.request("/queue", { query: filters }); }
  workspace(conversationId) { return this.request(`/workspace/${encodeURIComponent(conversationId)}`); }
  metrics(query = {}) { return this.request("/metrics", { query }); }
  notifications(query = {}) { return this.request("/notifications", { query }); }
  markNotification(id, status = "read") { return this.request(`/notifications/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }); }
  quarantine(query = {}) { return this.request("/quarantine", { query }); }
  replayQuarantine(id) { return this.request(`/quarantine/${encodeURIComponent(id)}/replay`, { method: "POST", body: {}, idempotent: true }); }
  workflowDefinitions(query = {}) { return this.request("/workflow-definitions", { query }); }
  escalations(query = {}) { return this.request("/escalations", { query }); }
  search(query, filters = {}) { return this.request("/search", { query: { q: query, query, ...filters } }); }
  updateStatus(conversationId, status, extra = {}) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/status`, {
      method: "PATCH",
      body: { status, ...extra },
      idempotent: true,
    });
  }
  assign(conversationId, assignment) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/assignment`, {
      method: "PATCH",
      body: assignment,
      idempotent: true,
    });
  }
  addNote(conversationId, note) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/notes`, {
      method: "POST",
      body: note,
      idempotent: true,
    });
  }
  analyse(conversationId, options = {}) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/ai/analyse`, {
      method: "POST",
      body: options,
      idempotent: true,
    });
  }
  sendEmail(conversationId, message) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/email`, {
      method: "POST",
      body: message,
      idempotent: true,
    });
  }
  sendChat(conversationId, message) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/chat`, {
      method: "POST",
      body: { message },
      idempotent: true,
    });
  }
  takeover(conversationId, mode) {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/chat/takeover`, {
      method: "POST",
      body: { mode },
      idempotent: true,
    });
  }
  decideApproval(approvalId, decision, reason = "") {
    return this.request(`/approvals/${encodeURIComponent(approvalId)}/decision`, {
      method: "POST",
      body: { decision, reason },
      idempotent: true,
    });
  }
}
