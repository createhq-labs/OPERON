import type { PendingUploadCacheItem } from "@/services/cache";

const RETRY_QUEUE_KEY = "operon.retry.queue";

type RetryRecord = {
  id: string;
  type: "pending-upload";
  payload: PendingUploadCacheItem;
  createdAt: string;
};

function readQueue(): RetryRecord[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(RETRY_QUEUE_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as RetryRecord[];
  } catch {
    return [];
  }
}

function writeQueue(records: RetryRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(records));
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
