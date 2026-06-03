import { syncPendingLocalChanges } from "@/services/api";
import { readPendingRetryUploads, dequeueRetryUpload } from "@/services/sync/retryQueue";

export async function reconcilePendingUploads() {
  const pendingUploads = readPendingRetryUploads();
  if (pendingUploads.length === 0) {
    return;
  }

  await syncPendingLocalChanges();
  pendingUploads.forEach((upload) => {
    dequeueRetryUpload(upload.id);
  });
}
