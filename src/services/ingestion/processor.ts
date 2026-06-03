import type { IngestionJob, IngestionResult, IngestionFailure } from "./types";
import { runIngestionPipeline } from "./orchestrator";

export async function processIngestionJob(job: IngestionJob): Promise<IngestionResult> {
  return runIngestionPipeline(job);
}

export function createFallbackIngestionFailure(job: IngestionJob, error: unknown): IngestionFailure {
  const failureReason = error instanceof Error ? error.message : String(error);
  return {
    id: `failure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId: job.id,
    documentId: job.documentId,
    status: "failed",
    failureReason,
    attempt: job.retryCount + 1,
    rawError: failureReason,
    failureAt: new Date().toISOString(),
  };
}
