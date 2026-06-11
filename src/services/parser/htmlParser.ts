import type { DocumentBlock, ParserResult, HeadingBlock, ParagraphBlock, StepsBlock, CodeBlock, TableBlock, ImageBlock, ListItemBlock } from "@/services/parser/types";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseHtmlDocument(rawHtml: string, fileName: string): ParserResult {
  const blocks: DocumentBlock[] = [];
  let documentTitle = fileName.replace(/\.[^/.]+$/, "");
  let description = "";
  const toc: { id: string; text: string; level: 1 | 2 | 3 }[] = [];
  const warnings: string[] = [];

  // Helper to generate unique IDs and ensure they are unique within this parsing session
  const generatedIds = new Set<string>();
  const generateUniqueId = (text: string): string => {
    let baseId = text.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    if (!baseId) baseId = "section"; // Fallback for empty text
    let id = baseId;
    let counter = 1;
    while (generatedIds.has(id)) {
      id = `${baseId}-${counter++}`;
    }
    generatedIds.add(id);
    return id;
  };

  try {
    const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;
    const doc = parser ? parser.parseFromString(rawHtml, "text/html") : null;

    if (!doc) {
      warnings.push("DOMParser not available or failed to parse HTML. Falling back to raw text extraction.");
    }

    if (doc) {
      const titleElement = doc.querySelector("title");
      if (titleElement?.textContent) {
        documentTitle = titleElement.textContent.trim();
      }

      const contentNodes = Array.from(doc.body.querySelectorAll("h1, h2, h3, p, li, blockquote, code, pre, table, img"));
      contentNodes.forEach((element) => {
        const tag = element.tagName.toLowerCase();
        const textContent = cleanText(element.textContent ?? "");

        switch (tag) {
          case "h1":
          case "h2":
          case "h3":
            if (textContent) {
              const id = generateUniqueId(textContent);
              const level = parseInt(tag.substring(1), 10) as 1 | 2 | 3;
              blocks.push({ // Type assertion for HeadingBlock
                type: (tag === "h1" ? "heading" : "subheading"),
                content: textContent,
                id: id,
              } as HeadingBlock);
              toc.push({ id, text: textContent, level });
            }
            break;
          case "p":
            if (textContent) {
              blocks.push({ type: "paragraph", content: textContent } as ParagraphBlock);
              if (!description) { // Capture first meaningful paragraph as description
                description = textContent.split(" ").slice(0, 40).join(" ");
              }
            }
            break;
          case "li":
            // Changed to 'list_item' for more semantic representation.
            // If 'steps' with title/description is explicitly needed for <li>, adjust types.ts and this logic.
            if (textContent) {
              blocks.push({ type: "list_item", content: textContent } as ListItemBlock);
            }
            break;
          case "blockquote":
            // Treating blockquote as a paragraph for now, as per existing structure.
            if (textContent) {
              blocks.push({ type: "paragraph", content: textContent } as ParagraphBlock);
            }
            break;
          case "code":
          case "pre":
            if (textContent) {
              blocks.push({ type: "code", content: textContent } as CodeBlock);
            }
            break;
          case "table": {
            const rows = Array.from(element.querySelectorAll("tr")).map((row) =>
              Array.from(row.querySelectorAll("th, td")).map((cell) => cleanText(cell.textContent || ""))
            );
            if (rows.length > 0) {
              blocks.push({ type: "table", content: { rows } } as TableBlock);
            }
            break;
          }
          case "img":
            const imgElement = element as HTMLImageElement;
            const imgSrc = imgElement.src;
            const imgAlt = imgElement.alt || undefined;

            if (imgSrc) {
              blocks.push({
                type: "image",
                content: {
                  src: imgSrc,
                  alt: imgAlt,
                },
              } as ImageBlock);
            } else if (imgAlt) { // Fallback to paragraph if no src but has alt
              blocks.push({ type: "paragraph", content: imgAlt } as ParagraphBlock);
            }
            break;
          default:
            break;
        }
      });
    }
  } catch (error: any) {
    warnings.push(`Error during HTML parsing: ${error.message || error}`);
  }

  const content = rawHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // If description wasn't set from a paragraph, use raw content
  description = description || content.split(" ").slice(0, 40).join(" ");

  return {
    title: documentTitle,
    description,
    blocks: blocks.length > 0 ? blocks : [{ type: "paragraph", content: content || "No content could be extracted from this HTML document." }],
    toc: toc,
    content,
    warnings: warnings,
    confidence: blocks.length > 0 ? 0.75 : 0.35,
  };
}
