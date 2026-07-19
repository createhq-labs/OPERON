import type { IngestionJob, IngestionJobInput } from "./types";
import { saveIngestionJob, getIngestionJobs as getPersistedIngestionJobs } from "@/services/api";

const ingestionQueue: IngestionJob[] = [];

function createJobRecord(input: IngestionJobInput): IngestionJob {
  const now = new Date().toISOString();
  return {
    id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "queued",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

export function enqueueIngestionJob(input: IngestionJobInput) {
  const existing = ingestionQueue.find(
    (job) => job.documentId === input.documentId && job.status !== "completed"
  );

  if (existing) {
    return existing;
  }

  const job = createJobRecord(input);
  ingestionQueue.push(job);
  saveIngestionJob(job);
  return job;
}

export function getIngestionJobs() {
  const persisted = getPersistedIngestionJobs();
  const pending = persisted.filter((job) => job.status === "queued" || job.status === "retrying" || job.status === "processing");

  pending.forEach((job) => {
    if (!ingestionQueue.some((queued) => queued.id === job.id)) {
      ingestionQueue.push(job);
    }
  });

  return [...ingestionQueue];
}

export function dequeueIngestionJob() {
  const now = new Date();
  const index = ingestionQueue.findIndex((job) =>
    (job.status === "queued" || job.status === "retrying") &&
    (!job.nextRunAt || new Date(job.nextRunAt) <= now)
  );

  if (index === -1) {
    return undefined;
  }

  const [job] = ingestionQueue.splice(index, 1);
  return job;
}

export function updateIngestionJob(updated: IngestionJob) {
  const existing = ingestionQueue.find((job) => job.id === updated.id);
  if (existing) {
    Object.assign(existing, updated, { updatedAt: new Date().toISOString() });
  }
  saveIngestionJob(updated);
  return updated;
}

