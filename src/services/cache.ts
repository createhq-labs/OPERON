import type { DeptId } from "@/core/operon";

/**
 * Represents a file upload that could not be immediately written to storage
 * (e.g. Supabase is unavailable) and has been queued for retry.
 */
export interface PendingUploadCacheItem {
  id: string;
  fileName: string;
  tag?: string;
  departmentId?: DeptId;
  authorId: string;
  createdAt: string;
  /** True when the upload has been queued but not yet confirmed by storage. */
  syncPending: boolean;
  error?: string;
}