import { processIngestionJob } from "@/services/ingestion/processor";

self.addEventListener("message", async (event) => {
  const job = event.data;
  try {
    const result = await processIngestionJob(job);
    self.postMessage({ status: "completed", result, jobId: job.id });
  } catch (error) {
    self.postMessage({ status: "failed", error: String(error), jobId: job?.id });
  }
});

export function startIngestionWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }

  const worker = new Worker(new URL("./ingestion.worker.ts", import.meta.url), { type: "module" });
  return worker;
}
