import type { ActivityEvent, User } from "@/core/operon";

export function createActivityEvent(event: Omit<ActivityEvent, "id" | "timestamp">): ActivityEvent {
  return {
    id: `activity_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
}

export function filterActivityForUser(user: User | null, events: ActivityEvent[]): ActivityEvent[] {
  if (!user) {
    return [];
  }

  return events.filter((event) => {
    if (event.userId === user.id) {
      return true;
    }
    if (user.roleId === "role_admin" || user.roleId === "role_cofounder") {
      return true;
    }
    return event.targetType === "system";
  });
}
