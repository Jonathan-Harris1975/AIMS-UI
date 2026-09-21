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
    if (Date.parse(parsed.expiresAt) <= Date.now() + 30_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(siteId, session) {
  localStorage.setItem(storageKey(siteId), JSON.stringify(session));
}

function clearStoredSession(siteId) {
  localStorage.removeItem(storageKey(siteId));
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
    privacyUrl: String(data.privacyUrl || globalThis.COGNIPAL_WIDGET_CONFIG?.privacyUrl || "/privacy/"),
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
  }

  connectedCallback() {
    this.config = resolveWidgetConfig(this);
    this.transport = new HttpTransport(this.config);
    this.session = readStoredSession(this.config.siteId);
    this.consented = Boolean(this.session);
    this.render();
    this.bind();
  }

  disconnectedCallback() {
    this.stopPolling();
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
      if (action === "reset") this.resetConversation();
    });
    this.shadowRoot.addEventListener("submit", (event) => {
      if (event.target.matches(".cp-composer")) {
        event.preventDefault();
        void this.sendMessage();
      }
    });
    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open) this.toggle(false);
      if (event.target.matches("textarea") && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.sendMessage();
      }
    });
    this.shadowRoot.addEventListener("input", (event) => {
      if (!event.target.matches("textarea")) return;
      event.target.style.height = "auto";
      event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
      const count = this.shadowRoot.querySelector("[data-count]");
      if (count) count.textContent = `${event.target.value.length}/${MAX_MESSAGE_LENGTH}`;
    });
  }

  toggle(force) {
    this.open = typeof force === "boolean" ? force : !this.open;
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
    this.loading = true;
    this.error = "";
    this.render();
    try {
      const session = await this.transport.createSession({ siteId: this.config.siteId, pageUrl: location.href, referrer: document.referrer || "" });
      this.session = session;
      this.lastSyncAt = "";
      writeStoredSession(this.config.siteId, session);
      await this.refreshMessages();
      if (!this.messages.length) {
        this.messages = [{ id: "welcome", role: "assistant", text: this.config.greeting, createdAt: new Date().toISOString(), local: true }];
      }
    } catch (error) {
      this.error = error.message || "CogniPal could not start this conversation.";
      this.consented = false;
    } finally {
      this.loading = false;
      this.render();
      this.scrollToEnd();
    }
  }

  async refreshMessages() {
    if (!this.session || this.loading || this.refreshing || document.hidden) return;
    this.refreshing = true;
    try {
      const payload = await this.transport.messages(this.session, this.lastSyncAt);
      const remote = Array.isArray(payload?.messages) ? payload.messages : [];
      if (this.lastSyncAt) {
        this.messages = [...this.messages.filter(({ id }) => !remote.some((item) => item.id === id)), ...remote];
      } else {
        const welcome = this.messages.find((item) => item.id === "welcome");
        this.messages = welcome ? [welcome, ...remote] : remote;
      }
      this.lastSyncAt = remote.at(-1)?.createdAt || this.lastSyncAt;
      this.mode = payload?.mode || "automation";
      if (this.mode === "closed" || payload?.exists === false) this.stopPolling();
      else this.startPolling();
      this.error = "";
      this.render();
      this.scrollToEnd();
    } catch (error) {
      if (error.status === 401 || error.status === 404) {
        clearStoredSession(this.config.siteId);
        this.session = null;
        this.consented = false;
        this.stopPolling();
      }
      this.error = error.message || "Conversation updates could not be loaded.";
      this.render();
    } finally {
      this.refreshing = false;
    }
  }

  async sendMessage() {
    const input = this.shadowRoot.querySelector(".cp-composer textarea");
    const message = String(input?.value || "").trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH || this.sending || !this.session) return;
    const clientMessageId = newId("visitor");
    const optimistic = { id: clientMessageId, role: "visitor", text: message, createdAt: new Date().toISOString(), status: "sending" };
    this.messages.push(optimistic);
    await this.transmitMessage(optimistic);
  }

  async retryMessage(messageId) {
    const message = this.messages.find((item) => item.id === messageId && item.role === "visitor" && item.status === "failed");
    if (!message || this.sending || !this.session) return;
    await this.transmitMessage(message);
  }

  async transmitMessage(message) {
    this.sending = true;
    this.error = "";
    this.waking = false;
    message.status = "sending";
    this.wakeTimer = setTimeout(() => { this.waking = true; this.render(); this.scrollToEnd(); }, 2500);
    this.render();
    this.scrollToEnd();
    try {
      await this.transport.send(this.session, { message: message.text, clientMessageId: message.id, occurredAt: message.createdAt });
      message.status = "accepted";
      await this.refreshMessages();
    } catch (error) {
      message.status = "failed";
      this.error = error.message || "That message was not accepted. Please try again.";
    } finally {
      clearTimeout(this.wakeTimer);
      this.waking = false;
      this.sending = false;
      this.render();
      this.scrollToEnd();
      this.shadowRoot.querySelector(".cp-composer textarea")?.focus();
    }
  }

  resetConversation() {
    clearStoredSession(this.config.siteId);
    this.stopPolling();
    this.session = null;
    this.messages = [];
    this.consented = false;
    this.error = "";
    this.mode = "automation";
    this.render();
  }

  startPolling() {
    if (this.pollTimer || !this.open || !this.session) return;
    this.pollTimer = setInterval(() => this.refreshMessages(), 10000);
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
      const retry = item.status === "failed"
        ? ` · not sent <button class="cp-message-retry" type="button" data-action="retry-message"
             data-message-id="${escapeHtml(item.id)}">Try again</button>`
        : "";
      return `<article class="cp-message ${escapeHtml(item.role || "assistant")}">
        <div class="cp-bubble">${escapeHtml(item.text || item.body_text || "")}</div>
        <div class="cp-meta">${sender}${retry}</div>
      </article>`;
    }).join("");
    return `<div class="cp-thread" role="log" aria-live="polite" aria-relevant="additions text">
      ${["human", "takeover_requested"].includes(this.mode) ? `<div class="cp-mode">A human operator is handling this conversation.</div>` : ""}
      ${messages}
      ${this.waking ? `<div class="cp-wake" role="status"><span aria-hidden="true"></span>Waking CogniPal and checking the AIMS route…</div>` : ""}
      ${this.sending && !this.waking ? `<div class="cp-typing" role="status" aria-label="CogniPal is thinking">
        <i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>
      </div>` : ""}
    </div>`;
  }

  render() {
    if (!this.config) return;
    this.shadowRoot.innerHTML = `<link rel="stylesheet" href="${escapeHtml(STYLE_URL)}">
      <div class="cp-root ${escapeHtml(this.config.position)}">
        <section class="cp-panel ${this.open ? "open" : ""}" role="dialog" aria-modal="false" aria-label="CogniPal chat" tabindex="-1">
          <header class="cp-header">
            <span class="cp-avatar"><img src="${escapeHtml(this.config.iconUrl)}" alt=""></span>
            <div class="cp-heading"><strong>${escapeHtml(this.config.title)}</strong><span>${this.mode === "human" ? "Human support active" : "AIMS website assistant"}</span></div>
            <button class="cp-icon-button" data-action="toggle" aria-label="Minimise chat"><svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg></button>
          </header>
          <main class="cp-body">${this.content()}</main>
          ${this.consented && this.session ? `<footer class="cp-footer">
            ${this.error ? `<div class="cp-alert" role="alert">${escapeHtml(this.error)}</div>` : ""}
            <form class="cp-composer">
              <label class="cp-sr" for="cp-message">Message CogniPal</label>
              <textarea id="cp-message" maxlength="${MAX_MESSAGE_LENGTH}" rows="1" placeholder="Write a message…" ${this.sending ? "disabled" : ""}></textarea>
              <button class="cp-send" type="submit" aria-label="Send message" ${this.sending ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="m3 20 18-8L3 4v6l12 2-12 2v6Z"/></svg></button>
            </form>
            <div class="cp-footnote"><span data-count aria-live="polite">0/${MAX_MESSAGE_LENGTH}</span><button type="button" data-action="reset">End conversation</button></div>
          </footer>` : ""}
        </section>
        <button class="cp-launcher" data-action="toggle" aria-label="${this.open ? "Close" : "Open"} CogniPal chat" aria-expanded="${this.open}">
          <img src="${escapeHtml(this.config.iconUrl)}" alt=""><span class="cp-online"></span>
        </button>
      </div>`;
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
