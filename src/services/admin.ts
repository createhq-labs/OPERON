import type { ActivityEvent, Role, User } from "@/core/operon";
import { recordActivity } from "@/core/operon";
import { logAdminAction } from "@/admin/audit";
import { saveRole, deleteRole } from "@/services/api";
import { requireAuthenticatedUser, requireRoleManagementPermission } from "@/security/accessControl";

export function saveRoleWithAudit(actor: User, role: Role) {
  requireAuthenticatedUser(actor);
  requireRoleManagementPermission(actor);

  const saved = saveRole(role);

  recordActivity({
    userId: actor.id,
    action: "ROLE_ASSIGNED",
    targetType: "user",
    targetId: role.id,
    metadata: { role: role.name },
  });

  return saved;
}

export function deleteRoleWithAudit(actor: User, roleId: string) {
  requireAuthenticatedUser(actor);
  requireRoleManagementPermission(actor);

  const removed = deleteRole(roleId);

  if (removed) {
    recordActivity(logAdminAction(actor, `Deleted role ${roleId}`));
  }

  return removed;
}

export function createAdminAuditEvent(actor: User, description: string): ActivityEvent {
  requireAuthenticatedUser(actor);
  requireRoleManagementPermission(actor);
  return logAdminAction(actor, description);
}
