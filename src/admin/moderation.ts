import type { Document, ResourceItem, ActivityEvent, User } from "@/core/operon";

export function flagDocument(document: Document, reason: string): ActivityEvent {
  return {
    id: `activity_${crypto.randomUUID()}`,
    userId: document.authorId,
    action: "SYSTEM_EVENT",
    targetType: "document",
    targetId: document.id,
    timestamp: new Date().toISOString(),
    metadata: {
      event: "document_flagged",
      reason,
    },
  };
}

export function flagResource(resource: ResourceItem, reason: string, user: User): ActivityEvent {
  return {
    id: `activity_${crypto.randomUUID()}`,
    userId: user.id,
    action: "SYSTEM_EVENT",
    targetType: "resource",
    targetId: resource.id,
    timestamp: new Date().toISOString(),
    metadata: {
      event: "resource_flagged",
      reason,
    },
  };
}
