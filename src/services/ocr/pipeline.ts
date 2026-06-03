import type { OcrProvider } from "./provider";

export interface OcrPipelineContext {
  file: File | ArrayBuffer;
  provider: OcrProvider;
}

export async function runOcrPipeline(context: OcrPipelineContext) {
  const detection = await context.provider.detectScannedPdf(context.file);
  return {
    scanned: detection.hasScannedContent,
    confidence: detection.confidence,
    pages: detection.pages,
  };
}
