import type { ActivityEvent, Role, User } from "@/core/operon";
import { logAdminAction } from "@/admin/audit";
import { saveRole, deleteRole, saveActivity } from "@/services/api";
import { createActivityEvent } from "@/services/activity";
import {
  requireRoleManagementPermission,
} from "@/security/accessControl";

/**
 * Saves a role and records an audit event.
 * Requires the actor to have role management permission.
 * Accepts User | null — the permission guard handles the null case
 * with a clear error message.
 */
export function saveRoleWithAudit(actor: User | null, role: Role): Role {
  requireRoleManagementPermission(actor);

  const saved = saveRole(role);

  saveActivity(createActivityEvent({
    userId: actor.id,
    action: "ROLE_ASSIGNED",
    targetType: "user",
    targetId: role.id,
    metadata: { roleName: role.name },
  }));

  return saved;
}

/**
 * Deletes a role and records an audit event.
 * Returns true if the role was found and removed, false if it didn't exist.
 */
export function deleteRoleWithAudit(actor: User | null, roleId: string): boolean {
  requireRoleManagementPermission(actor);

  const removed = deleteRole(roleId);

  if (removed) {
    saveActivity(logAdminAction(actor, `Deleted role: ${roleId}`));
  }

  return removed;
}

/**
 * Creates an admin audit event.
 * Requires the actor to have role management permission.
 */
export function createAdminAuditEvent(
  actor: User | null,
  description: string
): ActivityEvent {
  requireRoleManagementPermission(actor);
  return logAdminAction(actor, description);
}