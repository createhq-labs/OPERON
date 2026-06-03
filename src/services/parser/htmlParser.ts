import type { DocumentBlock, ParserResult } from "@/services/parser/types";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function blockText(node: HTMLElement): string {
  return cleanText(node.textContent ?? "");
}

export function parseHtmlDocument(rawHtml: string, fileName: string): ParserResult {
  const blocks: DocumentBlock[] = [];
  let documentTitle = fileName.replace(/\.[^/.]+$/, "");
  let description = "";

  try {
    const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
    const doc = parser ? parser.parseFromString(rawHtml, "text/html") : null;

    if (doc) {
      const titleElement = doc.querySelector("title");
      if (titleElement?.textContent) {
        documentTitle = titleElement.textContent.trim();
      }

      const contentNodes = Array.from(doc.body.querySelectorAll("h1, h2, h3, p, li, blockquote, code, pre, table, img"));
      contentNodes.forEach((element) => {
        const tag = element.tagName.toLowerCase();
        switch (tag) {
          case "h1":
          case "h2":
          case "h3":
            blocks.push({
              type: tag === "h1" ? "heading" : "subheading",
              content: blockText(element as HTMLElement),
              id: (element.textContent || "").trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, ""),
            });
            break;
          case "p":
            blocks.push({ type: "paragraph", content: blockText(element as HTMLElement) });
            break;
          case "li":
            blocks.push({ type: "steps", content: [{ title: blockText(element as HTMLElement), description: "" }] });
            break;
          case "blockquote":
            blocks.push({ type: "paragraph", content: blockText(element as HTMLElement) });
            break;
          case "code":
          case "pre":
            blocks.push({ type: "code", content: blockText(element as HTMLElement) });
            break;
          case "table": {
            const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
              Array.from(row.querySelectorAll("th, td")).map((cell) => cleanText(cell.textContent || ""))
            );
            blocks.push({ type: "table", content: { rows } });
            break;
          }
          case "img":
            blocks.push({ type: "paragraph", content: (element as HTMLImageElement).alt || (element as HTMLImageElement).src || "Image" });
            break;
          default:
            break;
        }
      });
    }
  } catch {
    // fallback to raw text extraction
  }

  const content = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  description = description || content.split(" ").slice(0, 40).join(" ");

  return {
    title: documentTitle,
    description,
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: content || "No content could be extracted from this HTML document." }],
    toc: [],
    content,
    warnings: [],
    confidence: blocks.length > 0 ? 0.75 : 0.35,
  };
}
