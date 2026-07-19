import type { IngestionJob } from "./types";

const MAX_INGESTION_RETRIES = 3;

export function calculateRetryDelay(retryCount: number) {
  return Math.min(5000 * 2 ** retryCount, 60000);
}

export function shouldRetry(job: IngestionJob) {
  return job.retryCount < MAX_INGESTION_RETRIES;
}
