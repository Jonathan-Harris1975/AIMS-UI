import { AimsCommsClient, AimsApiError } from "@aims/api";
import { escapeHtml, formatDateTime, formatRelativeTime, secondsToAge, titleCase } from "@aims/shared";
import { roleAllows } from "@aims/contracts";
import { demoBootstrap, demoMetrics, demoQuarantine, demoWorkspace } from "./mock-data.js";

const root = document.querySelector("#app");
const query = new URLSearchParams(location.search);
const supplied = globalThis.AIMS_UI_CONFIG || {};
const config = Object.freeze({
  apiBaseUrl: String(supplied.apiBaseUrl || "/console/api").replace(/\/+$/, ""),
  demoMode: supplied.demoMode === true || query.get("demo") === "1",
  embedded: query.get("embed") === "1",
  productName: String(supplied.productName || "AIMS Comms Hub"),
  hiveHomeUrl: String(supplied.hiveHomeUrl || "https://hive.jonathan-harris.online").replace(/\/+$/, ""),
});

function acceptHiveHandoff() {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(fragment);
  const token = params.get("handoff");
  if (!token) return false;
  sessionStorage.setItem("aims-ui-console-token", token);
  history.replaceState(null, "", `${location.pathname}${location.search}#dashboard`);
  return true;
}

acceptHiveHandoff();

if (config.embedded && window.parent !== window) {
  window.parent.postMessage({ type: "aims-comms-ready" }, "https://hive.jonathan-harris.online");
}

const client = new AimsCommsClient({
  baseUrl: config.apiBaseUrl,
  tokenProvider: () => sessionStorage.getItem("aims-ui-console-token") || "",
});

const state = {
  view: "dashboard",
  bootstrap: null,
  queue: [],
  notifications: [],
  workspace: null,
  selectedConversationId: "",
  filters: { status: "", channel: "", priority: "", ownerId: "", tag: "", overdue: false, aiStatus: "" },
  search: "",
  loading: false,
  error: null,
  toast: null,
  sidebarOpen: false,
  notificationOpen: false,
  quarantine: [],
  metrics: null,
};

const icons = {
  dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z"/></svg>`,
  inbox: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12h-5l-2 3h-2l-2-3H4V4Zm2 2v8h4l2 3 2-3h4V6H6Z"/></svg>`,
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

function queueRows() {
  const term = state.search.trim().toLowerCase();
  return state.queue.filter((row) => {
    if (state.filters.status && row.operational_status !== state.filters.status) return false;
    if (state.filters.channel && row.channel !== state.filters.channel) return false;
    if (state.filters.priority && row.priority_label !== state.filters.priority) return false;
    if (state.filters.ownerId && row.owner_id !== state.filters.ownerId) return false;
    if (state.filters.overdue && !row.response_overdue) return false;
    if (state.filters.aiStatus && row.ai_status !== state.filters.aiStatus && row.latest_ai_status !== state.filters.aiStatus) return false;
    if (!term) return true;
    return [row.display_name, row.primary_email, row.subject, row.summary_text, row.intent, row.channel]
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
      <button class="scrim" data-action="close-sidebar" aria-label="Close navigation"></button>
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark"><span>A</span></div>
          <div><strong>AIMS</strong><small>Comms Hub</small></div>
          <button class="icon-button mobile-only" data-action="close-sidebar" aria-label="Close navigation">${icons.close}</button>
        </div>
        <nav aria-label="Primary">
          ${navItems.map(([key, label, icon]) => `
            <button class="nav-item ${state.view === key || (key === "inbox" && state.view === "workspace") ? "active" : ""}" data-view="${key}">
              ${icon}<span>${escapeHtml(label)}</span>
              ${key === "approvals" && pendingApprovals().length ? `<b>${pendingApprovals().length}</b>` : ""}
            </button>
          `).join("")}
        </nav>
        <div class="sidebar-footer">
          <a class="hive-home-link" href="${escapeHtml(config.hiveHomeUrl)}" aria-label="Return to HIVE">${icons.home}<span>Back to HIVE</span></a>
          <div class="service-card">
            <span class="service-dot ${config.demoMode ? "demo" : "live"}"></span>
            <div><strong>${config.demoMode ? "Demo data" : "Live gateway"}</strong><small>${escapeHtml(config.apiBaseUrl)}</small></div>
          </div>
          <div class="user-card">
            <div class="avatar">${escapeHtml(String(identity.actor || "U").charAt(0).toUpperCase())}</div>
            <div><strong>${escapeHtml(identity.actor || "Unknown")}</strong><small>${escapeHtml(titleCase(identity.role || "read_only"))}</small></div>
          </div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <button class="icon-button mobile-only aims-menu-trigger" data-action="open-sidebar" aria-label="Open AIMS navigation">${icons.menu}</button>
          <div class="mobile-title"><strong>${escapeHtml(config.productName)}</strong><span>${escapeHtml(titleCase(state.view))}</span></div>
          <label class="global-search">
            ${icons.search}
            <input id="global-search" type="search" value="${escapeHtml(state.search)}" placeholder="Search queue, contact or conversation" autocomplete="off">
            <kbd>⌘ K</kbd>
          </label>
          <button class="icon-button notification-button" data-action="toggle-notifications" aria-label="Notifications">
            ${icons.bell}${unread ? `<span>${unread}</span>` : ""}
          </button>
        </header>
        ${config.embedded ? `<nav class="embedded-nav" aria-label="AIMS Comms Hub sections">
          ${navItems.map(([key, label, icon]) => `
            <button class="embedded-nav-item ${state.view === key || (key === "inbox" && state.view === "workspace") ? "active" : ""}" data-view="${key}">
              ${icon}<span>${escapeHtml(label)}</span>
              ${key === "approvals" && pendingApprovals().length ? `<b>${pendingApprovals().length}</b>` : ""}
            </button>
          `).join("")}
        </nav>` : ""}
        <div class="content">${content}</div>
      </main>
      ${notificationPanel()}
      ${state.toast ? `<div class="toast toast-${escapeHtml(state.toast.tone)}" role="status">${escapeHtml(state.toast.message)}</div>` : ""}
    </div>
  `;
}

function notificationPanel() {
  if (!state.notificationOpen) return "";
  return `
    <aside class="notification-panel" aria-label="Notifications">
      <header><div><strong>Notifications</strong><span>${state.notifications.length} recent</span></div><button class="icon-button" data-action="toggle-notifications" aria-label="Close notifications">${icons.close}</button></header>
      <div class="notification-list">
        ${state.notifications.length ? state.notifications.map((item) => `
          <button class="notification-item severity-${escapeHtml(item.severity || "info")}" data-notification-id="${escapeHtml(item.id)}" data-conversation-id="${escapeHtml(item.conversation_id || "")}">
            <span class="notification-dot"></span>
            <span><strong>${escapeHtml(item.title || titleCase(item.type))}</strong><small>${escapeHtml(item.body_text || "")}</small><time>${escapeHtml(formatRelativeTime(item.created_at))}</time></span>
          </button>
        `).join("") : emptyState("No notifications", "The signal shelf is clear.")}
      </div>
    </aside>
  `;
}

function pageHeader(title, copy, actions = "") {
  return `<section class="page-header"><div><p class="eyebrow">AIMS-owned operations</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div><div class="page-actions">${actions}</div></section>`;
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

function filterBar(compact = false) {
  const options = (values, selected, blank) => `<option value="">${blank}</option>${values.map((value) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(titleCase(value))}</option>`).join("")}`;
  const owners = [...new Set(state.queue.map((row) => row.owner_id).filter(Boolean))];
  return `
    <div class="filter-bar ${compact ? "compact" : ""}">
      <select data-filter="status" aria-label="Filter by status">${options(["open", "pending", "snoozed", "resolved", "blocked", "quarantined", "escalated"], state.filters.status, "All statuses")}</select>
      <select data-filter="channel" aria-label="Filter by channel">${options(["chat", "email", "instagram", "facebook", "youtube", "form"], state.filters.channel, "All channels")}</select>
      <select data-filter="priority" aria-label="Filter by priority">${options(["critical", "high", "medium", "low"], state.filters.priority, "All priorities")}</select>
      <select data-filter="ownerId" aria-label="Filter by owner">${options(owners, state.filters.ownerId, "All owners")}</select>
      <label class="check-filter"><input type="checkbox" data-filter="overdue" ${state.filters.overdue ? "checked" : ""}><span>Overdue only</span></label>
      <button class="text-button" data-action="clear-filters">Clear</button>
    </div>
  `;
}

function queueTable(rows = queueRows(), limit = 50, compact = false) {
  const visible = rows.slice(0, limit);
  if (!visible.length) return emptyState("No matching conversations", "Change the filters or search terms. Nothing is hiding under the rug.");
  return `
    <div class="queue-wrap">
      <table class="queue-table ${compact ? "queue-table-compact" : ""}">
        <thead><tr><th>Conversation</th><th>Channel</th><th>Priority</th><th>Status</th><th>Age</th><th>Owner</th><th>AI</th><th><span class="sr-only">Open</span></th></tr></thead>
        <tbody>
          ${visible.map((row) => `
            <tr data-conversation-id="${escapeHtml(row.id)}" tabindex="0">
              <td><div class="conversation-cell"><div class="channel-avatar channel-${escapeHtml(row.channel)}">${escapeHtml(channelLabel(row.channel).charAt(0))}</div><div><strong>${escapeHtml(row.display_name || row.primary_email || "Unknown contact")}</strong><span>${escapeHtml(row.subject || row.summary_text || "Conversation")}</span><small>${escapeHtml(row.summary_text || "")}</small></div></div></td>
              <td><span class="channel-label channel-label-${escapeHtml(row.channel)}">${escapeHtml(channelLabel(row.channel))}</span></td>
              <td>${priorityPill(row.priority_label)}</td>
              <td>${statusPill(row.operational_status)}</td>
              <td><span class="age ${row.response_overdue ? "overdue" : ""}">${escapeHtml(secondsToAge(row.age_seconds))}</span></td>
              <td><span class="owner">${row.owner_id ? `<i>${escapeHtml(row.owner_id.charAt(0).toUpperCase())}</i>${escapeHtml(row.owner_id)}` : "Unassigned"}</span></td>
              <td><span class="ai-state risk-${escapeHtml(row.risk_level || "unknown")}">${escapeHtml(titleCase(row.intent || "Unanalysed"))}</span></td>
              <td><button class="row-arrow" data-conversation-id="${escapeHtml(row.id)}" aria-label="Open conversation">${icons.arrow}</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
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
        <div class="health-strip"><span class="service-dot ${state.error ? "warning" : "live"}"></span><div><strong>${state.error ? "Gateway attention required" : "Console data loaded"}</strong><small>${config.demoMode ? "Explicit demo mode" : "Protected AIMS API"}</small></div></div>
      </section>
    </div>
  `);
}

function inboxView() {
  return shell(`
    ${pageHeader("Unified inbox", "Filter and triage every supported channel without losing the thread.", `<button class="button secondary" data-action="refresh">Refresh queue</button>`)}
    <section class="panel inbox-panel">
      <header class="panel-header stacked"><div><strong>${queueRows().length} conversations</strong><span>Live filters remain local until refresh, preventing accidental query storms.</span></div>${filterBar()}</header>
      ${queueTable()}
    </section>
  `);
}

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
  const contacts = [...new Map(state.queue.map((row) => [row.contact_id, row])).values()];
  return shell(`
    ${pageHeader("Contacts", "Channel identities and conversation history remain anchored to one contact record.")}
    <section class="panel contacts-panel">
      <div class="contact-grid">
        ${contacts.map((row) => `<button class="contact-card" data-conversation-id="${escapeHtml(row.id)}"><div class="avatar large">${escapeHtml((row.display_name || "U").charAt(0))}</div><div><strong>${escapeHtml(row.display_name || "Unknown contact")}</strong><span>${escapeHtml(row.primary_email || `${channelLabel(row.channel)} identity`)}</span><small>${escapeHtml(channelLabel(row.channel))} · ${escapeHtml(titleCase(row.intent || "unclassified"))}</small></div><span>${icons.arrow}</span></button>`).join("") || emptyState("No contacts", "Contacts will appear after the first accepted conversation.")}
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
      <article class="workflow-card muted-card"><div class="workflow-node">+</div><div><strong>Definition editor</strong><span>Reserved for reviewer and admin roles</span><small>The API contract exists. The visual editor lands after live workflow canaries.</small></div><button class="button secondary" disabled>Not enabled</button></article>
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
  const metrics = state.metrics || demoMetrics;
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
  return shell(`
    ${pageHeader("Settings", "Deployment-visible configuration only. Secrets remain in the gateway and AIMS.")}
    <div class="settings-grid">
      <section class="panel settings-card"><h3>Console connection</h3><dl><div><dt>API gateway</dt><dd>${escapeHtml(config.apiBaseUrl)}</dd></div><div><dt>Mode</dt><dd>${config.demoMode ? "Explicit demo" : "Live"}</dd></div><div><dt>API version</dt><dd>${escapeHtml(state.bootstrap?.apiVersion || "Unknown")}</dd></div></dl></section>
      <section class="panel settings-card"><h3>Verified identity</h3><dl><div><dt>Actor</dt><dd>${escapeHtml(identity.actor || "Unknown")}</dd></div><div><dt>Role</dt><dd>${escapeHtml(titleCase(identity.role || "read_only"))}</dd></div><div><dt>Strategy</dt><dd>${escapeHtml(identity.strategy || "Unknown")}</dd></div></dl></section>
      <section class="panel settings-card"><h3>Responsive contract</h3><dl><div><dt>Minimum width</dt><dd>${escapeHtml(state.bootstrap?.responsiveContract?.minimumWidth || 320)}px</dd></div><div><dt>Pagination</dt><dd>${escapeHtml(state.bootstrap?.responsiveContract?.pagination || "cursor")}</dd></div><div><dt>Actions</dt><dd>${escapeHtml((state.bootstrap?.responsiveContract?.actions || []).join(", "))}</dd></div></dl></section>
      <section class="panel settings-card"><h3>Security boundary</h3><p>The browser holds no AIMS delegation secret. HIVE identity verification and HMAC signing happen in the edge gateway before AIMS performs its own RBAC checks.</p></section>
    </div>
  `);
}

function workspaceView() {
  if (state.loading && !state.workspace) return shell(`${pageHeader("Conversation", "Loading the verified thread and operational context.")}<div class="workspace-skeleton"><i></i><i></i><i></i></div>`);
  if (!state.workspace) return shell(`${pageHeader("Conversation unavailable", "The requested workspace could not be loaded.")} ${emptyState("No conversation selected", "Return to the unified inbox and choose a conversation.")}`);
  const workspace = state.workspace.workspace || state.workspace;
  const conversation = workspace.conversation || {};
  const contact = conversation.contact || {};
  const operations = workspace.operations || {};
  const aiState = workspace.ai?.state || workspace.ai?.summary || {};
  const drafts = workspace.ai?.drafts || [];
  const approvals = workspace.ai?.approvals || [];
  const role = state.bootstrap?.identity?.role || "read_only";
  const canReply = roleAllows(role, "reply");
  const canApprove = roleAllows(role, "approve");
  return shell(`
    <section class="workspace-header">
      <button class="back-button" data-view="inbox">‹ <span>Inbox</span></button>
      <div><div class="workspace-title"><h1>${escapeHtml(conversation.subject || "Conversation")}</h1>${statusPill(operations.operational_status || conversation.status)}</div><p>${escapeHtml(contact.display_name || contact.primary_email || "Unknown contact")} · ${escapeHtml(channelLabel(conversation.channel))} · Updated ${escapeHtml(formatRelativeTime(conversation.last_message_at))}</p></div>
      <div class="workspace-actions">
        ${canReply ? `<button class="button secondary" data-action="analyse">Run AI analysis</button>` : ""}
        <select id="workspace-status" aria-label="Conversation status" ${roleAllows(role, "status") ? "" : "disabled"}>
          ${["open", "pending", "snoozed", "resolved", "blocked", "quarantined", "archived", "escalated"].map((status) => `<option value="${status}" ${(operations.operational_status || conversation.status) === status ? "selected" : ""}>${titleCase(status)}</option>`).join("")}
        </select>
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
            <textarea name="message" rows="3" maxlength="20000" placeholder="Write an operator reply…" required></textarea>
            <div><span>Sent through ${escapeHtml(channelLabel(conversation.channel))}; AIMS applies provider and approval rules.</span><button class="button primary" type="submit">Send reply</button></div>
          </form>
        ` : `<div class="read-only-banner">Read-only role. Reply and mutation controls are disabled.</div>`}
      </section>
      <aside class="workspace-aside">
        <section class="panel detail-card">
          <header><strong>Contact</strong></header>
          <div class="contact-hero"><div class="avatar large">${escapeHtml((contact.display_name || "U").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(contact.display_name || "Unknown contact")}</strong><span>${escapeHtml(contact.primary_email || "No email recorded")}</span><small>${escapeHtml(contact.phone || conversation.provider || "")}</small></div></div>
          <dl><div><dt>Owner</dt><dd>${escapeHtml(operations.owner_id || "Unassigned")}</dd></div><div><dt>Response target</dt><dd>${escapeHtml(operations.response_due_at ? formatDateTime(operations.response_due_at) : "Not set")}</dd></div><div><dt>Workflow</dt><dd>${escapeHtml(titleCase(conversation.workflow || "unassigned"))}</dd></div></dl>
          ${roleAllows(role, "assign") ? `<form id="assignment-form" class="inline-form"><input name="ownerId" value="${escapeHtml(operations.owner_id || "")}" placeholder="Owner ID" required><select name="ownerType"><option value="person">Person</option><option value="team">Team</option><option value="automation">Automation</option></select><button class="button secondary" type="submit">Assign</button></form>` : ""}
        </section>
        <section class="panel detail-card ai-card">
          <header><strong>AIMS analysis</strong><span class="ai-state risk-${escapeHtml(aiState.risk_level || "unknown")}">${escapeHtml(titleCase(aiState.risk_level || "Unanalysed"))}</span></header>
          <p class="ai-summary">${escapeHtml(aiState.summary_text || "No current summary has been returned.")}</p>
          <dl><div><dt>Intent</dt><dd>${escapeHtml(titleCase(aiState.intent || "Unknown"))}</dd></div><div><dt>Priority</dt><dd>${escapeHtml(titleCase(aiState.priority_label || "Unknown"))}${aiState.priority_score !== undefined ? ` (${escapeHtml(aiState.priority_score)})` : ""}</dd></div><div><dt>Sentiment</dt><dd>${escapeHtml(titleCase(aiState.sentiment || "Unknown"))}</dd></div><div><dt>Next action</dt><dd>${escapeHtml(aiState.next_action || "Not set")}</dd></div></dl>
          ${drafts.length ? `<div class="draft-box"><strong>Latest draft</strong><p>${escapeHtml(drafts[0].body_text || drafts[0].content || "")}</p></div>` : ""}
          ${approvals.length ? `<div class="approval-box"><strong>Approval required</strong><p>${escapeHtml(approvals[0].rationale || "Review the action scope and evidence.")}</p>${canApprove ? `<div><button class="button secondary" data-approval-id="${escapeHtml(approvals[0].id)}" data-decision="reject">Reject</button><button class="button primary" data-approval-id="${escapeHtml(approvals[0].id)}" data-decision="approve">Approve</button></div>` : ""}</div>` : ""}
        </section>
        ${workspace.chatSession ? `<section class="panel detail-card"><header><strong>Chat control</strong>${statusPill(workspace.chatSession.mode || "automation")}</header><p>Switching mode updates AIMS persistent takeover state. It does not discard the thread.</p>${roleAllows(role, "takeover") ? `<div class="button-row"><button class="button secondary" data-takeover="human">Take over</button><button class="button secondary" data-takeover="automation">Return to AIMS</button></div>` : ""}</section>` : ""}
        <section class="panel detail-card">
          <header><strong>Private notes</strong><span>${workspace.notes?.length || 0}</span></header>
          <div class="notes-list">${(workspace.notes || []).slice(0, 4).map((note) => `<article><strong>${escapeHtml(note.author || note.created_by || "Operator")}</strong><p>${escapeHtml(note.body_text || "")}</p><small>${escapeHtml(formatRelativeTime(note.created_at))}</small></article>`).join("") || `<p class="muted">No private notes.</p>`}</div>
          ${roleAllows(role, "note") ? `<form id="note-form" class="note-form"><textarea name="bodyText" rows="2" placeholder="Add a private note" required></textarea><button class="button secondary" type="submit">Add note</button></form>` : ""}
        </section>
      </aside>
    </div>
  `);
}

function errorView() {
  return shell(`
    ${pageHeader("Connection not ready", "The console did not replace a failed live request with demo data.")}
    <section class="connection-error panel"><div class="error-orb">!</div><h2>${escapeHtml(state.error?.message || "AIMS gateway could not be reached.")}</h2><p>Check the gateway URL, HIVE session verification and AIMS Comms Hub readiness. Demo mode remains available only through an explicit <code>?demo=1</code> query.</p><div><button class="button primary" data-action="refresh">Try again</button><a class="button secondary" href="?demo=1">Open explicit demo</a></div></section>
  `);
}

function render() {
  if (state.error && !state.bootstrap) {
    root.innerHTML = errorView();
    bindEvents();
    return;
  }
  const views = {
    dashboard: dashboardView,
    inbox: inboxView,
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
    if (event.key === "Enter" || event.key === " ") openConversation(row.dataset.conversationId);
  }));
  root.querySelectorAll("[data-filter]").forEach((control) => control.addEventListener("change", () => {
    const key = control.dataset.filter;
    state.filters[key] = control.type === "checkbox" ? control.checked : control.value;
    render();
  }));
  root.querySelector("#global-search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    if (!["dashboard", "inbox"].includes(state.view)) state.view = "inbox";
    render();
    requestAnimationFrame(() => {
      const input = root.querySelector("#global-search");
      input?.focus();
      input?.setSelectionRange(state.search.length, state.search.length);
    });
  });
  root.querySelector('[data-action="clear-filters"]')?.addEventListener("click", () => { state.filters = { status: "", channel: "", priority: "", ownerId: "", tag: "", overdue: false, aiStatus: "" }; render(); });
  root.querySelectorAll('[data-action="refresh"]').forEach((button) => button.addEventListener("click", loadBootstrap));
  root.querySelector('[data-action="open-sidebar"]')?.addEventListener("click", () => { state.sidebarOpen = true; render(); });
  root.querySelectorAll('[data-action="close-sidebar"]').forEach((button) => button.addEventListener("click", () => { state.sidebarOpen = false; render(); }));
  root.querySelectorAll('[data-action="toggle-notifications"]').forEach((button) => button.addEventListener("click", () => { state.notificationOpen = !state.notificationOpen; render(); }));
  root.querySelectorAll("[data-notification-id]").forEach((button) => button.addEventListener("click", () => openNotification(button)));
  root.querySelector("#workspace-status")?.addEventListener("change", updateWorkspaceStatus);
  root.querySelector("#assignment-form")?.addEventListener("submit", submitAssignment);
  root.querySelector("#note-form")?.addEventListener("submit", submitNote);
  root.querySelector("#reply-form")?.addEventListener("submit", submitReply);
  root.querySelector('[data-action="analyse"]')?.addEventListener("click", analyseConversation);
  root.querySelectorAll("[data-takeover]").forEach((button) => button.addEventListener("click", () => changeTakeover(button.dataset.takeover)));
  root.querySelectorAll("[data-approval-id]").forEach((button) => button.addEventListener("click", () => decideApproval(button.dataset.approvalId, button.dataset.decision)));
  root.querySelector('[data-action="load-quarantine"]')?.addEventListener("click", loadQuarantine);
  root.querySelectorAll("[data-replay-id]").forEach((button) => button.addEventListener("click", () => replayQuarantine(button.dataset.replayId)));
  root.querySelector('[data-action="load-metrics"]')?.addEventListener("click", loadMetrics);
}

function navigate(view) {
  state.view = view;
  state.sidebarOpen = false;
  state.notificationOpen = false;
  if (view === "quarantine" && !state.quarantine.length) loadQuarantine();
  else if (view === "analytics" && !state.metrics) loadMetrics();
  else render();
  history.replaceState(null, "", `${location.pathname}${config.demoMode ? "?demo=1" : ""}#${view}`);
}

async function openConversation(conversationId) {
  state.selectedConversationId = conversationId;
  state.view = "workspace";
  state.workspace = null;
  state.loading = true;
  state.notificationOpen = false;
  render();
  try {
    state.workspace = config.demoMode ? demoWorkspace(conversationId) : await client.workspace(conversationId);
    state.error = null;
  } catch (error) {
    toast(error.message || "Conversation could not be loaded.", "error");
  } finally {
    state.loading = false;
    render();
  }
}

async function loadBootstrap() {
  state.loading = true;
  state.error = null;
  try {
    const payload = config.demoMode ? demoBootstrap : await client.bootstrap();
    state.bootstrap = payload;
    state.queue = payload.queue || payload.conversations || [];
    state.notifications = payload.notifications || [];
    state.view = location.hash.slice(1) && navItems.some(([key]) => key === location.hash.slice(1)) ? location.hash.slice(1) : state.view;
  } catch (error) {
    state.error = error instanceof Error ? error : new Error(String(error));
  } finally {
    state.loading = false;
    render();
  }
}

async function loadQuarantine() {
  try {
    state.quarantine = config.demoMode ? demoQuarantine : (await client.quarantine({ status: "quarantined", limit: 100 })).items || [];
    state.view = "quarantine";
    render();
  } catch (error) { toast(error.message || "Quarantine could not be loaded.", "error"); }
}

async function loadMetrics() {
  try {
    state.metrics = config.demoMode ? demoMetrics : (await client.metrics()).metrics;
    state.view = "analytics";
    render();
  } catch (error) { toast(error.message || "Metrics could not be loaded.", "error"); }
}

async function updateWorkspaceStatus(event) {
  const status = event.target.value;
  try {
    if (!config.demoMode) await client.updateStatus(state.selectedConversationId, status, { expectedVersion: state.workspace?.workspace?.operations?.version ?? null });
    const operations = state.workspace?.workspace?.operations;
    if (operations) operations.operational_status = status;
    const queueItem = state.queue.find((row) => row.id === state.selectedConversationId);
    if (queueItem) queueItem.operational_status = status;
    toast(`Conversation moved to ${titleCase(status)}.`);
  } catch (error) { toast(error.message || "Status could not be updated.", "error"); }
}

async function submitAssignment(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const assignment = { ownerId: String(data.get("ownerId") || ""), ownerType: String(data.get("ownerType") || "person"), expectedVersion: state.workspace?.workspace?.operations?.version ?? null };
  try {
    if (!config.demoMode) await client.assign(state.selectedConversationId, assignment);
    const operations = state.workspace?.workspace?.operations;
    if (operations) Object.assign(operations, { owner_id: assignment.ownerId, owner_type: assignment.ownerType });
    toast("Assignment updated.");
  } catch (error) { toast(error.message || "Assignment could not be updated.", "error"); }
}

async function submitNote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const bodyText = String(data.get("bodyText") || "").trim();
  if (!bodyText) return;
  try {
    const result = config.demoMode ? { note: { id: `note-${Date.now()}`, author: state.bootstrap.identity.actor, body_text: bodyText, created_at: new Date().toISOString() } } : await client.addNote(state.selectedConversationId, { bodyText, mentions: [] });
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
    if (!config.demoMode) {
      if (conversation.channel === "chat") await client.sendChat(state.selectedConversationId, message);
      else if (conversation.channel === "email") await client.sendEmail(state.selectedConversationId, { message, bodyText: message });
      else throw new AimsApiError("This first console slice sends direct replies only for chat and email. Social replies remain approval/action scoped.", { status: 409, code: "ui_social_action_required" });
    }
    conversation.messages = [...(conversation.messages || []), { id: `local-${Date.now()}`, direction: "outbound", sender: state.bootstrap.identity.actor, body_text: message, received_at: new Date().toISOString() }];
    form.reset();
    toast(config.demoMode ? "Demo reply added locally." : "Reply sent through AIMS.");
  } catch (error) { toast(error.message || "Reply could not be sent.", "error"); }
}

async function analyseConversation() {
  try {
    if (!config.demoMode) await client.analyse(state.selectedConversationId, { operation: "operator_refresh", scheduleFollowUp: true });
    toast(config.demoMode ? "Demo analysis is already present." : "AIMS analysis started.");
  } catch (error) { toast(error.message || "Analysis could not be started.", "error"); }
}

async function changeTakeover(mode) {
  try {
    if (!config.demoMode) await client.takeover(state.selectedConversationId, mode);
    state.workspace.workspace.chatSession.mode = mode;
    toast(mode === "human" ? "Human takeover enabled." : "Conversation returned to AIMS automation.");
  } catch (error) { toast(error.message || "Takeover mode could not be changed.", "error"); }
}

async function decideApproval(approvalId, decision) {
  try {
    if (!config.demoMode) await client.decideApproval(approvalId, decision, "Decision recorded in AIMS UI");
    state.workspace.workspace.ai.approvals = (state.workspace.workspace.ai.approvals || []).filter((approval) => approval.id !== approvalId);
    toast(`Approval ${decision === "approve" ? "granted" : "rejected"}.`);
  } catch (error) { toast(error.message || "Approval decision could not be recorded.", "error"); }
}

async function replayQuarantine(id) {
  try {
    if (!config.demoMode) await client.replayQuarantine(id);
    state.quarantine = state.quarantine.filter((item) => item.id !== id);
    toast("Replay accepted with idempotency protection.");
  } catch (error) { toast(error.message || "Quarantine item could not be replayed.", "error"); }
}

async function openNotification(button) {
  const id = button.dataset.notificationId;
  const conversationId = button.dataset.conversationId;
  try {
    if (!config.demoMode) await client.markNotification(id, "read");
    const notification = state.notifications.find((item) => item.id === id);
    if (notification) notification.status = "read";
  } catch {}
  if (conversationId) openConversation(conversationId);
  else { state.notificationOpen = false; render(); }
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    root.querySelector("#global-search")?.focus();
  }
  if (event.key === "Escape" && (state.sidebarOpen || state.notificationOpen)) {
    state.sidebarOpen = false;
    state.notificationOpen = false;
    render();
  }
});

loadBootstrap();
