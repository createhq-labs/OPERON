import type { DocumentBlock, ParserResult } from "@/services/parser/types";

// Matches the pdfjs-dist version now pinned in package.json — the worker
// script version must match the library version or pdf.js throws at runtime.
const PDF_WORKER_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

interface PdfTextItem {
  str?: string;
  value?: string;
  transform?: number[];
}

interface PositionedLine {
  y: number;
  text: string;
  fontSize: number;
}

/**
 * Effective font size from a PDF text-rendering matrix [a,b,c,d,e,f] — the
 * magnitude of the vertical basis vector, robust to the common case of
 * unrotated text where this reduces to |d|.
 */
function fontSizeFromTransform(transform: number[] | undefined): number {
  if (!transform || transform.length < 4) return 0;
  return Math.hypot(transform[2], transform[3]);
}

/** Groups raw text items into visual lines by rounded y-position, in reading (top-to-bottom) order. */
function groupItemsIntoLines(items: PdfTextItem[]): PositionedLine[] {
  const TOLERANCE = 2;
  const rows = new Map<number, { parts: string[]; fontSize: number }>();

  for (const item of items) {
    const str = item.str ?? item.value ?? "";
    if (!str) continue;
    const t = item.transform;
    const y = t ? Math.round(t[5] / TOLERANCE) * TOLERANCE : 0;
    const fontSize = fontSizeFromTransform(t);
    const existing = rows.get(y);
    if (existing) {
      existing.parts.push(str);
      existing.fontSize = Math.max(existing.fontSize, fontSize);
    } else {
      rows.set(y, { parts: [str], fontSize });
    }
  }

  return Array.from(rows.entries())
    .map(([y, row]) => ({ y, text: row.parts.join(" ").replace(/\s+/g, " ").trim(), fontSize: row.fontSize }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => b.y - a.y); // PDF y grows upward — descending y is top-to-bottom.
}

/**
 * Heading heuristic: notably larger than the document's most common (body)
 * font size, and short — headings don't run long. Not a guarantee — this is
 * exactly what the review screen exists to correct.
 */
function classifyHeading(fontSize: number, bodyFontSize: number, textLength: number): "heading" | "subheading" | null {
  if (bodyFontSize <= 0 || textLength > 120) return null;
  const ratio = fontSize / bodyFontSize;
  if (ratio >= 1.8) return "heading";
  if (ratio >= 1.3) return "subheading";
  return null;
}

type Matrix = [number, number, number, number, number, number];

function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Renders the page once to an offscreen canvas (the well-supported pdf.js
 * path for resolving embedded image data), then walks the operator list —
 * tracking the current transform through save/restore/transform ops — to
 * find each painted image's on-canvas rectangle and crop it out.
 *
 * Deliberately does NOT attempt to interleave these back into exact reading
 * position among the text lines (that requires reconciling PDF user-space
 * with canvas pixel-space precisely, which is fragile to get subtly wrong in
 * a way that's hard to notice). Images from a page are placed as a group
 * before that page's text blocks instead — a coarser but more reliable
 * approximation of "images preserved in the right neighborhood."
 */
async function extractPageImages(
  page: import("pdfjs-dist").PDFPageProxy,
  pdfjsOps: Record<string, number>
): Promise<string[]> {
  if (typeof document === "undefined") return [];

  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  await page.render({ canvasContext: ctx, viewport }).promise;

  const opList = await page.getOperatorList();
  const results: string[] = [];

  let ctm = viewport.transform as Matrix;
  const stack: Matrix[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as number[];

    if (fn === pdfjsOps.save) {
      stack.push(ctm);
    } else if (fn === pdfjsOps.restore) {
      ctm = stack.pop() ?? ctm;
    } else if (fn === pdfjsOps.transform) {
      ctm = multiplyMatrix(ctm, args as Matrix);
    } else if (fn === pdfjsOps.paintImageXObject || fn === pdfjsOps.paintJpegXObject) {
      try {
        const corners = [
          [0, 0], [1, 0], [0, 1], [1, 1],
        ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const left = Math.max(0, Math.min(...xs));
        const top = Math.max(0, Math.min(...ys));
        const width = Math.min(canvas.width, Math.max(...xs)) - left;
        const height = Math.min(canvas.height, Math.max(...ys)) - top;

        if (width >= 8 && height >= 8) {
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = Math.round(width);
          cropCanvas.height = Math.round(height);
          const cropCtx = cropCanvas.getContext("2d");
          if (cropCtx) {
            cropCtx.drawImage(canvas, left, top, width, height, 0, 0, width, height);
            results.push(cropCanvas.toDataURL("image/png"));
          }
        }
      } catch {
        // Skip this one image — never let a single bad image break the page.
      }
    }
  }

  return results;
}

export async function parsePdfDocument(file: File): Promise<ParserResult> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    const warnings: string[] = [];
    const perPageLines: PositionedLine[][] = [];
    const allLines: PositionedLine[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const lines = groupItemsIntoLines(content.items as PdfTextItem[]);
      perPageLines.push(lines);
      allLines.push(...lines);
    }

    // The document's most common line font size stands in for "body text" —
    // used as the baseline everything else is compared against for heading detection.
    const fontSizeCounts = new Map<number, number>();
    for (const line of allLines) {
      const rounded = Math.round(line.fontSize);
      fontSizeCounts.set(rounded, (fontSizeCounts.get(rounded) ?? 0) + 1);
    }
    let bodyFontSize = 0;
    let bodyCount = 0;
    for (const [size, count] of fontSizeCounts) {
      if (count > bodyCount) {
        bodyCount = count;
        bodyFontSize = size;
      }
    }

    const blocks: DocumentBlock[] = [];
    const toc: { id: string; text: string; level: 1 | 2 | 3 }[] = [];
    let headingCounter = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      try {
        const images = await extractPageImages(page, pdfjs.OPS as unknown as Record<string, number>);
        for (const src of images) {
          blocks.push({ type: "image", content: { src } });
        }
      } catch (imageError) {
        warnings.push(`Page ${pageNum}: image extraction failed (${String(imageError)}).`);
      }

      for (const line of perPageLines[pageNum - 1]) {
        const heading = classifyHeading(line.fontSize, bodyFontSize, line.text.length);
        if (heading) {
          headingCounter += 1;
          const id = `pdf-heading-${headingCounter}`;
          blocks.push({ type: heading, id, content: line.text });
          toc.push({ id, text: line.text, level: heading === "heading" ? 1 : 2 });
        } else {
          blocks.push({ type: "paragraph", content: line.text });
        }
      }
    }

    const firstParagraph = blocks.find((b) => b.type === "paragraph" && typeof b.content === "string");
    const description =
      firstParagraph && typeof firstParagraph.content === "string" ? firstParagraph.content.slice(0, 200) : "";

    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      description,
      blocks:
        blocks.length > 0
          ? blocks
          : [{ type: "paragraph", content: "The PDF file contains no readable text." }],
      toc,
      content: allLines.map((line) => line.text).join(" "),
      warnings: warnings.length > 0 ? warnings : undefined,
      // Heading detection is heuristic (font-size comparison), not guaranteed —
      // reflected as a moderate confidence rather than the HTML parser's higher one.
      confidence: bodyFontSize > 0 ? 0.6 : 0.3,
      metadata: { pageCount: pdf.numPages },
    };
  } catch {
    return {
      title: file.name.replace(/\.[^/.]+$/, ""),
      description: "Unable to extract content from this PDF file.",
      blocks: [
        {
          type: "paragraph",
          content:
            "The uploaded PDF could not be parsed. Please retry with a supported version or use a text document.",
        },
      ],
      toc: [],
      content: "",
    };
  }
}
