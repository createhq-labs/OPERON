import { parseUploadedFile, parseGoogleDriveDocument } from "@/services/parser";

self.addEventListener("message", async (event) => {
  const input = event.data;
  try {
    let parsed;
    if (input?.source === "googleDrive" && input?.document) {
      parsed = parseGoogleDriveDocument(input.document);
    } else if (input?.file) {
      parsed = await parseUploadedFile(input.file);
    } else if (typeof input?.rawText === "string") {
      const fileName = input.fileName || "document.txt";
      parsed = await parseUploadedFile(new File([input.rawText], fileName, { type: input.mimeType || "text/plain" }));
    } else {
      throw new Error("Unsupported parser worker input.");
    }

    self.postMessage({ status: "parsed", parsed, inputId: input?.id });
  } catch (error) {
    self.postMessage({ status: "failed", error: String(error), inputId: input?.id });
  }
});

export function startParserWorker() {
  if (typeof Worker === "undefined") {
    return null;
  }

  const worker = new Worker(new URL("./parser.worker.ts", import.meta.url), { type: "module" });
  return worker;
}
