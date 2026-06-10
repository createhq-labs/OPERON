import crypto from "crypto";
import type { Role, ActivityEvent, User } from "@/core/operon";
 
export function getPermissionSummary(
  roles: Role[]
): Array<{ roleId: string; roleName: string; permissions: Role["permissions"] }> {
  return roles.map((role) => ({
    roleId: role.id,
    roleName: role.name,
    permissions: role.permissions,
  }));
}
 
/**
 * Creates a structured admin audit event.
 */
export function logAdminAction(actor: User | null, description: string): ActivityEvent {
  return {
    id: `activity_${crypto.randomUUID()}`,
    userId: actor?.id ?? "system",
    action: "SYSTEM_EVENT",
    targetType: "system",
    targetId: "admin",
    timestamp: new Date().toISOString(),
    metadata: {
      description,
    },
  };
}