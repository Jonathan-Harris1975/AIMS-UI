export const ROLE_PERMISSIONS = Object.freeze({
  admin: new Set(["read", "reply", "approve", "assign", "status", "note", "takeover", "workflow", "quarantine", "settings", "social_setup", "identity", "retention"]),
  reviewer: new Set(["read", "reply", "approve", "assign", "status", "note", "takeover", "workflow", "quarantine", "social_setup", "identity"]),
  operator: new Set(["read", "reply", "assign", "status", "note", "takeover"]),
  read_only: new Set(["read"]),
});

export function roleAllows(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}
