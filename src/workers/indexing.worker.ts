import { indexDocument } from "@/services/search/indexer";

self.addEventListener("message", async (event) => {
  const payload = event.data;
  try {
    const result = await indexDocument(payload);
    self.postMessage({ status: "indexed", result, payloadId: payload?.id });
  } catch (error) {
    self.postMessage({ status: "error", error: String(error), payloadId: payload?.id });
  }
});

export function startIndexingWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }

  const worker = new Worker(new URL("./indexing.worker.ts", import.meta.url), { type: "module" });
  return worker;
}
