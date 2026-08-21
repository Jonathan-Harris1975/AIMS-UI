const DEFAULT_ICON = "https://assets.jonathan-harris.online/CogniPal.jpg";
const STORAGE_PREFIX = "aims-cognipal-session";
const POLL_INTERVAL_MS = 3500;
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

  messages(session) {
    return this.request(`/widget/sessions/${encodeURIComponent(session.sessionId)}/messages`, {
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

const styles = `
:host { --cp-ink:#17243a; --cp-soft:#66758b; --cp-line:#dce3ec; --cp-panel:#ffffff; --cp-bg:#f5f7fb; --cp-accent:#2e66d3; --cp-accent-dark:#1d4fae; --cp-good:#177a55; --cp-danger:#b33a3a; --cp-shadow:0 20px 55px rgba(28,45,76,.2); font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cp-ink); }
* { box-sizing:border-box; }
button,input,textarea { font:inherit; }
.cp-root { position:fixed; z-index:2147483000; bottom:20px; right:20px; display:grid; justify-items:end; gap:12px; pointer-events:none; }
.cp-root.left { left:20px; right:auto; justify-items:start; }
.cp-launcher { pointer-events:auto; width:62px; height:62px; border-radius:50%; padding:0; border:3px solid #fff; background:#fff; overflow:hidden; box-shadow:0 12px 30px rgba(26,44,75,.24); cursor:pointer; position:relative; transition:transform .16s ease,box-shadow .16s ease; }
.cp-launcher:hover { transform:translateY(-2px); box-shadow:0 16px 36px rgba(26,44,75,.28); }
.cp-launcher:focus-visible,.cp-button:focus-visible,.cp-icon-button:focus-visible,.cp-composer textarea:focus-visible { outline:3px solid rgba(46,102,211,.32); outline-offset:2px; }
.cp-launcher img { width:100%; height:100%; object-fit:cover; display:block; transform:scale(1.62); transform-origin:center 30%; }
.cp-launcher .cp-online { position:absolute; width:13px; height:13px; right:1px; bottom:2px; border:2px solid #fff; border-radius:50%; background:#20a772; }
.cp-panel { pointer-events:auto; width:min(382px,calc(100vw - 24px)); height:min(620px,calc(100vh - 104px)); border:1px solid var(--cp-line); border-radius:20px; background:var(--cp-panel); box-shadow:var(--cp-shadow); overflow:hidden; display:none; grid-template-rows:auto 1fr auto; transform-origin:bottom right; }
.cp-root.left .cp-panel { transform-origin:bottom left; }
.cp-panel.open { display:grid; animation:cp-in .18s ease-out; }
@keyframes cp-in { from { opacity:0; transform:translateY(10px) scale(.985); } to { opacity:1; transform:none; } }
.cp-header { min-height:72px; display:flex; align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid var(--cp-line); background:linear-gradient(135deg,#fff 0%,#f4f7fc 100%); }
.cp-avatar { width:46px; height:46px; border-radius:13px; border:1px solid #d6deea; overflow:hidden; flex:0 0 auto; }
.cp-avatar img { width:100%; height:100%; object-fit:cover; display:block; transform:scale(1.62); transform-origin:center 30%; }
.cp-heading { min-width:0; flex:1; display:grid; gap:2px; }
.cp-heading strong { font-size:15px; letter-spacing:-.01em; }
.cp-heading span { color:var(--cp-soft); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cp-icon-button { width:36px; height:36px; border:0; border-radius:10px; background:transparent; color:var(--cp-soft); cursor:pointer; display:grid; place-items:center; }
.cp-icon-button:hover { background:#eef2f7; color:var(--cp-ink); }
.cp-icon-button svg { width:20px; height:20px; fill:currentColor; }
.cp-body { overflow:auto; background:var(--cp-bg); padding:15px; scroll-behavior:smooth; }
.cp-consent,.cp-empty,.cp-error { min-height:100%; display:grid; align-content:center; justify-items:center; text-align:center; gap:12px; padding:24px 12px; }
.cp-consent img { width:88px; height:88px; border-radius:24px; object-fit:cover; object-position:center 28%; box-shadow:0 10px 24px rgba(28,45,76,.16); }
.cp-consent h2,.cp-empty h2,.cp-error h2 { margin:4px 0 0; font-size:21px; letter-spacing:-.025em; }
.cp-consent p,.cp-empty p,.cp-error p { margin:0; color:var(--cp-soft); font-size:13px; line-height:1.6; max-width:295px; }
.cp-consent small { color:var(--cp-soft); line-height:1.5; }
.cp-consent a { color:var(--cp-accent-dark); }
.cp-button { min-height:42px; border-radius:11px; border:1px solid transparent; padding:9px 15px; cursor:pointer; font-weight:700; font-size:13px; }
.cp-button.primary { background:var(--cp-accent); color:#fff; box-shadow:0 6px 14px rgba(46,102,211,.2); }
.cp-button.primary:hover { background:var(--cp-accent-dark); }
.cp-button.secondary { background:#fff; color:var(--cp-ink); border-color:var(--cp-line); }
.cp-thread { display:grid; gap:12px; align-content:start; }
.cp-message { max-width:84%; display:grid; gap:4px; }
.cp-message.visitor { justify-self:end; }
.cp-message.assistant,.cp-message.operator,.cp-message.system { justify-self:start; }
.cp-bubble { padding:10px 12px; border-radius:15px; font-size:13px; line-height:1.52; white-space:pre-wrap; overflow-wrap:anywhere; box-shadow:0 1px 2px rgba(31,48,77,.06); }
.cp-message.visitor .cp-bubble { color:#fff; background:var(--cp-accent); border-bottom-right-radius:5px; }
.cp-message.assistant .cp-bubble,.cp-message.operator .cp-bubble { background:#fff; border:1px solid var(--cp-line); border-bottom-left-radius:5px; }
.cp-message.system .cp-bubble { color:#52647b; background:#eaf0f8; border-radius:10px; font-size:12px; }
.cp-meta { padding:0 3px; color:#6f7d90; font-size:11px; }
.cp-message.visitor .cp-meta { text-align:right; }
.cp-typing { display:flex; gap:4px; align-items:center; width:max-content; padding:11px 13px; background:#fff; border:1px solid var(--cp-line); border-radius:15px 15px 15px 5px; }
.cp-typing i { width:6px; height:6px; border-radius:50%; background:#8896a9; animation:cp-dot 1s infinite ease-in-out; }
.cp-typing i:nth-child(2) { animation-delay:.15s; }.cp-typing i:nth-child(3) { animation-delay:.3s; }
@keyframes cp-dot { 0%,70%,100% { transform:translateY(0); opacity:.45; } 35% { transform:translateY(-3px); opacity:1; } }
.cp-wake { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; background:#eef3fa; color:#53657b; font-size:11px; }
.cp-wake span { width:8px; height:8px; border-radius:50%; border:2px solid #9ba9ba; border-top-color:var(--cp-accent); animation:cp-spin .8s linear infinite; }
@keyframes cp-spin { to { transform:rotate(360deg); } }
.cp-mode { position:sticky; top:-15px; margin:-15px -15px 12px; padding:7px 12px; background:#fff6dc; border-bottom:1px solid #ead49a; color:#745a14; font-size:11px; text-align:center; }
.cp-footer { border-top:1px solid var(--cp-line); padding:10px 11px 9px; background:#fff; }
.cp-composer { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:end; }
.cp-composer textarea { resize:none; min-height:42px; max-height:112px; border:1px solid var(--cp-line); border-radius:12px; padding:10px 12px; color:var(--cp-ink); background:#fbfcfe; line-height:1.45; }
.cp-send { width:44px; height:44px; border:0; border-radius:12px; background:var(--cp-accent); color:#fff; cursor:pointer; display:grid; place-items:center; }
.cp-send:disabled { opacity:.45; cursor:not-allowed; }
.cp-send svg { width:19px; height:19px; fill:currentColor; }
.cp-footnote { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:6px; padding:0 3px; color:#6f7d90; font-size:11px; }
.cp-footnote button { min-height:32px; color:#52647b; border:0; padding:4px 2px; background:none; cursor:pointer; font-size:11px; text-decoration:underline; text-underline-offset:3px; }
.cp-alert { margin-bottom:8px; padding:8px 10px; border-radius:9px; color:#8d2d2d; background:#fff0f0; border:1px solid #f0caca; font-size:11px; }
.cp-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
@media (max-width:520px) { .cp-root { right:8px; bottom:8px; }.cp-root.left { left:8px; }.cp-panel { width:calc(100vw - 16px); height:calc(100dvh - 88px); border-radius:17px; }.cp-launcher { width:58px; height:58px; } }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important; } }
`;

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
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "toggle") this.toggle();
      if (action === "consent") void this.acceptConsent();
      if (action === "retry") void this.initialiseConversation();
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
      writeStoredSession(this.config.siteId, session);
      await this.refreshMessages();
      if (!this.messages.length) {
        this.messages = [{ id: "welcome", role: "assistant", text: this.config.greeting, createdAt: new Date().toISOString(), local: true }];
      }
      this.startPolling();
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
    if (!this.session || this.loading) return;
    try {
      const payload = await this.transport.messages(this.session);
      const remote = Array.isArray(payload?.messages) ? payload.messages : [];
      const welcome = this.messages.find((item) => item.id === "welcome");
      this.messages = welcome && !remote.some((item) => item.id === "welcome") ? [welcome, ...remote] : remote;
      this.mode = payload?.mode || "automation";
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
    }
  }

  async sendMessage() {
    const input = this.shadowRoot.querySelector(".cp-composer textarea");
    const message = String(input?.value || "").trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH || this.sending || !this.session) return;
    const clientMessageId = newId("visitor");
    const optimistic = { id: clientMessageId, role: "visitor", text: message, createdAt: new Date().toISOString(), status: "sending" };
    this.messages.push(optimistic);
    this.sending = true;
    this.error = "";
    this.waking = false;
    this.wakeTimer = setTimeout(() => { this.waking = true; this.render(); this.scrollToEnd(); }, 2500);
    this.render();
    this.scrollToEnd();
    try {
      await this.transport.send(this.session, { message, clientMessageId, occurredAt: optimistic.createdAt });
      optimistic.status = "accepted";
      await this.refreshMessages();
    } catch (error) {
      optimistic.status = "failed";
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
    this.pollTimer = setInterval(() => void this.refreshMessages(), POLL_INTERVAL_MS);
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
    if (this.loading && !this.session) return `<section class="cp-empty" role="status" aria-live="polite"><div class="cp-typing" aria-hidden="true"><i></i><i></i><i></i></div><h2>Opening CogniPal</h2><p>Creating a private conversation session.</p></section>`;
    if (this.error && !this.session) return `<section class="cp-error"><h2>Connection interrupted</h2><p>${escapeHtml(this.error)}</p><button class="cp-button secondary" data-action="retry">Try again</button></section>`;
    return `<div class="cp-thread" role="log" aria-live="polite" aria-relevant="additions text">
      ${["human", "takeover_requested"].includes(this.mode) ? `<div class="cp-mode">A human operator is handling this conversation.</div>` : ""}
      ${this.messages.map((item) => `<article class="cp-message ${escapeHtml(item.role || "assistant")}">
        <div class="cp-bubble">${escapeHtml(item.text || item.body_text || "")}</div>
        <div class="cp-meta">${item.role === "visitor" ? "You" : item.role === "operator" ? "AIMS team" : "CogniPal"}${item.status === "failed" ? " · not sent" : ""}</div>
      </article>`).join("")}
      ${this.waking ? `<div class="cp-wake" role="status"><span aria-hidden="true"></span>Waking CogniPal and checking the AIMS route…</div>` : ""}
      ${this.sending && !this.waking ? `<div class="cp-typing" role="status" aria-label="CogniPal is thinking"><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i></div>` : ""}
    </div>`;
  }

  render() {
    if (!this.config) return;
    this.shadowRoot.innerHTML = `<style>${styles}</style>
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
