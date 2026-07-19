import type { PendingUploadCacheItem } from "@/services/cache";

type RetryRecord = {
  id: string;
  type: "pending-upload";
  payload: PendingUploadCacheItem;
  createdAt: string;
};

function readQueue(): RetryRecord[] {
  return [];
}

function writeQueue(_records: RetryRecord[]) {
  // In production, retry queue persistence is disabled and uploads must be handled through Supabase.
}

export function enqueueRetryUpload(payload: PendingUploadCacheItem) {
  const queue = readQueue();
  const record: RetryRecord = {
    id: payload.id,
    type: "pending-upload",
    payload,
    createdAt: new Date().toISOString(),
  };
  const filtered = queue.filter((item) => item.id !== payload.id);
  filtered.push(record);
  writeQueue(filtered);
}

