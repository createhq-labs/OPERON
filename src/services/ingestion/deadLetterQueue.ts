import type { IngestionJob, IngestionFailure } from "./types";

const deadLetterJobs: Array<{ job: IngestionJob; failure: IngestionFailure }> = [];

export function addToDeadLetterQueue(job: IngestionJob, failure: IngestionFailure) {
  deadLetterJobs.push({ job, failure });
}

export function getDeadLetterQueue() {
  return [...deadLetterJobs];
}

export function clearDeadLetterQueue() {
  deadLetterJobs.splice(0, deadLetterJobs.length);
}
