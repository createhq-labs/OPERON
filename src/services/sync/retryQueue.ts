import type { PendingUploadCacheItem } from "@/services/cache";

const RETRY_QUEUE_KEY = "operon.retry.queue";

type RetryRecord = {
  id: string;
  type: "pending-upload";
  payload: PendingUploadCacheItem;
  createdAt: string;
};

function readQueue(): RetryRecord[] {
  return [];
}

function writeQueue(records: RetryRecord[]) {
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

export function dequeueRetryUpload(id: string) {
  const queue = readQueue();
  writeQueue(queue.filter((task) => task.id !== id));
}

export function readPendingRetryUploads(): PendingUploadCacheItem[] {
  return readQueue().map((task) => task.payload);
}
