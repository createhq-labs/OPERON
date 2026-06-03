import type { IngestionJob } from "@/services/ingestion/types";

export function getIngestionHealth(jobs: IngestionJob[]) {
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === "queued" || job.status === "retrying").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    processing: jobs.filter((job) => job.status === "processing").length,
  };
}
