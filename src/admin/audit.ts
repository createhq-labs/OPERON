import type { ActivityEvent, User } from "@/core/operon";

export function logAdminAction(user: User, description: string): ActivityEvent {
  return {
    id: `activity_${crypto.randomUUID()}`,
    userId: user.id,
    action: "SYSTEM_EVENT",
    targetType: "system",
    timestamp: new Date().toISOString(),
    metadata: {
      description,
      actor: user.name,
    },
  };
}

export function filterAdminEvents(events: ActivityEvent[], user: User): ActivityEvent[] {
  if (user.roleId === "role_admin" || user.roleId === "role_cofounder") {
    return events;
  }
  return events.filter((event) => event.userId === user.id);
}
