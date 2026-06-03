export interface OcrDetectionResult {
  hasScannedContent: boolean;
  confidence: number;
  pages: number;
}

export interface OcrProvider {
  name: string;
  detectScannedPdf(file: File | ArrayBuffer): Promise<OcrDetectionResult>;
}
