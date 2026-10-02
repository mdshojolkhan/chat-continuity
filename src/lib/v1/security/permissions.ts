/**
 * Permission boundaries for V1 skills.
 *
 * Every tool declares the permissions it needs. The registry refuses to run a
 * tool whose permissions are not granted, and every permission that touches the
 * device is denied in this phase.
 *
 * Hard rules for this phase:
 *  - no arbitrary code execution from user messages,
 *  - no device control (calls, SMS, apps, sensors),
 *  - network access is limited to the read-only web search skill,
 *  - file access is limited to V1's own sandboxed workspace (never the host FS).
 */
export const ALL_PERMISSIONS = [
  "read:time",
  "read:conversation",
  "write:memory",
  "write:plan",
  "net:search",
  "fs:workspace",
  "fs:workspace:write",
  "net:fetch",
  "device:control",
  "system:exec",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Permissions granted to tools in the current phase. */
export const GRANTED_PERMISSIONS: readonly Permission[] = [
  "read:time",
  "read:conversation",
  "write:memory",
  "write:plan",
  "net:search",
  "fs:workspace",
  "fs:workspace:write",
];

/** Permissions that must never be granted automatically. */
export const FORBIDDEN_PERMISSIONS: readonly Permission[] = [
  "net:fetch",
  "device:control",
  "system:exec",
];

export function isPermissionGranted(permission: Permission): boolean {
  if (FORBIDDEN_PERMISSIONS.includes(permission)) return false;
  return GRANTED_PERMISSIONS.includes(permission);
}

export function assertPermissions(permissions: readonly Permission[]): void {
  const denied = permissions.filter(
    (permission) => !isPermissionGranted(permission),
  );
  if (denied.length > 0) {
    throw new PermissionDeniedError(denied);
  }
}

/**
 * Who is acting:
 *  - admin:  the single Admin AI (may modify the workspace / drive the App Builder)
 *  - helper: any other AI (chat, analysis, suggestions — read-only workspace)
 *  - user:   a direct human action from the UI (e.g. saving a file in the editor)
 */
export type AiRole = "admin" | "helper" | "user";

/** Permissions each role may never use, regardless of phase grants. */
export const ROLE_DENIED_PERMISSIONS: Record<AiRole, readonly Permission[]> = {
  admin: [],
  helper: ["fs:workspace:write"],
  user: [],
};

export function isAllowedForRole(role: AiRole, permission: Permission): boolean {
  return isPermissionGranted(permission) && !ROLE_DENIED_PERMISSIONS[role].includes(permission);
}

/** Server-side gate: throws when the role may not use these permissions. */
export function assertRolePermissions(role: AiRole, permissions: readonly Permission[]): void {
  assertPermissions(permissions);
  const denied = permissions.filter((p) => ROLE_DENIED_PERMISSIONS[role].includes(p));
  if (denied.length > 0) throw new PermissionDeniedError(denied);
}

export class PermissionDeniedError extends Error {
  readonly denied: readonly Permission[];

  constructor(denied: readonly Permission[]) {
    super(`Permission not granted: ${denied.join(", ")}`);
    this.name = "PermissionDeniedError";
    this.denied = denied;
  }
}
