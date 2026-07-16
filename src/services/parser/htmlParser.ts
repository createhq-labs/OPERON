import type {
  DocumentBlock,
  ParserResult,
  HeadingBlock,
  ParagraphBlock,
  StepsBlock,
  CodeBlock,
  TableBlock,
  ImageBlock,
  ListItemBlock,
} from "@/services/parser/types";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseHtmlDocument(
  rawHtml: string,
  fileName: string
): ParserResult {
  const blocks: DocumentBlock[]                    = [];
  let   documentTitle                              = fileName.replace(/\.[^/.]+$/, "");
  let   description                                = "";
  const toc: { id: string; text: string; level: 1 | 2 | 3 }[] = [];
  const warnings: string[]                         = [];

  const generatedIds = new Set<string>();
  function generateUniqueId(text: string): string {
    let baseId = text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    if (!baseId) baseId = "section";
    let id      = baseId;
    let counter = 1;
    while (generatedIds.has(id)) {
      id = `${baseId}-${counter++}`;
    }
    generatedIds.add(id);
    return id;
  }

  try {
    const domParser =
      typeof DOMParser !== "undefined" ? new DOMParser() : null;
    const doc = domParser
      ? domParser.parseFromString(rawHtml, "text/html")
      : null;

    if (!doc) {
      warnings.push(
        "DOMParser not available. Falling back to raw text extraction."
      );
    } else {
      const titleEl = doc.querySelector("title");
      if (titleEl?.textContent) {
        documentTitle = titleEl.textContent.trim();
      }

      const nodes = Array.from(
        doc.body.querySelectorAll(
          "h1, h2, h3, p, li, blockquote, code, pre, table, img"
        )
      );

      for (const element of nodes) {
        const tag         = element.tagName.toLowerCase();
        const textContent = cleanText(element.textContent ?? "");

        switch (tag) {
          case "h1":
          case "h2":
          case "h3": {
            if (!textContent) break;
            const id    = generateUniqueId(textContent);
            const level = parseInt(tag[1], 10) as 1 | 2 | 3;
            blocks.push({
              type:    level === 1 ? "heading" : "subheading",
              content: textContent,
              id,
            } as HeadingBlock);
            toc.push({ id, text: textContent, level });
            break;
          }
          case "p": {
            if (!textContent) break;
            blocks.push({ type: "paragraph", content: textContent } as ParagraphBlock);
            if (!description) {
              description = textContent.split(" ").slice(0, 40).join(" ");
            }
            break;
          }
          case "li": {
            if (!textContent) break;
            blocks.push({ type: "list_item", content: textContent } as ListItemBlock);
            break;
          }
          case "blockquote": {
            if (!textContent) break;
            blocks.push({ type: "paragraph", content: textContent } as ParagraphBlock);
            break;
          }
          case "code":
          case "pre": {
            if (!textContent) break;
            blocks.push({ type: "code", content: textContent } as CodeBlock);
            break;
          }
          case "table": {
            const rows = Array.from(element.querySelectorAll("tr")).map(
              (row) =>
                Array.from(row.querySelectorAll("th, td")).map((cell) =>
                  cleanText(cell.textContent ?? "")
                )
            );
            if (rows.length > 0) {
              blocks.push({ type: "table", content: { rows } } as TableBlock);
            }
            break;
          }
          case "img": {
            const img = element as HTMLImageElement;
            if (img.src) {
              blocks.push({
                type:    "image",
                content: { src: img.src, alt: img.alt || undefined },
              } as ImageBlock);
            } else if (img.alt) {
              blocks.push({
                type:    "paragraph",
                content: img.alt,
              } as ParagraphBlock);
            }
            break;
          }
          default:
            break;
        }
      }
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    warnings.push(`Error during HTML parsing: ${message}`);
  }

  const content = rawHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  description =
    description || content.split(" ").slice(0, 40).join(" ");

  return {
    title:       documentTitle,
    description,
    blocks:
      blocks.length > 0
        ? blocks
        : [
            {
              type:    "paragraph",
              content:
                content ||
                "No content could be extracted from this HTML document.",
            },
          ],
    toc,
    content,
    warnings,
    confidence: blocks.length > 0 ? 0.75 : 0.35,
  };
}