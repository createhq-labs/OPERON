import type { IngestionStatus } from "./types";

export function isTerminalStatus(status: IngestionStatus) {
  return status === "completed" || status === "failed";
}

export function isRetryableStatus(status: IngestionStatus) {
  return status === "failed" || status === "retrying";
}

export function normalizeIngestionStatus(status: string | undefined): IngestionStatus {
  if (
    status === "uploaded" ||
    status === "queued" ||
    status === "processing" ||
    status === "parsed" ||
    status === "indexed" ||
    status === "completed" ||
    status === "failed" ||
    status === "retrying"
  ) {
    return status;
  }
  return "queued";
}
