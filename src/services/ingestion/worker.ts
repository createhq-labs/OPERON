import { dequeueIngestionJob, updateIngestionJob, enqueueIngestionJob } from "./queue";
import { processIngestionJob, createFallbackIngestionFailure } from "./processor";
import { calculateRetryDelay, shouldRetry } from "./retry";
import { saveIngestionFailure, saveActivity } from "@/services/api";
import type { IngestionJob } from "./types";

let workerActive = false;

async function processJob(job: IngestionJob) {
  try {
    await processIngestionJob(job);
  } catch (error) {
    if (shouldRetry(job)) {
      const delay = calculateRetryDelay(job.retryCount);
      const retryJob: IngestionJob = {
        ...job,
        status: "retrying",
        retryCount: job.retryCount + 1,
        nextRunAt: new Date(Date.now() + delay).toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updateIngestionJob(retryJob);
      setTimeout(() => enqueueIngestionJob(retryJob), delay);
      saveActivity({
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: job.metadata?.authorId as string || "system",
        action: "SYSTEM_EVENT",
        targetType: "document",
        targetId: job.documentId,
        timestamp: new Date().toISOString(),
        metadata: {
          event: "ingestion-retry",
          jobId: job.id,
          retryCount: String(retryJob.retryCount),
        },
      });
      return;
    }

    const failure = createFallbackIngestionFailure(job, error);
    saveIngestionFailure(failure);
    saveActivity({
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId: job.metadata?.authorId as string || "system",
      action: "SYSTEM_EVENT",
      targetType: "document",
      targetId: job.documentId,
      timestamp: new Date().toISOString(),
      metadata: {
        event: "ingestion-failed",
        jobId: job.id,
        failureReason: failure.failureReason,
      },
    });
  }
}

async function runWorker() {
  if (workerActive) {
    return;
  }
  workerActive = true;

  try {
    let nextJob = dequeueIngestionJob();
    while (nextJob) {
      await processJob(nextJob);
      nextJob = dequeueIngestionJob();
    }
  } finally {
    workerActive = false;
  }
}

export function startIngestionWorker() {
  void runWorker();
}
