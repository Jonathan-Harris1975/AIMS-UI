const DEFAULT_ICON = "https://assets.jonathan-harris.online/CogniPal.jpg";
const STORAGE_PREFIX = "aims-cognipal-session";
const MAX_MESSAGE_LENGTH = 4000;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeBase(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\/+$/, "");
}

function newId(prefix = "msg") {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function storageKey(siteId) {
  return `${STORAGE_PREFIX}:${siteId}`;
}

function readStoredSession(siteId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(siteId)) || "null");
    if (!parsed?.sessionId || !parsed?.token || !parsed?.expiresAt) return null;
    if (!(Date.parse(parsed.expiresAt) > Date.now() + 30_000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(siteId, session) {
  try { localStorage.setItem(storageKey(siteId), JSON.stringify(session)); } catch {}
}

function clearStoredSession(siteId) {
  try { localStorage.removeItem(storageKey(siteId)); } catch {}
}

function safePrivacyUrl(value) {
  try { const url = new URL(value, location.origin); if (/^https?:$/.test(url.protocol)) return url.href; } catch {}
  return "/privacy/";
}

export function resolveWidgetConfig(element = null, script = document.currentScript) {
  const data = { ...(script?.dataset || {}), ...(element?.dataset || {}) };
  return Object.freeze({
    apiBase: safeBase(data.apiBase || globalThis.COGNIPAL_WIDGET_CONFIG?.apiBase || ""),
    siteId: String(data.siteId || globalThis.COGNIPAL_WIDGET_CONFIG?.siteId || location.hostname || "jonathan-harris.online"),
    iconUrl: String(data.iconUrl || globalThis.COGNIPAL_WIDGET_CONFIG?.iconUrl || DEFAULT_ICON),
    position: data.position === "left" ? "left" : "right",
    title: String(data.title || globalThis.COGNIPAL_WIDGET_CONFIG?.title || "CogniPal"),
    greeting: String(data.greeting || globalThis.COGNIPAL_WIDGET_CONFIG?.greeting || "Hello. I’m CogniPal. What would you like to explore?"),
    privacyUrl: safePrivacyUrl(data.privacyUrl || globalThis.COGNIPAL_WIDGET_CONFIG?.privacyUrl || "/privacy/"),
  });
}

class HttpTransport {
  constructor(config) {
    this.config = config;
  }

  async request(path, options = {}) {
    if (!this.config.apiBase) throw new Error("CogniPal API base URL is not configured.");
    const response = await fetch(`${this.config.apiBase}${path}`, {
      credentials: "omit",
      signal: AbortSignal.timeout(35000),
      ...options,
      headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `CogniPal request failed with status ${response.status}.`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  createSession(input) {
    return this.request("/widget/session", { method: "POST", body: JSON.stringify(input) });
  }

  messages(session, after = "") {
    return this.request(`/widget/sessions/${encodeURIComponent(session.sessionId)}/messages${after ? `?after=${encodeURIComponent(after)}` : ""}`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
  }

  send(session, input) {
    return this.request(`/widget/sessions/${encodeURIComponent(session.sessionId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}`, "idempotency-key": input.clientMessageId },
      body: JSON.stringify(input),
    });
  }
}

function messageHtml(text) {
  return String(text).split(/(https?:\/\/[^\s<>"\x27]+)/g).map((part, index) => {
    const safe = escapeHtml(part);
    return index % 2 ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>` : safe;
  }).join("");
}

function starterMarkup() {
  const path = location.pathname.toLowerCase();
  const prompt = /book/.test(path) ? "Which AI book should I start with?" : /podcast/.test(path) ? "Help me find a relevant episode"
    : /ai-edge|newsletter/.test(path) ? "What is AI Edge?" : /course/.test(path) ? "Which AI course suits my experience?" : "Help me find AI resources";
  return `<button type="button" class="cp-button secondary" data-action="starter">${prompt}</button>`;
}

const STYLE_URL = new URL("./cognipal-widget.css", import.meta.url).href;


export class CogniPalWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.config = null;
    this.transport = null;
    this.session = null;
    this.messages = [];
    this.mode = "automation";
    this.open = false;
    this.consented = false;
    this.loading = false;
    this.sending = false;
    this.error = "";
    this.waking = false;
    this.pollTimer = null;
    this.wakeTimer = null;
    this.lastSyncAt = "";
    this.connection = "unknown";
    this.draft = "";
  }

  connectedCallback() {
    this.config = resolveWidgetConfig(this);
    this.lastContent = null;
    this.messages = [];
    this.lastSyncAt = "";
    this.mode = "automation";
    this.transport = new HttpTransport(this.config);
    this.session = readStoredSession(this.config.siteId);
    this.consented = Boolean(this.session);
    this.render();
    if (!this.bound) { this.bind(); this.bound = true; }
  }

  disconnectedCallback() {
    this.stopPolling();
    this.connection = "unknown";
    this.attempt = null;
    this.loading = this.sending = this.waking = false;
    this.session = null;
  }

  bind() {
    this.shadowRoot.addEventListener("click", (event) => {
      const actionTarget = event.target.closest("[data-action]");
      const action = actionTarget?.dataset.action;
      if (!action) return;
      if (action === "toggle") this.toggle();
      if (action === "consent") void this.acceptConsent();
      if (action === "retry") void this.initialiseConversation();
      if (action === "retry-message") void this.retryMessage(actionTarget.dataset.messageId);
      if (action === "reset" && !this.sending && globalThis.confirm("Clear this local chat and start over?")) this.resetConversation();
      if (action === "starter") {
        this.draft = actionTarget.textContent.trim(); this.render(); this.shadowRoot.querySelector("textarea")?.focus();
      }
    });
    this.shadowRoot.addEventListener("submit", (event) => {
      if (event.target.matches(".cp-composer")) {
        event.preventDefault();
        void this.sendMessage();
      }
    });
    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open) this.toggle(false);
      if (event.target.matches("textarea") && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void this.sendMessage();
      }
    });
    this.shadowRoot.addEventListener("input", (event) => {
      if (!event.target.matches("textarea")) return;
      this.draft = event.target.value;
      event.target.style.height = "auto";
      event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
      const count = this.shadowRoot.querySelector("[data-count]");
      if (count) count.textContent = this.draft.length >= 3500 ? `${this.draft.length}/${MAX_MESSAGE_LENGTH}` : "";
    });
  }

  toggle(force) {
    this.open = typeof force === "boolean" ? force : !this.open;
    this.connection = "unknown";
    this.render();
    if (this.open) {
      if (this.consented && !this.session) void this.initialiseConversation();
      if (this.session) {
        void this.refreshMessages();
        this.startPolling();
      }
      requestAnimationFrame(() => this.shadowRoot.querySelector(".cp-panel")?.focus());
    } else {
      this.stopPolling();
      this.shadowRoot.querySelector(".cp-launcher")?.focus();
    }
  }

  async acceptConsent() {
    this.consented = true;
    await this.initialiseConversation();
  }

  async initialiseConversation() {
    if (this.loading) return;
    const attempt = {};
    this.attempt = attempt;
    this.loading = true;
    this.connection = "pending";
    this.error = "";
    this.render();
    try {
      const publicUrl = value => { try { const url = new URL(value); return url.origin + url.pathname; } catch { return ""; } };
      const session = await this.transport.createSession({
        siteId: this.config.siteId, pageUrl: publicUrl(location.href), referrer: publicUrl(document.referrer),
      });
      if (this.attempt !== attempt) return;
      this.session = session;
      this.messages = [];
      this.lastSyncAt = "";
      writeStoredSession(this.config.siteId, session);
      await this.refreshMessages(true);
      if (this.attempt !== attempt || this.session !== session) return;
      if (!this.messages.length) {
        this.messages = [{ id: "welcome", role: "assistant", text: this.config.greeting, createdAt: new Date().toISOString(), local: true }];
      }
    } catch (error) {
      if (this.attempt !== attempt) return;
      this.connection = "error";
      this.error = error.message || "CogniPal could not start this conversation.";
      this.consented = false;
    } finally {
      if (this.attempt === attempt) { this.loading = false; this.render(); }
    }
  }

  async refreshMessages(initial = false) {
    const session = this.session;
    if (!session || (!initial && this.loading) || this.refreshing === session || !this.open) return;
    if (document.hidden) { this.startPolling(); return; }
    this.refreshing = session;
    try {
      const cursor = this.messages.some(item => ["pending", "failed"].includes(item.status)) ? "" : this.lastSyncAt;
      const after = cursor ? new Date(Date.parse(cursor) - 1).toISOString() : "";
      const payload = await this.transport.messages(session, after);
      if (this.session !== session) return;
      const before = JSON.stringify([this.messages, this.mode, this.error, this.connection]);
      const merged = new Map(this.messages.map(item => [item.id, item]));
      for (const item of Array.isArray(payload?.messages) ? payload.messages : []) {
        const previous = merged.get(item.id);
        if (!(previous?.status === "failed" && item.status === "pending")) merged.set(item.id, item);
        if (Date.parse(item.createdAt) > (Date.parse(this.lastSyncAt) || 0)) this.lastSyncAt = item.createdAt;
      }
      this.messages = [...merged.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      this.mode = payload?.status === "closed" ? "closed" : payload?.mode || "automation";
      if (this.mode === "closed") this.stopPolling();
      this.connection = payload?.exists === false ? "pending" : "ready";
      this.error = "";
      if (before !== JSON.stringify([this.messages, this.mode, this.error, this.connection])) this.render();
    } catch (error) {
      if (this.session !== session) return;
      if (error.status === 401 || error.status === 404) {
        clearStoredSession(this.config.siteId);
        this.session = null;
        this.consented = false;
        this.stopPolling();
      }
      this.connection = "error";
      this.error = error.message || "Conversation updates could not be loaded.";
      this.render();
    } finally {
      if (this.refreshing === session) this.refreshing = null;
      if (this.session === session) this.startPolling();
    }
  }

  async sendMessage() {
    const input = this.shadowRoot.querySelector(".cp-composer textarea");
    const message = String(input?.value || "").trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH || this.sending || !this.session || this.mode === "closed") return;
    input.value = this.draft = "";
    const clientMessageId = newId("visitor");
    const optimistic = { id: clientMessageId, role: "visitor", text: message, createdAt: new Date().toISOString(), status: "sending" };
    this.messages.push(optimistic);
    await this.transmitMessage(optimistic);
  }

  async retryMessage(messageId) {
    const message = this.messages.find((item) => item.id === messageId && item.role === "visitor" && ["failed", "pending"].includes(item.status));
    if (!message || this.sending || !this.session || this.mode === "closed") return;
    await this.transmitMessage(message);
  }

  async transmitMessage(message) {
    const session = this.session;
    this.sending = true;
    this.error = "";
    this.connection = "pending";
    this.waking = false;
    message.status = "sending";
    this.wakeTimer = setTimeout(() => { if (this.session === session) { this.waking = true; this.render(); } }, 2500);
    this.render();
    this.scrollToEnd();
    try {
      await this.transport.send(session, { message: message.text, clientMessageId: message.id, occurredAt: message.createdAt });
      if (this.session !== session) return;
      this.messages.find(item => item.id === message.id).status = "accepted";
      this.connection = "ready";
      await this.refreshMessages();
    } catch (error) {
      if (this.session !== session) return;
      this.messages.find(item => item.id === message.id).status = "failed";
      this.connection = "error";
      this.error = error.message || "That message was not accepted. Please try again.";
    } finally {
      if (this.session === session || !this.session) {
        clearTimeout(this.wakeTimer);
        this.waking = this.sending = false;
        this.render();
      }
    }
  }

  resetConversation() {
    clearStoredSession(this.config.siteId);
    this.stopPolling();
    this.session = null;
    this.attempt = null;
    this.loading = this.sending = this.waking = false;
    this.lastSyncAt = this.draft = "";
    this.connection = "unknown";
    this.messages = [];
    this.consented = false;
    this.error = "";
    this.mode = "automation";
    this.render();
  }

  startPolling() {
    if (this.pollTimer || !this.open || !this.session || this.mode === "closed") return;
    this.pollTimer = setTimeout(() => { this.pollTimer = null; void this.refreshMessages(); }, this.connection === "error" ? 30000 : 10000);
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    clearTimeout(this.wakeTimer);
    this.pollTimer = null;
    this.wakeTimer = null;
  }

  scrollToEnd() {
    requestAnimationFrame(() => {
      const body = this.shadowRoot.querySelector(".cp-body");
      if (body) body.scrollTop = body.scrollHeight;
    });
  }

  content() {
    if (!this.consented) {
      return `<section class="cp-consent">
        <img src="${escapeHtml(this.config.iconUrl)}" alt="CogniPal">
        <h2>Start a conversation</h2>
        <p>CogniPal sends your messages to AIMS so they can be answered, reviewed and followed up when needed.</p>
        ${this.error ? `<div class="cp-alert" role="alert">${escapeHtml(this.error)}</div>` : ""}
        <button class="cp-button primary" data-action="consent" ${this.loading ? "disabled" : ""}>${this.loading ? "Starting…" : "Continue to chat"}</button>
        <small>By continuing, you agree to the <a href="${escapeHtml(this.config.privacyUrl)}" target="_blank" rel="noopener noreferrer">privacy notice</a>.</small>
      </section>`;
    }
    if (this.loading && !this.session) {
      return `<section class="cp-empty" role="status" aria-live="polite">
        <div class="cp-typing" aria-hidden="true"><i></i><i></i><i></i></div>
        <h2>Opening CogniPal</h2><p>Creating a private conversation session.</p>
      </section>`;
    }
    if (this.error && !this.session) {
      return `<section class="cp-error">
        <h2>Connection interrupted</h2><p>${escapeHtml(this.error)}</p>
        <button class="cp-button secondary" data-action="retry">Try again</button>
      </section>`;
    }
    const messages = this.messages.map((item) => {
      const sender = item.role === "visitor" ? "You" : item.role === "operator" ? "AIMS team" : "CogniPal";
      const time = Date.parse(item.createdAt) ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      const retry = ["failed", "pending"].includes(item.status) && item.role === "visitor" && this.mode !== "closed"
        ? ` · not sent <button class="cp-message-retry" type="button" data-action="retry-message"
             data-message-id="${escapeHtml(item.id)}">Try again</button>`
        : "";
      return `<article class="cp-message ${escapeHtml(item.role || "assistant")}">
        <div class="cp-bubble">${messageHtml(item.text || item.body_text || "")}</div>
        <div class="cp-meta">${sender} ${escapeHtml(time)}${item.status === "accepted" ? " · Accepted" : ""}${retry}</div>
      </article>`;
    }).join("");
    return `<div class="cp-thread" role="log" aria-live="polite" aria-relevant="additions text">
      ${this.mode === "human" ? '<div class="cp-mode">Human support active</div>' : this.mode === "takeover_requested" ? '<div class="cp-mode">Human support requested</div>' : ""}
      ${messages}
      ${!this.messages.some(item => item.role === "visitor") && this.mode !== "closed" ? starterMarkup() : ""}
      ${this.mode === "closed" ? '<p class="cp-mode">Conversation closed. Start a new chat to continue.</p>' : ""}
      ${this.waking ? `<div class="cp-wake" role="status"><span aria-hidden="true"></span>Waking CogniPal and checking the AIMS route…</div>` : ""}
      ${this.sending && !this.waking ? `<div class="cp-typing" role="status" aria-label="CogniPal is thinking">
        <i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>
      </div>` : ""}
    </div>`;
  }

  render() {
    if (!this.config) return;
    const root = this.shadowRoot;
    if (!root.querySelector(".cp-panel")) root.innerHTML = `<link rel="stylesheet" href="${escapeHtml(STYLE_URL)}">
      <div class="cp-root ${escapeHtml(this.config.position)}">
        <section class="cp-panel" id="cp-chat" role="dialog" aria-modal="false" aria-label="CogniPal chat" tabindex="-1">
          <header class="cp-header">
            <span class="cp-avatar"><img src="${escapeHtml(this.config.iconUrl)}" alt=""></span>
            <div class="cp-heading"><strong>${escapeHtml(this.config.title)}</strong><span></span></div>
            <button class="cp-icon-button" data-action="toggle" aria-label="Minimise chat"><svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg></button>
          </header>
          <main class="cp-body"></main>
          <footer class="cp-footer" hidden>
            <div class="cp-alert" role="alert" hidden></div>
            <form class="cp-composer">
              <label class="cp-sr" for="cp-message">Message CogniPal</label>
              <textarea id="cp-message" maxlength="${MAX_MESSAGE_LENGTH}" rows="1" placeholder="Write a message…"></textarea>
              <button class="cp-send" type="submit" aria-label="Send message"><svg viewBox="0 0 24 24"><path d="m3 20 18-8L3 4v6l12 2-12 2v6Z"/></svg></button>
            </form>
            <div class="cp-footnote"><span data-count></span><button type="button" data-action="reset">Start over</button></div>
          </footer>
        </section>
        <button class="cp-launcher" data-action="toggle" aria-controls="cp-chat">
          <img src="${escapeHtml(this.config.iconUrl)}" alt=""><span class="cp-online" aria-hidden="true"></span>
        </button>
      </div>`;
    const get = selector => root.querySelector(selector);
    get(".cp-panel").classList.toggle("open", this.open);
    const launcher = get(".cp-launcher");
    launcher.setAttribute("aria-expanded", String(this.open));
    launcher.setAttribute("aria-label", (this.open ? "Close" : "Open") + " CogniPal chat");
    launcher.title = "CogniPal · " + this.connection;
    get(".cp-online").dataset.state = this.open ? this.connection : "unknown";
    get(".cp-heading span").textContent = this.mode === "human" ? "Human support active"
      : this.mode === "takeover_requested" ? "Human support requested" : "AI website assistant";
    const body = get(".cp-body"), top = body.scrollTop;
    const follow = body.scrollHeight - top - body.clientHeight < 48;
    const content = this.content();
    if (this.lastContent !== content) {
      body.innerHTML = content;
      this.lastContent = content;
      body.scrollTop = follow ? body.scrollHeight : top;
    }
    get(".cp-footer").hidden = !this.consented || !this.session;
    const alert = get(".cp-alert");
    alert.hidden = !this.error;
    alert.textContent = this.error;
    const input = get("textarea");
    if (input.value !== this.draft) input.value = this.draft;
    input.disabled = this.mode === "closed";
    get(".cp-send").disabled = this.sending || input.disabled;
    get('[data-action="reset"]').disabled = this.sending;
    get("[data-count]").textContent = this.draft.length >= 3500 ? `${this.draft.length}/${MAX_MESSAGE_LENGTH}` : "";
  }

}

if (!customElements.get("cognipal-widget")) customElements.define("cognipal-widget", CogniPalWidget);

const bootScript = document.currentScript || [...document.scripts].find((script) => {
  try { return script.src && new URL(script.src, document.baseURI).href === import.meta.url; } catch { return false; }
});
if (bootScript && bootScript.dataset.autoMount !== "false") {
  const mount = () => {
    if (document.querySelector("cognipal-widget")) return;
    const widget = document.createElement("cognipal-widget");
    for (const [key, value] of Object.entries(bootScript.dataset)) widget.dataset[key] = value;
    document.body.append(widget);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
}
