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

export function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}
