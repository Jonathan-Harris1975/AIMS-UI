export const COMMS_ROLES = Object.freeze(["admin", "reviewer", "operator", "read_only"]);

export const ROLE_PERMISSIONS = Object.freeze({
  admin: new Set(["read", "reply", "approve", "assign", "status", "note", "takeover", "workflow", "quarantine", "settings", "social_setup"]),
  reviewer: new Set(["read", "reply", "approve", "assign", "status", "note", "takeover", "workflow", "quarantine", "social_setup"]),
  operator: new Set(["read", "reply", "assign", "status", "note", "takeover"]),
  read_only: new Set(["read"]),
});

export function roleAllows(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}

export const OPERATIONAL_STATUSES = Object.freeze([
  "open",
  "pending",
  "snoozed",
  "resolved",
  "blocked",
  "quarantined",
  "archived",
  "escalated",
]);

export const CHANNELS = Object.freeze(["chat", "email", "facebook", "instagram", "youtube", "form"]);
export const PRIORITIES = Object.freeze(["critical", "high", "medium", "low"]);
