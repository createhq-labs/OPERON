import type { DocumentState } from "@/core/operon";

export const LIFECYCLE_TRANSITIONS: Record<DocumentState, DocumentState[]> = {
  draft: ["uploaded", "archived"],
  uploaded: ["processing", "archived"],
  processing: ["parsed", "failed", "archived"],
  parsed: ["review", "published", "archived"],
  review: ["approved", "failed", "archived"],
  approved: ["published", "archived"],
  published: ["archived"],
  archived: [],
  failed: ["review", "archived"],
};

export function canTransitionLifecycle(from: DocumentState, to: DocumentState) {
  return LIFECYCLE_TRANSITIONS[from]?.includes(to);
}

export function transitionLifecycleState(current: DocumentState, next: DocumentState) {
  if (!canTransitionLifecycle(current, next)) {
    throw new Error(`Invalid lifecycle transition from ${current} to ${next}`);
  }
  return next;
}
