import { AimsCommsClient, AimsApiError } from "../../packages/api-client/index.js";
import { escapeHtml, formatDateTime, formatRelativeTime, secondsToAge, titleCase } from "../../packages/shared/format.js";
import { roleAllows } from "../../packages/shared/contracts.js";

const root = document.querySelector("#app");
const query = new URLSearchParams(location.search);
const supplied = globalThis.AIMS_UI_CONFIG || {};
const config = Object.freeze({
  apiBaseUrl: String(supplied.apiBaseUrl || "/console/api").replace(/\/+$/, ""),
  embedded: query.get("embed") === "1",
  productName: String(supplied.productName || "AIMS Comms Hub"),
  hiveHomeUrl: String(supplied.hiveHomeUrl || "https://hive.jonathan-harris.online").replace(/\/+$/, ""),
});

function hiveParentOrigin() {
  try { return new URL(config.hiveHomeUrl).origin; } catch { return "https://hive.jonathan-harris.online"; }
}

function notifyHiveParent(message) {
  if (!config.embedded || window.parent === window) return;
  window.parent.postMessage(message, hiveParentOrigin());
}

async function acceptHiveHandoff() {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(fragment);
  const token = params.get("handoff");
  if (!token) return false;
  history.replaceState(null, "", `${location.pathname}${location.search}#dashboard`);
  const response = await fetch(`${config.apiBaseUrl}/auth/handoff`, {
    method: "POST",
    credentials: "include",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = String(payload?.message || "The HIVE handoff could not establish an operator session.");
    const error = new Error(detail);
    error.code = String(payload?.error || "hive_handoff_failed");
    throw error;
  }
  return true;
}

try {
  await acceptHiveHandoff();
  notifyHiveParent({ type: "aims-comms-ready" });
} catch (error) {
  const code = String(error?.code || "hive_handoff_failed");
  const message = String(error?.message || "AIMS Comms Hub could not establish the secure HIVE handoff.");
  notifyHiveParent({ type: "aims-comms-error", code, detail: message });
  throw error;
}

const client = new AimsCommsClient({
  baseUrl: config.apiBaseUrl,
});

const state = {
  view: "dashboard",
  bootstrap: null,
  queue: [],
  notifications: [],
  workspace: null,
  selectedConversationId: "",
  selectedContactId: "",
  contactProfile: null,
  contactBusy: false,
  filters: { status: "", channel: "", priority: "", ownerId: "", ownerMode: "", tag: "", overdue: false, aiStatus: "" },
  workspaceContextTab: "details",
  search: "",
  loading: false,
  error: null,
  toast: null,
  sidebarOpen: false,
  notificationOpen: false,
  quarantine: [],
  metrics: null,
  socialStatus: null,
  socialBusy: false,
};

const icons = {
  dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12h-5l-2 3h-2l-2-3H4V4Zm2 2v8h4l2 3 2-3h4V6H6Z"/></svg>`,
  dm: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v13H8l-4 4V4Zm3 4v2h10V8H7Zm0 4v2h7v-2H7Z"/></svg>`,
  comment: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v13H9l-6 4V4Zm3 3v7h11V7H6Zm2 2h7v2H8V9Z"/></svg>`,
  approval: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4 2.6 2.6 4.6-4.6L17 10l-6 6Z"/></svg>`,
  contacts: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z"/></svg>`,
  workflow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h6v5H6V3Zm8 13h4v5h-6v-5h2Zm-9-1h6v5H5v-5Zm4-7v3h6v3h2v-5H11V8H9Z"/></svg>`,
  quarantine: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 6v6c0 5 3.8 9.7 9 10 5.2-.3 9-5 9-10V6l-9-4Zm-1 5h2v7h-2V7Zm0 9h2v2h-2v-2Z"/></svg>`,
  analytics: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16v2H2V3h2v16Zm3-2v-6h3v6H7Zm5 0V7h3v10h-3Zm5 0V4h3v13h-3Z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19.4 13 .1-1-.1-1 2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.4 2.6a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5-.1 1 .1 1-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1L11 21h4l.4-2.6a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5ZM13 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 19.6-5.2-5.2a7 7 0 1 0-1.4 1.4l5.2 5.2 1.4-1.4ZM5 10a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2Zm-8 4h4a2 2 0 0 1-4 0Z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7-1.4-1.4 5.6-5.6-5.6-5.6L9 5Z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 8-1.3 1.5L18 11v9h-5v-6h-2v6H6v-9l-1.7 1.5L3 11l9-8Z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v10.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6V3ZM5 19h14v2H5v-2Z"/></svg>`,
};

const navItems = [
  ["dashboard", "Overview", icons.dashboard],
  ["inbox", "Unified inbox", icons.inbox],
  ["approvals", "Approvals", icons.approval],
  ["contacts", "Contacts", icons.contacts],
  ["workflows", "Workflows", icons.workflow],
  ["quarantine", "Quarantine", icons.quarantine],
  ["analytics", "Analytics", icons.analytics],
  ["settings", "Settings", icons.settings],
];

const inboxSubItems = [
  ["inbox", "All conversations", icons.inbox],
  ["dms", "DMs", icons.dm],
  ["comments", "Comments", icons.comment],
];
const inboxRouteViews = new Set(inboxSubItems.map(([key]) => key));
const routableViews = new Set([...navItems.map(([key]) => key), ...inboxRouteViews]);

function workspaceInboxView() {
  const workspace = state.workspace?.workspace || state.workspace || {};
  const conversation = workspace?.conversation || {};
  const socialThread = conversation?.socialThread || null;
  if (socialThread?.thread_type === "dm") return "dms";
  if (socialThread?.thread_type === "comment") return "comments";
  return "inbox";
}

function activeInboxSubView() {
  if (state.view === "workspace") return workspaceInboxView();
  return inboxRouteViews.has(state.view) ? state.view : "";
}

function isInboxFamilyView() {
  return state.view === "workspace" || inboxRouteViews.has(state.view);
}

function allowedChannelsForView(view = state.view) {
  if (view === "dms") return ["facebook", "instagram"];
  if (view === "comments") return ["facebook", "instagram", "youtube"];
  return null;
}

function normaliseFiltersForView() {
  const allowed = allowedChannelsForView();
  if (allowed && state.filters.channel && !allowed.includes(state.filters.channel)) state.filters.channel = "";
}

function socialInteractionType(row) {
  return String(row?.interaction_type || row?.social_thread_type || row?.thread_type || "").trim().toLowerCase();
}

function isSocialChannel(channel) {
  return ["facebook", "instagram", "youtube"].includes(String(channel || "").toLowerCase());
}

function queueRows({ interactionType = "", socialOnly = false } = {}) {
  const term = state.search.trim().toLowerCase();
  return state.queue.filter((row) => {
    if (!state.filters.status && row.operational_status === "archived") return false;
    if (state.filters.status && row.operational_status !== state.filters.status) return false;
    if (state.filters.channel && row.channel !== state.filters.channel) return false;
    if (state.filters.priority && row.priority_label !== state.filters.priority) return false;
    if (state.filters.ownerId && row.owner_id !== state.filters.ownerId) return false;
    if (state.filters.ownerMode && row.owner_type !== state.filters.ownerMode) return false;
    if (state.filters.overdue && !row.response_overdue) return false;
    if (state.filters.aiStatus && row.ai_status !== state.filters.aiStatus && row.latest_ai_status !== state.filters.aiStatus) return false;
    if (socialOnly && !isSocialChannel(row.channel)) return false;
    if (interactionType && socialInteractionType(row) !== interactionType) return false;
    if (!term) return true;
    return [row.display_name, row.primary_email, row.subject, row.summary_text, row.intent, row.channel, row.social_platform, row.email_account_key, socialInteractionType(row)]
      .some((value) => String(value || "").toLowerCase().includes(term));
  });
}

function toast(message, tone = "success") {
  state.toast = { message, tone };
  render();
  setTimeout(() => {
    if (state.toast?.message === message) {
      state.toast = null;
      render();
    }
  }, 3200);
}

function channelLabel(channel) {
  const labels = { chat: "Chat", email: "Email", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", form: "Form" };
  return labels[channel] || titleCase(channel);
}

function interactionLabel(row) {
  const type = socialInteractionType(row);
  if (type === "dm") return "DM";
  if (type === "comment") return "Comment";
  return channelLabel(row.channel);
}

function auditDetails(event) {
  if (event?.details && typeof event.details === "object") return event.details;
  try { return JSON.parse(event?.details_json || "{}"); } catch { return {}; }
}

function approvalMetadata(approval) {
  if (approval?.metadata && typeof approval.metadata === "object") return approval.metadata;
  try { return JSON.parse(approval?.metadata_json || "{}"); } catch { return {}; }
}

function statusPill(status) {
  return `<span class="pill pill-${escapeHtml(status || "unknown")}">${escapeHtml(titleCase(status || "unknown"))}</span>`;
}

function priorityPill(priority) {
  return `<span class="priority priority-${escapeHtml(priority || "low")}"><span></span>${escapeHtml(titleCase(priority || "low"))}</span>`;
}

function emptyState(title, copy) {
  return `<div class="empty-state"><div class="empty-mark">${icons.inbox}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div>`;
}

function shell(content) {
  const identity = state.bootstrap?.identity || { actor: "Unknown", role: "read_only" };
  const unread = state.notifications.filter((item) => item.status !== "read").length;
  return `
    <div class="layout ${state.sidebarOpen ? "sidebar-open" : ""} ${config.embedded ? "embedded" : ""}">
      <a class="skip-link" href="#aims-main-content">Skip to main content</a>
      <button class="scrim" data-action="close-sidebar" aria-label="Close navigation"></button>
      <aside class="sidebar" id="aims-sidebar" aria-label="AIMS navigation">
        <div class="brand">
          <div class="brand-mark"><span>A</span></div>
          <div><strong>AIMS</strong><small>Comms Hub</small></div>
          <button class="icon-button mobile-only" data-action="close-sidebar" aria-label="Close navigation">${icons.close}</button>
        </div>
        <nav aria-label="Primary">
          ${navItems.map(([key, label, icon]) => key === "inbox" ? `
            <div class="nav-group ${isInboxFamilyView() ? "open" : ""}">
              <button class="nav-item ${isInboxFamilyView() ? "active" : ""}" data-view="inbox" aria-expanded="${isInboxFamilyView() ? "true" : "false"}" ${state.view === "inbox" ? 'aria-current="page"' : ""}>
                ${icon}<span>${escapeHtml(label)}</span><span class="nav-group-chevron">⌄</span>
              </button>
              <div class="nav-submenu" aria-label="Unified inbox sections">
                ${inboxSubItems.slice(1).map(([subKey, subLabel, subIcon]) => `
                  <button class="nav-subitem ${activeInboxSubView() === subKey ? "active" : ""}" data-view="${subKey}" ${activeInboxSubView() === subKey ? 'aria-current="page"' : ""}>
                    ${subIcon}<span>${escapeHtml(subLabel)}</span>
                  </button>
                `).join("")}
              </div>
            </div>
          ` : `
            <button class="nav-item ${state.view === key ? "active" : ""}" data-view="${key}" ${state.view === key ? 'aria-current="page"' : ""}>
              ${icon}<span>${escapeHtml(label)}</span>
              ${key === "approvals" && pendingApprovals().length ? `<b>${pendingApprovals().length}</b>` : ""}
            </button>
          `).join("")}
        </nav>
        <div class="sidebar-footer">
          <a class="hive-home-link" href="${escapeHtml(config.hiveHomeUrl)}" aria-label="Return to HIVE">${icons.home}<span>Back to HIVE</span></a>
          <div class="service-card">
            <span class="service-dot live"></span>
            <div><strong>Live gateway</strong><small>${escapeHtml(config.apiBaseUrl)}</small></div>
          </div>
          <div class="user-card">
            <div class="avatar">${escapeHtml(String(identity.actor || "U").charAt(0).toUpperCase())}</div>
            <div><strong>${escapeHtml(identity.actor || "Unknown")}</strong><small>${escapeHtml(titleCase(identity.role || "read_only"))}</small></div>
          </div>
        </div>
      </aside>
      <main class="main" id="aims-main-content" tabindex="-1">
        ${config.embedded ? `
        <nav class="embedded-nav" aria-label="Communications sections">
          <div class="embedded-nav-scroll">
            ${navItems.map(([key, label, icon]) => `
              <button class="embedded-nav-item ${key === "inbox" ? (isInboxFamilyView() ? "active" : "") : (state.view === key ? "active" : "")}" data-view="${key}" ${(key === "inbox" ? state.view === "inbox" : state.view === key) ? 'aria-current="page"' : ""}>
                ${icon}<span>${escapeHtml(label)}</span>
                ${key === "approvals" && pendingApprovals().length ? `<b>${pendingApprovals().length}</b>` : ""}
              </button>
            `).join("")}
          </div>
          <button class="embedded-notification-button" data-action="toggle-notifications" aria-label="Notifications" aria-expanded="${state.notificationOpen}" aria-controls="notification-panel">
            ${icons.bell}${unread ? `<span>${unread}</span>` : ""}
          </button>
        </nav>
        ${isInboxFamilyView() ? `
          <nav class="embedded-inbox-subnav" aria-label="Unified inbox sections">
            <div class="embedded-inbox-subnav-scroll">
              ${inboxSubItems.map(([subKey, subLabel, subIcon]) => `
                <button class="embedded-inbox-subnav-item ${activeInboxSubView() === subKey ? "active" : ""}" data-view="${subKey}" ${activeInboxSubView() === subKey ? 'aria-current="page"' : ""}>
                  ${subIcon}<span>${escapeHtml(subLabel)}</span>
                </button>
              `).join("")}
            </div>
          </nav>
        ` : ""}
        ` : `
        <header class="topbar">
          <button class="icon-button mobile-only aims-menu-trigger" data-action="open-sidebar" aria-label="Open AIMS navigation" aria-expanded="${state.sidebarOpen}" aria-controls="aims-sidebar">${icons.menu}</button>
          <div class="mobile-title"><strong>${escapeHtml(config.productName)}</strong><span>${escapeHtml(titleCase(state.view))}</span></div>
          <label class="global-search">
            ${icons.search}
            <input id="global-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search queue, contact or conversation" autocomplete="off" aria-label="Search conversations">
            <kbd>⌘ K</kbd>
          </label>
          <button class="icon-button notification-button" data-action="toggle-notifications" aria-label="Notifications" aria-expanded="${state.notificationOpen}" aria-controls="notification-panel">
            ${icons.bell}${unread ? `<span>${unread}</span>` : ""}
          </button>
        </header>
        `}
        <div class="content">${content}</div>
      </main>
      ${notificationPanel()}
      ${state.toast ? `<div class="toast toast-${escapeHtml(state.toast.tone)}" role="${state.toast.tone === "error" ? "alert" : "status"}" aria-live="${state.toast.tone === "error" ? "assertive" : "polite"}" aria-atomic="true">${escapeHtml(state.toast.message)}</div>` : ""}
    </div>
  `;
}

function notificationPanel() {
  if (!state.notificationOpen) return "";
  return `
    <aside class="notification-panel" id="notification-panel" role="dialog" aria-labelledby="notification-panel-title" tabindex="-1">
      <header><div><strong id="notification-panel-title">Notifications</strong><span>${state.notifications.length} recent</span></div><button class="icon-button" data-action="toggle-notifications" aria-label="Close notifications">${icons.close}</button></header>
      <div class="notification-list">
        ${state.notifications.length ? state.notifications.map((item) => `
          <button type="button" class="notification-item severity-${escapeHtml(item.severity || "info")}" data-notification-id="${escapeHtml(item.id)}" data-conversation-id="${escapeHtml(item.conversation_id || "")}">
            <span class="notification-dot"></span>
            <span><strong>${escapeHtml(item.title || titleCase(item.type))}</strong><small>${escapeHtml(item.body_text || "")}</small><time>${escapeHtml(formatRelativeTime(item.created_at))}</time></span>
          </button>
        `).join("") : emptyState("No notifications", "The signal shelf is clear.")}
      </div>
    </aside>
  `;
}

function pageHeader(title, copy, actions = "") {
  return `<section class="page-header"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div><div class="page-actions">${actions}</div></section>`;
}

function summaryCards() {
  const rows = state.queue;
  const open = rows.filter((row) => ["open", "pending", "escalated"].includes(row.operational_status)).length;
  const approvals = pendingApprovals().length;
  const overdue = rows.filter((row) => row.response_overdue).length;
  const automated = rows.filter((row) => row.owner_type === "automation").length;
  const automationRate = rows.length ? Math.round((automated / rows.length) * 100) : 0;
  return `
    <div class="summary-grid">
      ${summaryCard("Open conversations", open, "Across every channel", "blue")}
      ${summaryCard("Needs review", approvals, "Approval-gated actions", "purple")}
      ${summaryCard("Response overdue", overdue, overdue ? "Needs attention now" : "Targets are clear", overdue ? "red" : "green")}
      ${summaryCard("Automation assigned", `${automationRate}%`, `${automated} of ${rows.length || 0} conversations`, "cyan")}
    </div>
  `;
}

function summaryCard(label, value, foot, tone) {
  return `<article class="summary-card tone-${tone}"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(foot)}</small></div><div class="summary-spark"><i></i><i></i><i></i><i></i><i></i></div></article>`;
}

function themedSelect({ id = "", name = "", value = "", options = [], ariaLabel = "Select", dataFilter = "", disabled = false, className = "" } = {}) {
  const selected = options.find((option) => String(option.value) === String(value));
  const label = selected?.label || (value ? titleCase(value) : options[0]?.label || "Select");
  const selectId = id ? ` id="${escapeHtml(id)}"` : "";
  const selectName = name ? ` name="${escapeHtml(name)}"` : "";
  const filterAttr = dataFilter ? ` data-filter="${escapeHtml(dataFilter)}"` : "";
  return `<div class="themed-select ${escapeHtml(className)} ${disabled ? "disabled" : ""}" data-themed-select>
    <select class="themed-select-proxy"${selectId}${selectName}${filterAttr} aria-label="${escapeHtml(ariaLabel)}" ${disabled ? "disabled" : ""} tabindex="-1">
      ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>
    <button class="themed-select-trigger" type="button" data-themed-select-trigger aria-haspopup="listbox" aria-expanded="false" ${disabled ? "disabled" : ""}><span>${escapeHtml(label)}</span><b aria-hidden="true">⌄</b></button>
    <div class="themed-select-menu" role="listbox" aria-label="${escapeHtml(ariaLabel)}">
      ${options.map((option) => `<button type="button" class="themed-select-option ${String(option.value) === String(value) ? "selected" : ""}" data-themed-select-value="${escapeHtml(option.value)}" role="option" aria-selected="${String(option.value) === String(value)}">${escapeHtml(option.label)}</button>`).join("")}
    </div>
  </div>`;
}

function filterBar(compact = false, allowedChannels = null) {
  const optionSet = (values, blank) => [{ value: "", label: blank }, ...values.map((value) => ({ value, label: titleCase(value) }))];
  return `
    <div class="filter-bar ${compact ? "compact" : ""}">
      ${themedSelect({ value: state.filters.status, dataFilter: "status", ariaLabel: "Filter by status", options: optionSet(["open", "pending", "snoozed", "resolved", "blocked", "quarantined", "archived", "escalated"], "All statuses") })}
      ${themedSelect({ value: state.filters.channel, dataFilter: "channel", ariaLabel: "Filter by channel", options: optionSet(allowedChannels || ["chat", "email", "instagram", "facebook", "youtube", "form"], "All channels") })}
      ${themedSelect({ value: state.filters.priority, dataFilter: "priority", ariaLabel: "Filter by priority", options: optionSet(["critical", "high", "medium", "low"], "All priorities") })}
      <label class="check-filter"><input type="checkbox" data-filter="overdue" ${state.filters.overdue ? "checked" : ""}><span>Overdue only</span></label>
      <button class="text-button" data-action="clear-filters">Clear</button>
    </div>
  `;
}

function quickFilterBar() {
  const active = (key) => {
    if (key === "all") return !state.filters.status && !state.filters.priority && !state.filters.overdue && !state.filters.ownerMode;
    if (key === "overdue") return state.filters.overdue;
    if (key === "open") return state.filters.status === "open";
    if (key === "high") return state.filters.priority === "high";
    if (key === "mine") return state.filters.ownerMode === "person";
    return false;
  };
  return `<div class="quick-filters" aria-label="Quick inbox filters">
    <span>Quick views</span>
    ${[["all", "All"], ["overdue", "Overdue"], ["open", "Open"], ["high", "High priority"], ["mine", "Assigned to me"]].map(([key, label]) => `<button type="button" class="quick-filter ${active(key) ? "active" : ""}" data-quick-filter="${key}" aria-pressed="${active(key)}">${label}</button>`).join("")}
  </div>`;
}

function queueTable(rows = queueRows(), limit = 50, compact = false) {
  const visible = rows.slice(0, limit);
  if (!visible.length) return emptyState("No matching conversations", "Change the filters or search terms. Nothing is hiding under the rug.");
  return `
    <div class="queue-wrap">
      <table class="queue-table ${compact ? "queue-table-compact" : ""}">
        <thead><tr><th>Conversation</th><th>Channel</th><th>Type</th><th>Priority</th><th>Status</th><th>Age</th><th>Owner</th><th>AI</th><th><span class="sr-only">Open</span></th></tr></thead>
        <tbody>
          ${visible.map((row) => `
            <tr data-conversation-id="${escapeHtml(row.id)}" tabindex="0" aria-label="Open conversation with ${escapeHtml(row.display_name || row.primary_email || "Unknown contact")}">
              <td><div class="conversation-cell"><div class="channel-avatar channel-${escapeHtml(row.channel)}">${escapeHtml(channelLabel(row.channel).charAt(0))}</div><div><strong>${escapeHtml(row.display_name || row.primary_email || "Unknown contact")}</strong><span>${escapeHtml(row.subject || row.summary_text || "Conversation")}</span><small>${escapeHtml(row.summary_text || "")}${row.last_auto_sent_at ? ` · Sent automatically ${escapeHtml(formatRelativeTime(row.last_auto_sent_at))}` : ""}</small></div></div></td>
              <td><span class="channel-label channel-label-${escapeHtml(row.channel)}">${escapeHtml(channelLabel(row.channel))}</span></td>
              <td><span class="interaction-label interaction-${escapeHtml(socialInteractionType(row) || row.channel)}">${escapeHtml(interactionLabel(row))}</span></td>
              <td>${priorityPill(row.priority_label)}</td>
              <td>${statusPill(row.operational_status)}</td>
              <td><span class="age ${row.response_overdue ? "overdue" : ""}">${escapeHtml(secondsToAge(row.age_seconds))}</span></td>
              <td><span class="owner">${row.owner_type === "person" ? `<i>J</i>Me` : row.owner_type === "automation" ? `<i>A</i>Automated` : row.owner_id ? `<i>${escapeHtml(row.owner_id.charAt(0).toUpperCase())}</i>Assigned` : "Automated"}</span></td>
              <td><span class="ai-state risk-${escapeHtml(row.risk_level || "unknown")}">${escapeHtml(titleCase(row.intent || "Unanalysed"))}</span></td>
              <td><button class="row-arrow" data-conversation-id="${escapeHtml(row.id)}" aria-label="Open conversation">${icons.arrow}</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="queue-cards" aria-label="Conversations">
        ${visible.map((row) => `
          <button type="button" class="queue-card" data-conversation-id="${escapeHtml(row.id)}">
            <span class="queue-card-head">
              <span class="channel-avatar channel-${escapeHtml(row.channel)}">${escapeHtml(channelLabel(row.channel).charAt(0))}</span>
              <span class="queue-card-title"><strong>${escapeHtml(row.display_name || row.primary_email || "Unknown contact")}</strong><span>${escapeHtml(row.subject || row.summary_text || "Conversation")}</span></span>
              ${priorityPill(row.priority_label)}
            </span>
            <span class="queue-card-tags"><span class="channel-label channel-label-${escapeHtml(row.channel)}">${escapeHtml(channelLabel(row.channel))}</span><span class="interaction-label interaction-${escapeHtml(socialInteractionType(row) || row.channel)}">${escapeHtml(interactionLabel(row))}</span>${statusPill(row.operational_status)}${row.last_auto_sent_at ? `<span class="pill pill-auto-sent">Auto-sent</span>` : ""}</span>
            <span class="queue-card-meta"><span><b>Response</b>${escapeHtml(row.response_due_at ? formatDateTime(row.response_due_at) : secondsToAge(row.age_seconds))}${row.response_overdue ? ` <em>Overdue</em>` : ""}</span><span><b>Owner</b>${row.owner_type === "person" ? "Me" : row.owner_type === "automation" ? "Automated" : "Assigned"}</span><span><b>AI</b>${escapeHtml(titleCase(row.intent || "Unanalysed"))}</span></span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function dashboardView() {
  const urgent = [...state.queue].sort((a, b) => Number(b.response_overdue) - Number(a.response_overdue) || Number(b.priority_score || 0) - Number(a.priority_score || 0)).slice(0, 5);
  const channelCounts = Object.entries(state.queue.reduce((acc, row) => ({ ...acc, [row.channel]: (acc[row.channel] || 0) + 1 }), {}));
  const maximum = Math.max(1, ...channelCounts.map(([, count]) => count));
  return shell(`
    ${pageHeader("Overview", "One calm surface for conversations, approvals and provider health.", `<button class="button secondary" data-action="refresh">Refresh data</button><button class="button primary" data-view="inbox">Open inbox</button>`)}
    ${summaryCards()}
    <div class="dashboard-grid">
      <section class="panel panel-wide">
        <header class="panel-header"><div><strong>Priority queue</strong><span>Sorted by overdue state and AIMS priority</span></div><button class="text-button" data-view="inbox">View all</button></header>
        ${queueTable(urgent, 5, true)}
      </section>
      <section class="panel channel-panel">
        <header class="panel-header"><div><strong>Channel mix</strong><span>Current queue distribution</span></div></header>
        <div class="channel-bars">
          ${channelCounts.map(([channel, count]) => `<div><span>${escapeHtml(channelLabel(channel))}</span><div><i style="width:${Math.round((count / maximum) * 100)}%"></i></div><b>${count}</b></div>`).join("") || `<p class="muted">No queue records yet.</p>`}
        </div>
        <div class="health-strip"><span class="service-dot ${state.error ? "warning" : "live"}"></span><div><strong>${state.error ? "Gateway attention required" : "Console data loaded"}</strong><small>Protected AIMS API</small></div></div>
      </section>
    </div>
  `);
}

function inboxView() {
  return shell(`
    ${pageHeader("Unified inbox", "Filter and triage every supported channel without losing the thread.", `<button class="button secondary" data-action="refresh">Refresh queue</button>`)}
    <section class="panel inbox-panel">
      <header class="panel-header stacked"><div><strong>${queueRows().length} conversations</strong><span>Live filters remain local until refresh, preventing accidental query storms.</span></div>${quickFilterBar()}${filterBar()}</header>
      ${queueTable()}
    </section>
  `);
}

function socialPlatformSummary(rows) {
  const counts = { facebook: 0, instagram: 0, youtube: 0 };
  for (const row of rows) if (row.channel in counts) counts[row.channel] += 1;
  return `<div class="social-platform-summary">${Object.entries(counts).map(([platform, count]) => `<span class="channel-label channel-label-${platform}">${escapeHtml(channelLabel(platform))} <b>${count}</b></span>`).join("")}</div>`;
}

function socialGroupView(type) {
  const isDm = type === "dm";
  const allowedChannels = isDm ? ["facebook", "instagram"] : ["facebook", "instagram", "youtube"];
  const rows = queueRows({ interactionType: type, socialOnly: true });
  const title = isDm ? "DMs" : "Comments";
  const copy = isDm
    ? "Private Facebook and Instagram conversations grouped in one operator queue."
    : "Facebook, Instagram and YouTube comments grouped separately from private messages.";
  return shell(`
    ${pageHeader(title, copy, `<button class="button secondary" data-action="refresh">Refresh ${isDm ? "DMs" : "comments"}</button>`)}
    <section class="panel inbox-panel social-group-panel">
      <header class="panel-header stacked"><div><strong>${rows.length} ${isDm ? "DM conversations" : "comment threads"}</strong><span>${isDm ? "YouTube does not expose a private DM lane here." : "Public interaction work stays out of the private-message queue."}</span>${socialPlatformSummary(rows)}</div>${filterBar(false, allowedChannels)}</header>
      ${queueTable(rows)}
    </section>
  `);
}

function dmsView() { return socialGroupView("dm"); }
function commentsView() { return socialGroupView("comment"); }

function pendingApprovals() {
  const approvals = [];
  for (const row of state.queue) {
    if (row.escalation_required || ["medium", "high", "critical"].includes(row.risk_level)) {
      approvals.push({ id: `approval-${row.id}`, conversationId: row.id, title: row.subject, contact: row.display_name, action: row.abuse_label && row.abuse_label !== "none" ? "Moderation action" : "Reply review", risk: row.risk_level, priority: row.priority_label, rationale: row.next_action });
    }
  }
  return approvals;
}

function approvalsView() {
  const approvals = pendingApprovals();
  return shell(`
    ${pageHeader("Approvals", "Risky actions remain parked until an authorised reviewer makes the decision.")}
    <div class="cards-list">
      ${approvals.length ? approvals.map((approval) => `
        <article class="approval-card">
          <div class="approval-icon">${icons.approval}</div>
          <div class="approval-copy"><div>${priorityPill(approval.priority)}<span class="risk-label">${escapeHtml(titleCase(approval.risk || "unknown"))} risk</span></div><h3>${escapeHtml(approval.title)}</h3><p>${escapeHtml(approval.rationale || "Review the evidence and action scope.")}</p><small>${escapeHtml(approval.contact || "Unknown contact")} · ${escapeHtml(approval.action)}</small></div>
          <div class="approval-actions"><button class="button secondary" data-conversation-id="${escapeHtml(approval.conversationId)}">Review context</button></div>
        </article>
      `).join("") : emptyState("No approvals waiting", "The approval runway is clear.")}
    </div>
  `);
}

function contactsView() {
  const contacts = [...new Map(state.queue
    .filter((row) => row.contact_id && !(row.display_name === "Deleted contact" && !row.primary_email))
    .map((row) => [row.contact_id, row])).values()];
  const role = state.bootstrap?.identity?.role || "read_only";
  const canEdit = roleAllows(role, "identity");
  const canDelete = roleAllows(role, "retention");
  const profile = state.contactProfile?.profile || state.contactProfile || null;
  const contact = profile?.contact || null;
  const editor = contact ? `
    <section class="panel contact-editor">
      <header class="panel-header stacked"><div><strong>Manage contact</strong><span>${profile.conversations?.length || 0} linked conversation${profile.conversations?.length === 1 ? "" : "s"}</span></div><button class="icon-button" type="button" data-action="close-contact" aria-label="Close contact editor">${icons.close}</button></header>
      <form id="contact-edit-form" class="contact-edit-form">
        <label><span>Name</span><input name="displayName" maxlength="300" value="${escapeHtml(contact.display_name || "")}" ${canEdit ? "" : "disabled"}></label>
        <label><span>Email</span><input name="primaryEmail" type="email" maxlength="320" value="${escapeHtml(contact.primary_email || "")}" ${canEdit ? "" : "disabled"}></label>
        <label><span>Phone</span><input name="phone" maxlength="100" value="${escapeHtml(contact.phone || "")}" ${canEdit ? "" : "disabled"}></label>
        <div class="contact-edit-actions">
          <span>Deleting a contact keeps linked conversations intact and reassigns them to a non-personal placeholder.</span>
          <div class="button-row">
            ${canDelete ? `<button class="button danger" type="button" data-action="delete-contact" ${state.contactBusy ? "disabled" : ""}>Delete contact</button>` : ""}
            ${canEdit ? `<button class="button primary" type="submit" ${state.contactBusy ? "disabled" : ""}>Save changes</button>` : ""}
          </div>
        </div>
      </form>
    </section>
  ` : state.contactBusy ? `<section class="panel contact-editor" role="status" aria-live="polite" aria-busy="true"><p class="muted">Loading contact…</p></section>` : "";
  return shell(`
    ${pageHeader("Contacts", "Edit contact details without breaking the conversation history anchored to each record.")}
    ${editor}
    <section class="panel contacts-panel">
      <div class="contact-grid">
        ${contacts.map((row) => `<article class="contact-card"><div class="avatar large">${escapeHtml((row.display_name || "U").charAt(0))}</div><div><strong>${escapeHtml(row.display_name || "Unknown contact")}</strong><span>${escapeHtml(row.primary_email || `${channelLabel(row.channel)} identity`)}</span><small>${escapeHtml(channelLabel(row.channel))} · ${escapeHtml(titleCase(row.intent || "unclassified"))}</small></div><div class="contact-card-actions"><button class="button secondary compact" type="button" data-contact-id="${escapeHtml(row.contact_id)}">Manage</button><button class="icon-button" type="button" data-conversation-id="${escapeHtml(row.id)}" aria-label="Open latest conversation">${icons.arrow}</button></div></article>`).join("") || emptyState("No contacts", "Contacts will appear after the first accepted conversation.")}
      </div>
    </section>
  `);
}

function workflowsView() {
  const workflowGroups = state.queue.reduce((acc, row) => ({ ...acc, [row.workflow || "unassigned"]: (acc[row.workflow || "unassigned"] || 0) + 1 }), {});
  return shell(`
    ${pageHeader("Workflows", "A readable control surface for AIMS workflow definitions, runs and delayed actions.")}
    <div class="workflow-grid">
      ${Object.entries(workflowGroups).map(([name, count]) => `<article class="workflow-card"><div class="workflow-node">${icons.workflow}</div><div><strong>${escapeHtml(titleCase(name))}</strong><span>${count} active conversation${count === 1 ? "" : "s"}</span><small>Definition and transition controls connect through the protected gateway.</small></div><button class="button secondary" data-view="inbox">Inspect queue</button></article>`).join("") || emptyState("No workflow activity", "Definitions will appear after the backend returns workflow records.")}
    </div>
  `);
}

function quarantineView() {
  return shell(`
    ${pageHeader("Quarantine", "Failures stay inspectable and replayable without quietly duplicating provider actions.", `<button class="button secondary" data-action="load-quarantine">Refresh</button>`)}
    <section class="panel">
      ${state.quarantine.length ? `<div class="quarantine-list">${state.quarantine.map((item) => `<article><div><span class="pill pill-quarantined">${escapeHtml(titleCase(item.failure_class || "unknown"))}</span><h3>${escapeHtml(item.source || "Comms Hub failure")}</h3><p>${escapeHtml(item.error || "No error detail supplied.")}</p><small>${escapeHtml(formatDateTime(item.created_at))} · ${Number(item.attempts || 0)} attempts</small></div><div><button class="button secondary" data-conversation-id="${escapeHtml(item.conversation_id || "")}">Context</button>${roleAllows(state.bootstrap?.identity?.role, "quarantine") ? `<button class="button primary" data-replay-id="${escapeHtml(item.id)}">Replay safely</button>` : ""}</div></article>`).join("")}</div>` : emptyState("Quarantine is clear", "No classified failures are waiting for review.")}
    </section>
  `);
}

function analyticsView() {
  const metrics = state.metrics || {};
  const byChannel = metrics.volume?.byChannel || {};
  const maximum = Math.max(1, ...Object.values(byChannel));
  return shell(`
    ${pageHeader("Analytics", "Volume, response, resolution, automation and failure signals without decorative fog.", `<button class="button secondary" data-action="load-metrics">Refresh metrics</button>`)}
    <div class="metric-grid">
      ${summaryCard("Conversation volume", metrics.volume?.total ?? state.queue.length, "Selected reporting window", "blue")}
      ${summaryCard("Median response", `${metrics.response?.medianMinutes ?? "–"}m`, `${metrics.response?.overdue ?? 0} overdue`, "cyan")}
      ${summaryCard("Resolution rate", `${Math.round((metrics.resolution?.rate || 0) * 100)}%`, `${metrics.resolution?.resolved ?? 0} resolved`, "green")}
      ${summaryCard("Failure rate", `${((metrics.failures?.rate || 0) * 100).toFixed(1)}%`, `${metrics.failures?.total ?? 0} failures`, "red")}
    </div>
    <section class="panel analytics-panel">
      <header class="panel-header"><div><strong>Volume by channel</strong><span>Relative share in the current reporting window</span></div></header>
      <div class="analytics-bars">${Object.entries(byChannel).map(([channel, count]) => `<div><span>${escapeHtml(channelLabel(channel))}</span><div><i style="width:${Math.round((count / maximum) * 100)}%"></i></div><b>${count}</b></div>`).join("")}</div>
    </section>
  `);
}

function settingsView() {
  const identity = state.bootstrap?.identity || {};
  const social = state.socialStatus?.monitoring || {};
  const channels = social.channels || {};
  const canManageSocial = roleAllows(identity.role || "read_only", "social_setup");
  return shell(`
    ${pageHeader("Settings", "Deployment-visible configuration only. Secrets remain in the gateway and AIMS.", `<button class="button secondary" data-action="load-social-status">Refresh social status</button>`)}
    <div class="settings-grid">
      <section class="panel settings-card"><h3>Console connection</h3><dl><div><dt>API gateway</dt><dd>${escapeHtml(config.apiBaseUrl)}</dd></div><div><dt>Mode</dt><dd>Live</dd></div><div><dt>API version</dt><dd>${escapeHtml(state.bootstrap?.apiVersion || "Unknown")}</dd></div></dl></section>
      <section class="panel settings-card"><h3>Verified identity</h3><dl><div><dt>Actor</dt><dd>${escapeHtml(identity.actor || "Unknown")}</dd></div><div><dt>Role</dt><dd>${escapeHtml(titleCase(identity.role || "read_only"))}</dd></div><div><dt>Strategy</dt><dd>${escapeHtml(identity.strategy || "Unknown")}</dd></div></dl></section>
      <section class="panel settings-card social-settings-card"><h3>Social channel setup</h3>
        <div class="social-status-strip"><span class="pill ${social.monitorOnly ? "pill-pending" : "pill-open"}">${social.monitorOnly ? "Monitoring only" : "Outbound enabled"}</span><span>${social.pollWorkerEnabled ? "Poll worker enabled" : "Poll worker disabled"}</span></div>
        <div class="social-capability-grid">
          ${["facebook", "instagram", "youtube"].map((platform) => { const cap = channels[platform] || {}; return `<article><strong>${escapeHtml(channelLabel(platform))}</strong><span>${cap.enabled ? "Configured" : "Disabled"}</span><small>${cap.directMessages ? "DMs + comments" : "Comments only"}</small></article>`; }).join("")}
        </div>
        ${canManageSocial ? `<div class="button-row"><button class="button secondary" data-action="reconcile-social" ${state.socialBusy ? "disabled aria-busy=\"true\"" : ""}>Reconcile webhooks</button><button class="button secondary" data-action="poll-social" ${state.socialBusy ? "disabled aria-busy=\"true\"" : ""}>Run poll now</button></div>${state.socialBusy ? `<p class="async-status" role="status" aria-live="polite">Updating social provider status…</p>` : ""}` : ""}
      </section>
      <section class="panel settings-card"><h3>Responsive contract</h3><dl><div><dt>Minimum width</dt><dd>${escapeHtml(state.bootstrap?.responsiveContract?.minimumWidth || 320)}px</dd></div><div><dt>Pagination</dt><dd>${escapeHtml(state.bootstrap?.responsiveContract?.pagination || "cursor")}</dd></div><div><dt>Actions</dt><dd>${escapeHtml((state.bootstrap?.responsiveContract?.actions || []).join(", "))}</dd></div></dl></section>
      <section class="panel settings-card"><h3>Security boundary</h3><p>The browser holds no AIMS delegation secret. HIVE identity verification and HMAC signing happen in the edge gateway before AIMS performs its own RBAC checks.</p></section>
    </div>
  `);
}

function workspaceView() {
  if (state.loading && !state.workspace) return shell(`${pageHeader("Conversation", "Loading the verified thread and operational context.")}<div class="workspace-skeleton" role="status" aria-live="polite" aria-busy="true"><span class="sr-only">Loading conversation</span><i></i><i></i><i></i></div>`);
  if (!state.workspace) return shell(`${pageHeader("Conversation unavailable", "The requested workspace could not be loaded.")} ${emptyState("No conversation selected", "Return to the unified inbox and choose a conversation.")}`);
  const workspace = state.workspace.workspace || state.workspace;
  const conversation = workspace.conversation || {};
  const contact = conversation.contact || {};
  const operations = workspace.operations || {};
  const aiState = workspace.ai?.state || workspace.ai?.summary || {};
  const drafts = workspace.ai?.drafts || [];
  const approvals = workspace.ai?.approvals || [];
  const pendingApproval = approvals.find((approval) => approval.status === "pending") || null;
  const latestAutoSent = (workspace.audit || []).find((event) => event.action === "autonomous_reply_sent") || null;
  const latestAutoSentDetails = auditDetails(latestAutoSent);
  const executableModerationApprovals = approvals.filter((approval) => approval.target_type === "moderation_action" && approval.status === "approved");
  const attachments = conversation.attachments || workspace.attachments || [];
  const socialThread = conversation.socialThread || null;
  const socialCapabilities = socialThread ? (state.socialStatus?.monitoring?.channels?.[socialThread.platform] || {}) : null;
  const socialMonitorOnly = state.socialStatus?.monitoring?.monitorOnly === true;
  const role = state.bootstrap?.identity?.role || "read_only";
  const canReply = roleAllows(role, "reply");
  const canApprove = roleAllows(role, "approve");
  const currentStatus = operations.operational_status || conversation.status || "open";
  const actor = state.bootstrap?.identity?.actor || "Jonathan";
  const assignedToMe = operations.owner_type === "person";
  return shell(`
    <section class="workspace-header">
      <button class="back-button" data-view="${workspaceInboxView()}">‹ <span>${workspaceInboxView() === "dms" ? "DMs" : workspaceInboxView() === "comments" ? "Comments" : "Inbox"}</span></button>
      <div><nav class="workspace-breadcrumb" aria-label="Breadcrumb"><button type="button" data-view="inbox">Unified inbox</button><span>/</span>${workspaceInboxView() !== "inbox" ? `<button type="button" data-view="${workspaceInboxView()}">${workspaceInboxView() === "dms" ? "DMs" : "Comments"}</button><span>/</span>` : ""}<strong>${escapeHtml(conversation.subject || "Conversation")}</strong></nav><div class="workspace-title"><h1>${escapeHtml(conversation.subject || "Conversation")}</h1>${statusPill(operations.operational_status || conversation.status)}</div><p>${escapeHtml(contact.display_name || contact.primary_email || "Unknown contact")} · ${escapeHtml(channelLabel(conversation.channel))} · Updated ${escapeHtml(formatRelativeTime(conversation.last_message_at))}</p></div>
      <div class="workspace-actions">
        ${canReply ? `<button class="button secondary" data-action="analyse">Run AI analysis</button>` : ""}
        ${currentStatus === "archived" ? `<span class="archive-state">Archived</span>` : themedSelect({ id: "workspace-status", value: currentStatus, ariaLabel: "Conversation status", disabled: !roleAllows(role, "status"), className: "workspace-status-select", options: ["open", "pending", "snoozed", "resolved", "blocked", "quarantined", "escalated"].map((status) => ({ value: status, label: titleCase(status) })) })}
        ${currentStatus === "resolved" && roleAllows(role, "status") ? `<button class="button secondary archive-button" type="button" data-action="archive-conversation">Archive completed</button>` : ""}
        ${roleAllows(role, "retention") ? `<button class="button danger" type="button" data-action="delete-conversation">Delete conversation</button>` : ""}
      </div>
    </section>
    <div class="workspace-grid">
      <section class="panel thread-panel">
        <header class="panel-header"><div><strong>Conversation</strong><span>${conversation.messages?.length || 0} messages</span></div><span class="channel-label channel-label-${escapeHtml(conversation.channel)}">${escapeHtml(channelLabel(conversation.channel))}</span></header>
        <div class="message-thread">
          ${(conversation.messages || []).map((message) => `<article class="message ${message.direction === "outbound" ? "outbound" : "inbound"}"><div class="message-avatar">${escapeHtml((message.sender || (message.direction === "outbound" ? "A" : "V")).charAt(0).toUpperCase())}</div><div><header><strong>${escapeHtml(message.sender || (message.direction === "outbound" ? "AIMS" : contact.display_name || "Visitor"))}</strong><time>${escapeHtml(formatDateTime(message.received_at || message.created_at))}</time></header><p>${escapeHtml(message.body_text || "")}</p></div></article>`).join("") || emptyState("No messages", "The conversation record contains no message bodies.")}
        </div>
        ${canReply ? `
          <form id="reply-form" class="reply-composer">
            <textarea name="message" rows="3" maxlength="20000" placeholder="Write an operator reply…" aria-label="Operator reply" required ${socialThread && socialMonitorOnly ? "disabled" : ""}></textarea>
            ${socialThread?.thread_type === "comment" && socialCapabilities?.privateCommentReplies ? `<label class="reply-mode"><span>Reply mode</span>${themedSelect({ name: "replyMode", value: "public", ariaLabel: "Reply mode", disabled: socialMonitorOnly, options: [{ value: "public", label: "Public comment" }, { value: "private", label: "Private reply" }] })}</label>` : ""}
            <div><span>${socialThread && socialMonitorOnly ? "Monitoring-only mode is active; outbound social actions are locked." : conversation.channel === "email" && ["admin", "newsletter"].includes(String(workspace.emailThread?.account_key || "").toLowerCase()) ? `Manual reply from ${escapeHtml(String(workspace.emailThread?.account_key || ""))}@jonathan-harris.online. Initial-response timing policy still applies.` : `Sent through ${escapeHtml(channelLabel(conversation.channel))}; AIMS applies provider and approval rules.`}</span><button class="button primary" type="submit" ${socialThread && socialMonitorOnly ? "disabled" : ""}>${socialThread?.thread_type === "dm" ? "Send DM" : "Send reply"}</button></div>
          </form>
        ` : `<div class="read-only-banner">Read-only role. Reply and mutation controls are disabled.</div>`}
      </section>
      <nav class="workspace-context-tabs" aria-label="Conversation context">
        ${[["details", "Details"], ["ai", "AI"], ...(socialThread ? [["actions", "Actions"]] : []), ["notes", "Notes"]].map(([key, label]) => `<button type="button" data-workspace-context="${key}" class="${state.workspaceContextTab === key ? "active" : ""}" aria-pressed="${state.workspaceContextTab === key}">${label}</button>`).join("")}
      </nav>
      <aside class="workspace-aside">
        <section class="panel detail-card ${state.workspaceContextTab === "details" ? "context-active" : ""}" data-context-section="details">
          <header><strong>Contact</strong></header>
          <div class="contact-hero"><div class="avatar large">${escapeHtml((contact.display_name || "U").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(contact.display_name || "Unknown contact")}</strong><span>${escapeHtml(contact.primary_email || "No email recorded")}</span><small>${escapeHtml(contact.phone || conversation.provider || "")}</small></div></div>
          <dl><div><dt>Handling</dt><dd>${assignedToMe ? "Assigned to me" : "Automated"}</dd></div><div><dt>Response target</dt><dd>${escapeHtml(operations.response_due_at ? formatDateTime(operations.response_due_at) : "Not set")}</dd></div><div><dt>Workflow</dt><dd>${escapeHtml(titleCase(conversation.workflow || "unassigned"))}</dd></div></dl>
          ${roleAllows(role, "assign") ? `<div class="handling-control"><span>Who handles this?</span><div class="handling-segment" role="group" aria-label="Conversation handling"><button type="button" data-handling-mode="automation" class="${assignedToMe ? "" : "active"}" aria-pressed="${!assignedToMe}">Automated</button><button type="button" data-handling-mode="person" class="${assignedToMe ? "active" : ""}" aria-pressed="${assignedToMe}">Assigned to me</button></div><small>${assignedToMe ? `${escapeHtml(actor)} is handling this conversation. AIMS autonomous replies are paused.` : "AIMS can analyse and reply under the active automation policies."}</small></div>` : ""}
        </section>
        ${socialThread ? `<section class="panel detail-card social-control-card ${state.workspaceContextTab === "actions" ? "context-active" : ""}" data-context-section="actions">
          <header><strong>${socialThread.thread_type === "dm" ? "DM controls" : "Comment controls"}</strong><span class="channel-label channel-label-${escapeHtml(socialThread.platform)}">${escapeHtml(channelLabel(socialThread.platform))}</span></header>
          <dl><div><dt>Interaction</dt><dd>${escapeHtml(socialThread.thread_type === "dm" ? "Direct message" : "Comment")}</dd></div><div><dt>Provider status</dt><dd>${escapeHtml(titleCase(socialThread.provider_status || "unknown"))}</dd></div><div><dt>Account</dt><dd>${escapeHtml(socialThread.account_id || "Unknown")}</dd></div></dl>
          ${socialMonitorOnly ? `<p class="social-lock-note">Monitoring-only mode is active. Provider mutations remain locked until the live intake canaries are accepted.</p>` : canReply ? `<div class="social-action-grid">
            ${socialThread.thread_type === "dm" && socialCapabilities?.markRead ? `<button class="button secondary compact" data-social-action="read">Mark read</button>` : ""}
            ${socialThread.thread_type === "dm" && socialCapabilities?.conversationStatus ? `<button class="button secondary compact" data-social-action="status" data-social-status="archived">Archive provider thread</button>` : ""}
            ${socialThread.thread_type === "comment" && socialCapabilities?.hideComments ? `<button class="button secondary compact" data-social-approval="hide">Request hide</button><button class="button secondary compact" data-social-approval="unhide">Request unhide</button>` : ""}
            ${socialThread.thread_type === "comment" && socialCapabilities?.moderation ? `<button class="button secondary compact" data-social-approval="moderate" data-moderation-status="heldForReview">Request hold</button><button class="button secondary compact" data-social-approval="moderate" data-moderation-status="rejected">Request reject</button>` : ""}
            ${socialThread.thread_type === "comment" && socialCapabilities?.deleteComments ? `<button class="button danger compact" data-social-approval="delete">Request delete</button>` : ""}
          </div>` : ""}
          ${!socialMonitorOnly && executableModerationApprovals.length ? `<div class="approved-action-list"><strong>Approved actions ready</strong>${executableModerationApprovals.map((approval) => `<button class="button primary compact" data-social-approved-id="${escapeHtml(approval.id)}">Execute ${escapeHtml(titleCase(approval.action_type || "action"))}</button>`).join("")}</div>` : ""}
        </section>` : ""}
        <section class="panel detail-card ai-card ${state.workspaceContextTab === "ai" ? "context-active" : ""}" data-context-section="ai">
          <header><strong>AIMS analysis</strong><span class="ai-state risk-${escapeHtml(aiState.risk_level || "unknown")}">${escapeHtml(titleCase(aiState.risk_level || "Unanalysed"))}</span></header>
          <p class="ai-summary">${escapeHtml(aiState.summary_text || "No current summary has been returned.")}</p>
          <dl><div><dt>Intent</dt><dd>${escapeHtml(titleCase(aiState.intent || "Unknown"))}</dd></div><div><dt>Priority</dt><dd>${escapeHtml(titleCase(aiState.priority_label || "Unknown"))}${aiState.priority_score !== undefined ? ` (${escapeHtml(aiState.priority_score)})` : ""}</dd></div><div><dt>Sentiment</dt><dd>${escapeHtml(titleCase(aiState.sentiment || "Unknown"))}</dd></div><div><dt>Next action</dt><dd>${escapeHtml(aiState.next_action || "Not set")}</dd></div></dl>
          ${drafts.length ? `<div class="draft-box"><strong>Latest draft</strong><p>${escapeHtml(drafts[0].body_text || drafts[0].content || "")}</p></div>` : ""}
          ${latestAutoSent ? `<div class="auto-sent-box"><strong>Sent automatically</strong><dl><div><dt>Channel</dt><dd>${escapeHtml(channelLabel(latestAutoSentDetails.channel || conversation.channel))}</dd></div><div><dt>Confidence</dt><dd>${escapeHtml(latestAutoSentDetails.confidence !== undefined ? String(Math.round(Number(latestAutoSentDetails.confidence || 0) * 100)) + "%" : "Verified by policy")}</dd></div><div><dt>Grounding</dt><dd>${escapeHtml(Number(latestAutoSentDetails.evidenceCount || 0) > 0 ? "Evidence-backed" : "Deterministic / conversational")}</dd></div><div><dt>Model</dt><dd>${escapeHtml(latestAutoSentDetails.model || "Deterministic")}</dd></div></dl><p>${escapeHtml((latestAutoSentDetails.responseReasons || []).slice(0, 3).map((reason) => titleCase(String(reason).replaceAll(":", " ").replaceAll("_", " "))).join(" · ") || "Safe grounded response")}</p><small>${escapeHtml(formatDateTime(latestAutoSent.occurred_at || latestAutoSent.created_at))}</small></div>` : ""}
          ${pendingApproval ? `<div class="approval-box"><strong>Approval required</strong><p>${escapeHtml(pendingApproval.rationale || `Review ${titleCase(pendingApproval.action_type || "action")} scope and evidence.`)}</p>${canApprove ? `<div><button class="button secondary" data-approval-id="${escapeHtml(pendingApproval.id)}" data-decision="reject">Reject</button><button class="button primary" data-approval-id="${escapeHtml(pendingApproval.id)}" data-decision="approve">Approve</button></div>` : ""}</div>` : ""}
        </section>
        ${attachments.length ? `<section class="panel detail-card attachment-card ${state.workspaceContextTab === "details" ? "context-active" : ""}" data-context-section="details">
          <header><strong>Attachments</strong><span>${attachments.length}</span></header>
          <div class="attachment-list">
            ${attachments.map((attachment) => {
              const status = String(attachment.status || "reference_only");
              const stored = status === "stored";
              return `<article class="attachment-row">
                <div class="attachment-icon">${icons.download}</div>
                <div class="attachment-meta">
                  <strong>${escapeHtml(attachment.filename || "Attachment")}</strong>
                  <small>${escapeHtml(stored ? "Stored securely in Comms Hub" : status === "quarantined" ? "Quarantined" : status === "ingest_failed" ? "Storage failed" : "Processing")}</small>
                </div>
                ${stored ? `<button class="button secondary compact" type="button" data-attachment-id="${escapeHtml(attachment.id)}">Open</button>` : `<span class="attachment-status">${escapeHtml(titleCase(status.replaceAll("_", " ")))}</span>`}
              </article>`;
            }).join("")}
          </div>
        </section>` : ""}
        <section class="panel detail-card ${state.workspaceContextTab === "notes" ? "context-active" : ""}" data-context-section="notes">
          <header><strong>Private notes</strong><span>${workspace.notes?.length || 0}</span></header>
          <div class="notes-list">${(workspace.notes || []).slice(0, 4).map((note) => `<article><strong>${escapeHtml(note.author || note.created_by || "Operator")}</strong><p>${escapeHtml(note.body_text || "")}</p><small>${escapeHtml(formatRelativeTime(note.created_at))}</small></article>`).join("") || `<p class="muted">No private notes.</p>`}</div>
          ${roleAllows(role, "note") ? `<form id="note-form" class="note-form"><textarea name="bodyText" rows="2" placeholder="Add a private note" aria-label="Private note" required></textarea><button class="button secondary" type="submit">Add note</button></form>` : ""}
        </section>
      </aside>
    </div>
  `);
}

async function downloadAttachment(attachmentId, button) {
  if (!attachmentId || button?.disabled) return;
  const original = button?.textContent || "Open";
  if (button) {
    button.disabled = true;
    button.textContent = "Opening…";
  }
  try {
    const result = await client.downloadAttachment(attachmentId);
    const objectUrl = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = result.filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    toast(`Opened ${result.filename}`);
  } catch (error) {
    toast(error?.message || "Attachment could not be opened.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function errorView() {
  return shell(`
    ${pageHeader("Connection not ready", "The live AIMS gateway could not be loaded.")}
    <section class="connection-error panel" role="alert"><div class="error-orb">!</div><h2>${escapeHtml(state.error?.message || "AIMS gateway could not be reached.")}</h2><p>Check the gateway URL, HIVE session verification and AIMS Comms Hub readiness.</p><div><button class="button primary" data-action="refresh">Try again</button></div></section>
  `);
}

function render() {
  normaliseFiltersForView();
  if (state.error && !state.bootstrap) {
    root.innerHTML = errorView();
    bindEvents();
    return;
  }
  const views = {
    dashboard: dashboardView,
    inbox: inboxView,
    dms: dmsView,
    comments: commentsView,
    workspace: workspaceView,
    approvals: approvalsView,
    contacts: contactsView,
    workflows: workflowsView,
    quarantine: quarantineView,
    analytics: analyticsView,
    settings: settingsView,
  };
  root.className = "";
  root.innerHTML = (views[state.view] || dashboardView)();
  bindEvents();
}

function bindEvents() {
  root.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  root.querySelectorAll("[data-conversation-id]").forEach((element) => element.addEventListener("click", (event) => {
    const id = event.currentTarget.dataset.conversationId;
    if (id) openConversation(id);
  }));
  root.querySelectorAll("tr[data-conversation-id]").forEach((row) => row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openConversation(row.dataset.conversationId); }
  }));
  root.querySelectorAll("[data-filter]").forEach((control) => control.addEventListener("change", () => {
    const key = control.dataset.filter;
    state.filters[key] = control.type === "checkbox" ? control.checked : control.value;
    render();
  }));
  root.querySelector("#global-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    if (!["dashboard", "inbox", "dms", "comments"].includes(state.view)) state.view = "inbox";
    render();
    requestAnimationFrame(() => {
      const input = root.querySelector("#global-search");
      input?.focus();
      input?.setSelectionRange(state.search.length, state.search.length);
    });
  });
  root.querySelector('[data-action="clear-filters"]')?.addEventListener("click", () => { state.filters = { status: "", channel: "", priority: "", ownerId: "", ownerMode: "", tag: "", overdue: false, aiStatus: "" }; render(); });
  root.querySelectorAll("[data-quick-filter]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.quickFilter;
    state.filters = { status: "", channel: "", priority: "", ownerId: "", ownerMode: "", tag: "", overdue: false, aiStatus: "" };
    if (key === "overdue") state.filters.overdue = true;
    if (key === "open") state.filters.status = "open";
    if (key === "high") state.filters.priority = "high";
    if (key === "mine") state.filters.ownerMode = "person";
    render();
  }));
  root.querySelectorAll("[data-workspace-context]").forEach((button) => button.addEventListener("click", () => { state.workspaceContextTab = button.dataset.workspaceContext || "details"; render(); }));
  root.querySelectorAll('[data-action="refresh"]').forEach((button) => button.addEventListener("click", loadBootstrap));
  root.querySelector('[data-action="open-sidebar"]')?.addEventListener("click", openSidebar);
  root.querySelectorAll('[data-action="close-sidebar"]').forEach((button) => button.addEventListener("click", closeSidebar));
  root.querySelectorAll('[data-action="toggle-notifications"]').forEach((button) => button.addEventListener("click", () => toggleNotifications(button)));
  root.querySelectorAll("[data-notification-id]").forEach((button) => button.addEventListener("click", () => openNotification(button)));
  root.querySelectorAll("[data-contact-id]").forEach((button) => button.addEventListener("click", () => openContact(button.dataset.contactId)));
  root.querySelector('[data-action="close-contact"]')?.addEventListener("click", closeContact);
  root.querySelector("#contact-edit-form")?.addEventListener("submit", submitContactEdit);
  root.querySelector('[data-action="delete-contact"]')?.addEventListener("click", deleteContact);
  bindThemedSelects();
  root.querySelector("#workspace-status")?.addEventListener("change", updateWorkspaceStatus);
  root.querySelectorAll("[data-handling-mode]").forEach((button) => button.addEventListener("click", () => changeHandlingMode(button.dataset.handlingMode)));
  root.querySelector('[data-action="archive-conversation"]')?.addEventListener("click", archiveConversation);
  root.querySelector('[data-action="delete-conversation"]')?.addEventListener("click", deleteConversation);
  root.querySelector("#note-form")?.addEventListener("submit", submitNote);
  root.querySelector("#reply-form")?.addEventListener("submit", submitReply);
  root.querySelector('[data-action="analyse"]')?.addEventListener("click", analyseConversation);
  root.querySelectorAll("[data-approval-id]").forEach((button) => button.addEventListener("click", () => decideApproval(button.dataset.approvalId, button.dataset.decision)));
  root.querySelectorAll("[data-attachment-id]").forEach((button) => button.addEventListener("click", () => downloadAttachment(button.dataset.attachmentId, button)));
  root.querySelector('[data-action="load-quarantine"]')?.addEventListener("click", loadQuarantine);
  root.querySelectorAll("[data-replay-id]").forEach((button) => button.addEventListener("click", () => replayQuarantine(button.dataset.replayId)));
  root.querySelector('[data-action="load-metrics"]')?.addEventListener("click", loadMetrics);
  root.querySelector('[data-action="load-social-status"]')?.addEventListener("click", loadSocialStatus);
  root.querySelector('[data-action="reconcile-social"]')?.addEventListener("click", reconcileSocial);
  root.querySelector('[data-action="poll-social"]')?.addEventListener("click", pollSocial);
  root.querySelectorAll("[data-social-action]").forEach((button) => button.addEventListener("click", () => runSocialAction(button)));
  root.querySelectorAll("[data-social-approval]").forEach((button) => button.addEventListener("click", () => requestSocialModeration(button)));
  root.querySelectorAll("[data-social-approved-id]").forEach((button) => button.addEventListener("click", () => executeApprovedSocialModeration(button)));
}

function bindThemedSelects() {
  const closeAll = (except = null) => {
    root.querySelectorAll("[data-themed-select].open").forEach((element) => {
      if (element === except) return;
      element.classList.remove("open");
      element.querySelector("[data-themed-select-trigger]")?.setAttribute("aria-expanded", "false");
    });
  };
  root.querySelectorAll("[data-themed-select]").forEach((element) => {
    const trigger = element.querySelector("[data-themed-select-trigger]");
    const proxy = element.querySelector(".themed-select-proxy");
    const menu = element.querySelector(".themed-select-menu");
    const options = [...element.querySelectorAll("[data-themed-select-value]")];
    if (!trigger || !proxy || !menu || proxy.disabled) return;

    const open = ({ focusOption = false } = {}) => {
      closeAll(element);
      element.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      if (focusOption) (options.find((item) => item.classList.contains("selected")) || options[0])?.focus();
    };
    const close = ({ restoreFocus = false } = {}) => {
      element.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus();
    };
    const choose = (option) => {
      proxy.value = option.dataset.themedSelectValue || "";
      trigger.querySelector("span").textContent = option.textContent.trim();
      options.forEach((item) => {
        const selected = item === option;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      close();
      proxy.dispatchEvent(new Event("change", { bubbles: true }));
    };

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      element.classList.contains("open") ? close() : open();
    });
    trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      open({ focusOption: true });
    });
    options.forEach((option) => option.addEventListener("click", (event) => {
      event.stopPropagation();
      choose(option);
    }));
    menu.addEventListener("keydown", (event) => {
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        close({ restoreFocus: true });
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const last = Math.max(options.length - 1, 0);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? last : event.key === "ArrowDown" ? Math.min(currentIndex + 1, last) : Math.max(currentIndex - 1, 0);
        options[nextIndex]?.focus();
      }
    });
  });
  root.onclick = (event) => {
    if (!event.target.closest?.("[data-themed-select]")) closeAll();
  };
}


function focusAfterRender(selector) {
  requestAnimationFrame(() => root.querySelector(selector)?.focus());
}

function openSidebar() {
  state.sidebarOpen = true;
  render();
  focusAfterRender('[data-action="close-sidebar"]');
}

function closeSidebar() {
  state.sidebarOpen = false;
  render();
  focusAfterRender('[data-action="open-sidebar"]');
}

function toggleNotifications(sourceButton = null) {
  const opening = !state.notificationOpen;
  const returnSelector = sourceButton?.classList?.contains("embedded-notification-button") || config.embedded
    ? ".embedded-notification-button"
    : ".notification-button";
  state.notificationOpen = opening;
  render();
  focusAfterRender(opening ? '#notification-panel [data-action="toggle-notifications"]' : returnSelector);
}

function navigate(view) {
  state.view = view;
  state.sidebarOpen = false;
  state.notificationOpen = false;
  if (view === "quarantine" && !state.quarantine.length) loadQuarantine();
  else if (view === "analytics" && !state.metrics) loadMetrics();
  else if (view === "settings" && !state.socialStatus) loadSocialStatus({ keepView: true });
  else render();
  history.replaceState(null, "", `${location.pathname}${location.search}#${view}`);
}

async function openConversation(conversationId) {
  state.selectedConversationId = conversationId;
  state.workspaceContextTab = "details";
  state.view = "workspace";
  state.workspace = null;
  state.loading = true;
  state.notificationOpen = false;
  render();
  try {
    state.workspace = await client.workspace(conversationId);
    state.error = null;
  } catch (error) {
    toast(error.message || "Conversation could not be loaded.", "error");
  } finally {
    state.loading = false;
    render();
  }
}

async function openContact(contactId) {
  if (!contactId) return;
  state.selectedContactId = contactId;
  state.contactProfile = null;
  state.contactBusy = true;
  state.view = "contacts";
  history.replaceState(null, "", `${location.pathname}${location.search}#contacts`);
  render();
  try {
    state.contactProfile = await client.contact(contactId);
    state.error = null;
  } catch (error) {
    toast(error.message || "Contact could not be loaded.", "error");
  } finally {
    state.contactBusy = false;
    render();
  }
}

function closeContact() {
  state.selectedContactId = "";
  state.contactProfile = null;
  state.contactBusy = false;
  render();
}

async function submitContactEdit(event) {
  event.preventDefault();
  if (!state.selectedContactId || state.contactBusy) return;
  const data = new FormData(event.currentTarget);
  state.contactBusy = true;
  render();
  try {
    const result = await client.updateContact(state.selectedContactId, {
      displayName: String(data.get("displayName") || "").trim(),
      primaryEmail: String(data.get("primaryEmail") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
    });
    state.contactProfile = result;
    const updated = result?.profile?.contact || result?.contact || null;
    if (updated) {
      for (const row of state.queue.filter((item) => item.contact_id === state.selectedContactId)) {
        row.display_name = updated.display_name;
        row.primary_email = updated.primary_email;
        row.phone = updated.phone;
      }
    }
    toast("Contact changes saved.");
  } catch (error) {
    toast(error.message || "Contact could not be updated.", "error");
  } finally {
    state.contactBusy = false;
    render();
  }
}

async function deleteContact() {
  if (!state.selectedContactId || state.contactBusy) return;
  const profile = state.contactProfile?.profile || state.contactProfile || {};
  const contact = profile.contact || {};
  const label = contact.display_name || contact.primary_email || "this contact";
  const linked = Number(profile.conversations?.length || 0);
  const confirmed = globalThis.confirm?.(`Delete ${label}? ${linked} linked conversation${linked === 1 ? "" : "s"} will be preserved but detached from this contact. This cannot be undone.`);
  if (!confirmed) return;
  state.contactBusy = true;
  render();
  try {
    await client.deleteContact(state.selectedContactId);
    state.selectedContactId = "";
    state.contactProfile = null;
    await loadBootstrap();
    state.view = "contacts";
    history.replaceState(null, "", `${location.pathname}${location.search}#contacts`);
    toast("Contact deleted. Linked conversations were preserved.");
  } catch (error) {
    toast(error.message || "Contact could not be deleted.", "error");
  } finally {
    state.contactBusy = false;
    render();
  }
}

async function loadBootstrap() {
  state.loading = true;
  state.error = null;
  try {
    const payload = await client.bootstrap();
    state.bootstrap = payload;
    state.queue = payload.queue || payload.conversations || [];
    state.notifications = payload.notifications || [];
    state.socialStatus = await client.socialStatus().catch(() => state.socialStatus);
    const requestedView = location.hash.slice(1);
    state.view = requestedView && routableViews.has(requestedView) ? requestedView : state.view;
  } catch (error) {
    state.error = error instanceof Error ? error : new Error(String(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function loadQuarantine() {
  try {
    state.quarantine = (await client.quarantine({ status: "quarantined", limit: 100 })).items || [];
    state.view = "quarantine";
    render();
  } catch (error) { toast(error.message || "Quarantine could not be loaded.", "error"); }
}

async function loadMetrics() {
  try {
    state.metrics = (await client.metrics()).metrics;
    state.view = "analytics";
    render();
  } catch (error) { toast(error.message || "Metrics could not be loaded.", "error"); }
}

async function updateWorkspaceStatus(event) {
  const status = event.target.value;
  try {
    await client.updateStatus(state.selectedConversationId, status, { expectedVersion: state.workspace?.workspace?.operations?.version ?? null });
    const operations = state.workspace?.workspace?.operations;
    if (operations) operations.operational_status = status;
    const queueItem = state.queue.find((row) => row.id === state.selectedConversationId);
    if (queueItem) queueItem.operational_status = status;
    toast(`Conversation moved to ${titleCase(status)}.`);
  } catch (error) { toast(error.message || "Status could not be updated.", "error"); }
}

async function changeHandlingMode(mode) {
  if (!new Set(["automation", "person"]).has(mode)) return;
  const actor = state.bootstrap?.identity?.actor || "Jonathan";
  const assignment = {
    ownerId: mode === "person" ? actor : "AIMS",
    ownerType: mode,
    expectedVersion: state.workspace?.workspace?.operations?.version ?? null,
  };
  try {
    const result = await client.assign(state.selectedConversationId, assignment);
    const operations = state.workspace?.workspace?.operations;
    if (operations) Object.assign(operations, result?.result || result || {}, { owner_id: assignment.ownerId, owner_type: assignment.ownerType });
    const queueItem = state.queue.find((row) => row.id === state.selectedConversationId);
    if (queueItem) Object.assign(queueItem, { owner_id: assignment.ownerId, owner_type: assignment.ownerType });
    toast(mode === "person" ? "Assigned to me. AIMS autonomous replies are paused." : "Returned to AIMS automation.");
  } catch (error) { toast(error.message || "Handling mode could not be updated.", "error"); }
}

async function archiveConversation() {
  const operations = state.workspace?.workspace?.operations;
  if ((operations?.operational_status || "") !== "resolved") return toast("Only completed conversations can be archived.", "error");
  try {
    const result = await client.updateStatus(state.selectedConversationId, "archived", { expectedVersion: operations?.version ?? null, reason: "manual_archive" });
    if (operations) Object.assign(operations, result?.result || result || {}, { operational_status: "archived" });
    const queueItem = state.queue.find((row) => row.id === state.selectedConversationId);
    if (queueItem) queueItem.operational_status = "archived";
    toast("Completed conversation archived.");
  } catch (error) { toast(error.message || "Conversation could not be archived.", "error"); }
}

async function deleteConversation() {
  if (!state.selectedConversationId) return;
  const workspace = state.workspace?.workspace || state.workspace || {};
  const subject = workspace.conversation?.subject || "this conversation";
  const targetView = workspaceInboxView();
  const confirmed = globalThis.confirm?.(`Permanently delete ${subject} and all associated messages/history? This cannot be undone.`);
  if (!confirmed) return;
  try {
    await client.deleteConversation(state.selectedConversationId);
    state.queue = state.queue.filter((row) => row.id !== state.selectedConversationId);
    state.workspace = null;
    state.selectedConversationId = "";
    navigate(targetView);
    toast("Conversation and message history deleted.");
  } catch (error) {
    toast(error.message || "Conversation could not be deleted.", "error");
  }
}

async function submitNote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const bodyText = String(data.get("bodyText") || "").trim();
  if (!bodyText) return;
  try {
    const result = await client.addNote(state.selectedConversationId, { bodyText, mentions: [] });
    state.workspace.workspace.notes = [result.note, ...(state.workspace.workspace.notes || [])];
    form.reset();
    toast("Private note added.");
  } catch (error) { toast(error.message || "Private note could not be added.", "error"); }
}

async function submitReply(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const message = String(data.get("message") || "").trim();
  if (!message) return;
  const conversation = state.workspace?.workspace?.conversation || {};
  try {
    {
      if (conversation.channel === "chat") await client.sendChat(state.selectedConversationId, message);
      else if (conversation.channel === "email") {
        const result = await client.sendEmail(state.selectedConversationId, { message, bodyText: message });
        if (result?.scheduled) {
          form.reset();
          toast(`Reply scheduled for ${formatDateTime(result.dueAt)}.`);
          return;
        }
      }
      else if (isSocialChannel(conversation.channel)) {
        const replyMode = String(data.get("replyMode") || "public");
        await client.socialAction(state.selectedConversationId, "reply", { message, ...(replyMode === "private" ? { private: true } : {}) });
      } else throw new AimsApiError("This channel does not expose a direct reply action.", { status: 409, code: "ui_reply_unsupported" });
    }
    conversation.messages = [...(conversation.messages || []), { id: `local-${Date.now()}`, direction: "outbound", sender: state.bootstrap.identity.actor, body_text: message, received_at: new Date().toISOString() }];
    form.reset();
    toast("Reply sent through AIMS.");
  } catch (error) { toast(error.message || "Reply could not be sent.", "error"); }
}

async function loadSocialStatus({ keepView = false } = {}) {
  try {
    state.socialStatus = await client.socialStatus();
    if (!keepView) state.view = "settings";
    render();
  } catch (error) { toast(error.message || "Social channel status could not be loaded.", "error"); }
}

async function reconcileSocial() {
  if (state.socialBusy) return;
  state.socialBusy = true; render();
  try {
    await client.reconcileSocialWebhooks();
    await loadSocialStatus({ keepView: true });
    toast("Facebook, Instagram and YouTube webhook families reconciled.");
  } catch (error) { toast(error.message || "Social webhooks could not be reconciled.", "error"); }
  finally { state.socialBusy = false; render(); }
}

async function pollSocial() {
  if (state.socialBusy) return;
  state.socialBusy = true; render();
  try {
    const result = await client.drainSocialPoll(10);
    await loadBootstrap();
    toast(`Social poll completed${result?.processedJobs !== undefined ? `: ${result.processedJobs} jobs` : ""}.`);
  } catch (error) { toast(error.message || "Social poll could not be completed.", "error"); }
  finally { state.socialBusy = false; render(); }
}

async function runSocialAction(button) {
  const action = button.dataset.socialAction;
  const body = action === "status" ? { status: button.dataset.socialStatus || "archived" } : {};
  try {
    await client.socialAction(state.selectedConversationId, action, body);
    toast(action === "read" ? "Provider conversation marked read." : "Provider conversation updated.");
    await openConversation(state.selectedConversationId);
  } catch (error) { toast(error.message || "Social action could not be completed.", "error"); }
}

async function requestSocialModeration(button) {
  const action = button.dataset.socialApproval;
  const body = action === "moderate" ? { moderationStatus: button.dataset.moderationStatus || "heldForReview" } : {};
  try {
    await client.requestSocialApproval(state.selectedConversationId, action, body);
    toast(`${titleCase(action)} action sent for approval.`);
    await openConversation(state.selectedConversationId);
  } catch (error) { toast(error.message || "Social approval could not be requested.", "error"); }
}

async function executeApprovedSocialModeration(button) {
  const approvalId = button.dataset.socialApprovedId;
  const approvals = state.workspace?.workspace?.ai?.approvals || [];
  const approval = approvals.find((item) => item.id === approvalId && item.status === "approved");
  if (!approval) return toast("Approved action could not be resolved.", "error");
  const metadata = approvalMetadata(approval);
  const idempotencyKey = String(metadata.idempotencyKey || "");
  if (!idempotencyKey) return toast("Approved action is missing its idempotency key.", "error");
  try {
    await client.socialAction(
      state.selectedConversationId,
      approval.action_type,
      { ...(metadata.actionBody || {}), approvalId: approval.id },
      { idempotencyKey },
    );
    toast(`${titleCase(approval.action_type || "Social")} action executed.`);
    await openConversation(state.selectedConversationId);
  } catch (error) { toast(error.message || "Approved social action could not be executed.", "error"); }
}

async function analyseConversation() {
  try {
    await client.analyse(state.selectedConversationId, { operation: "operator_refresh", scheduleFollowUp: true });
    toast("AIMS analysis started.");
  } catch (error) { toast(error.message || "Analysis could not be started.", "error"); }
}


async function decideApproval(approvalId, decision) {
  try {
    await client.decideApproval(approvalId, decision, "Decision recorded in AIMS UI");
    toast(`Approval ${decision === "approve" ? "granted" : "rejected"}.`);
    await openConversation(state.selectedConversationId);
  } catch (error) { toast(error.message || "Approval decision could not be recorded.", "error"); }
}

async function replayQuarantine(id) {
  try {
    await client.replayQuarantine(id);
    state.quarantine = state.quarantine.filter((item) => item.id !== id);
    toast("Replay accepted with idempotency protection.");
  } catch (error) { toast(error.message || "Quarantine item could not be replayed.", "error"); }
}

async function openNotification(button) {
  const id = button.dataset.notificationId;
  const conversationId = button.dataset.conversationId;
  try {
    await client.markNotification(id, "read");
    const notification = state.notifications.find((item) => item.id === id);
    if (notification) notification.status = "read";
  } catch {}
  if (conversationId) openConversation(conversationId);
  else if (state.notificationOpen) toggleNotifications();
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    root.querySelector("#global-search")?.focus();
  }
  if (event.key === "Escape" && state.notificationOpen) {
    event.preventDefault();
    toggleNotifications();
  } else if (event.key === "Escape" && state.sidebarOpen) {
    event.preventDefault();
    closeSidebar();
  }
});

loadBootstrap();
