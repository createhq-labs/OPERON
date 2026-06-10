import type { IngestionJob } from "@/services/ingestion/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IngestionJobStatus =
  | "queued"
  | "processing"
  | "retrying"
  | "completed"
  | "failed";

export interface IngestionHealth {
  total: number;
  queued: number;
  processing: number;
  retrying: number;
  completed: number;
  failed: number;
  /** Jobs that have exceeded the attempt threshold and need attention. */
  stale: IngestionJob[];
  /** Throughput: completed jobs in the last 60 minutes. */
  recentCompleted: number;
}

export interface IngestionJobSummary {
  documentId: string;
  status: IngestionJobStatus;
  attempts: number;
  parserType: string;
  mimeType: string;
  error?: string;
  enqueuedAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Jobs with at least this many attempts are flagged as stale. */
const STALE_ATTEMPT_THRESHOLD = 3;

/** Window for "recent" throughput measurement (ms). */
const THROUGHPUT_WINDOW_MS = 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function getIngestionHealth(jobs: IngestionJob[]): IngestionHealth {
  const now = Date.now();
  const windowStart = now - THROUGHPUT_WINDOW_MS;

  const stale = jobs.filter(
    (j) =>
      (j.status === "queued" ||
        j.status === "retrying" ||
        j.status === "failed") &&
      (j.retryCount ?? 0) >= STALE_ATTEMPT_THRESHOLD
  );

  const recentCompleted = jobs.filter(
    (j) =>
      j.status === "completed" &&
      j.completedAt &&
      new Date(j.completedAt).getTime() > windowStart
  ).length;

  return {
    total: jobs.length,
    queued: jobs.filter(
      (j) => j.status === "queued" || j.status === "retrying"
    ).length,
    processing: jobs.filter((j) => j.status === "processing").length,
    retrying: jobs.filter((j) => j.status === "retrying").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    stale,
    recentCompleted,
  };
}

// ---------------------------------------------------------------------------
// Per-document history
// ---------------------------------------------------------------------------

/**
 * Returns all ingestion jobs for a specific document, ordered newest first.
 */
export function getJobsForDocument(
  jobs: IngestionJob[],
  documentId: string
): IngestionJob[] {
  return jobs
    .filter((j) => j.documentId === documentId)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
}

/**
 * Returns a lightweight summary for every job, suitable for admin list views.
 */
export function summariseIngestionJobs(
  jobs: IngestionJob[]
): IngestionJobSummary[] {
  return jobs.map((j) => ({
    documentId: j.documentId,
    status: j.status as IngestionJobStatus,
    attempts: j.retryCount ?? 0,
    parserType: j.parserType ?? "unknown",
    mimeType: j.mimeType ?? "unknown",
    error: j.lastError,
    enqueuedAt: j.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Retry surface
// ---------------------------------------------------------------------------

/**
 * Returns all jobs that are eligible for a manual retry:
 * failed jobs and stale queued/retrying jobs.
 */
export function getRetryableJobs(jobs: IngestionJob[]): IngestionJob[] {
  return jobs.filter(
    (j) =>
      j.status === "failed" ||
      ((j.status === "queued" || j.status === "retrying") &&
        (j.retryCount ?? 0) >= STALE_ATTEMPT_THRESHOLD)
  );
}

/**
 * Filters jobs to those currently blocked (failed or stale), grouped by
 * parser type for triage.
 */
export function getBlockedJobsByParser(
  jobs: IngestionJob[]
): Record<string, IngestionJob[]> {
  const retryable = getRetryableJobs(jobs);
  const grouped: Record<string, IngestionJob[]> = {};
  for (const job of retryable) {
    const key = job.parserType ?? "unknown";
    (grouped[key] ??= []).push(job);
  }
  return grouped;
}