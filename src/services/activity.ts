import type { ActivityEvent, User } from "@/core/operon";
import { isAdmin } from "@/core/operon";
import { canViewActivity } from "@/security/permissions";

/**
 * Creates a new ActivityEvent with a generated ID and current timestamp.
 * The caller provides all domain fields; ID and timestamp are system-generated.
 */
export function createActivityEvent(
  event: Omit<ActivityEvent, "id" | "timestamp">
): ActivityEvent {
  return {
    id: `activity_${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
}

/**
 * Filters an activity feed to the events visible to `user`.
 *
 * Rules:
 * - Unauthenticated users see nothing.
 * - Admins and users with the `view_activity` permission see all events.
 * - All other users see only their own events and system-level events.
 */
export function filterActivityForUser(
  user: User | null,
  events: ActivityEvent[]
): ActivityEvent[] {
  if (!user) return [];

  if (isAdmin(user) || canViewActivity(user)) {
    return events;
  }

  return events.filter(
    (event) => event.userId === user.id || event.targetType === "system"
  );
}