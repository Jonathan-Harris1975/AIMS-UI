export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDateTime(value, fallback = "Unknown") {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(timestamp));
}

export function formatRelativeTime(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return "Unknown";
  const difference = timestamp - now;
  const absolute = Math.abs(difference);
  const formatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (absolute < 60_000) return formatter.format(Math.round(difference / 1_000), "second");
  if (absolute < 3_600_000) return formatter.format(Math.round(difference / 60_000), "minute");
  if (absolute < 86_400_000) return formatter.format(Math.round(difference / 3_600_000), "hour");
  return formatter.format(Math.round(difference / 86_400_000), "day");
}

export function secondsToAge(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3_600) return `${Math.round(value / 60)}m`;
  if (value < 86_400) return `${Math.round(value / 3_600)}h`;
  return `${Math.round(value / 86_400)}d`;
}

export function titleCase(value) {
  return String(value || "")
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

// Consume the actual AIMS /metrics envelope; absent or obsolete schemas must
// remain visible instead of being converted to plausible zero-valued reports.
export function readCommsMetrics(payload) {
  const metrics = payload?.metrics;
  const count = (value) => {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) {
      throw new TypeError("AIMS returned an invalid metrics response.");
    }
    return Number(value);
  };
  const rows = (value) => {
    if (!Array.isArray(value)) throw new TypeError("AIMS returned an invalid metrics response.");
    return value.map((row) => ({ ...row, count: count(row.count) }));
  };
  if (payload?.ok !== true || !metrics?.responseTime || !metrics?.resolutionTime || !Array.isArray(metrics.channels)) {
    throw new TypeError("AIMS returned an invalid metrics response.");
  }
  const responseSeconds = metrics.responseTime.average_seconds;
  const failures = rows(metrics.failures);
  const autonomy = metrics.autonomyOutcomes === undefined ? null : rows(metrics.autonomyOutcomes);
  const newsletter = metrics.newsletterConfirmations === undefined ? null : rows(metrics.newsletterConfirmations);
  if (payload.workerHealth && (!Array.isArray(payload.workerHealth.workers) || !payload.workerHealth.overall)) {
    throw new TypeError("AIMS returned an invalid worker health response.");
  }
  return {
    period: metrics.period,
    conversations: count(metrics.volume?.conversations),
    averageMinutes: responseSeconds === null ? null : count(responseSeconds) / 60,
    measured: count(metrics.responseTime.measured),
    resolved: count(metrics.resolutionTime.resolved),
    failureCount: failures.reduce((total, row) => total + row.count, 0),
    channels: metrics.channels.map((row) => ({ channel: row.channel, count: count(row.conversations) })),
    autonomy,
    autoSent: autonomy?.filter((row) => row.outcome === "auto_sent").reduce((total, row) => total + row.count, 0) ?? null,
    held: autonomy?.filter((row) => row.outcome === "held_for_review").reduce((total, row) => total + row.count, 0) ?? null,
    newsletter,
    newsletterRequests: metrics.newsletterRequestSignals
      ? Object.fromEntries(Object.entries(metrics.newsletterRequestSignals).map(([key, value]) => [key, count(value)])) : null,
    workerHealth: payload.workerHealth || null,
  };
}
