import type { ActivityEvent, User } from "@/core/operon";

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