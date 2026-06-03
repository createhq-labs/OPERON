export interface OcrPreprocessOptions {
  normalizeContrast?: boolean;
  deskew?: boolean;
  enhanceText?: boolean;
}

export function preprocessImageData(data: ArrayBuffer, options: OcrPreprocessOptions = {}) {
  return {
    processedAt: new Date().toISOString(),
    normalizeContrast: options.normalizeContrast ?? true,
    deskew: options.deskew ?? true,
    enhanceText: options.enhanceText ?? false,
    sourceSize: data.byteLength,
  };
}
