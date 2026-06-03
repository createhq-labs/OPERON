export type OcrEngineStatus = "idle" | "initialized" | "unavailable";

export interface OcrResult {
  text: string;
  warnings: string[];
}

const GOOGLE_CLOUD_VISION_API_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY ?? "";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(buffer).toString("base64");
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return typeof btoa === "function" ? btoa(binary) : "";
}

export function loadOcrEngine(): OcrEngineStatus {
  return GOOGLE_CLOUD_VISION_API_KEY ? "initialized" : "unavailable";
}

export async function extractTextWithOcr(data: ArrayBuffer): Promise<OcrResult> {
  if (!GOOGLE_CLOUD_VISION_API_KEY) {
    throw new Error("OCR engine is not configured. Set GOOGLE_CLOUD_VISION_API_KEY to enable OCR.");
  }

  const imageContent = arrayBufferToBase64(data);
  if (!imageContent) {
    throw new Error("Unable to encode OCR input to base64.");
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(GOOGLE_CLOUD_VISION_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageContent },
            features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
          },
        ],
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`OCR provider request failed: ${JSON.stringify(payload)}`);
  }

  const text = payload.responses?.[0]?.fullTextAnnotation?.text ?? "";
  const warnings: string[] = [];
  if (!text) {
    warnings.push("OCR completed but did not return any recognized text.");
  }

  return {
    text,
    warnings,
  };
}
