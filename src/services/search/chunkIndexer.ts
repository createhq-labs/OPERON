import type { Document, DriveDocumentReference, ResourceItem } from "@/core/operon";
import type { SemanticSearchChunk } from "./types";
import { normalizeSearchText } from "./filters";

function buildChunks(...segments: Array<string | undefined>) {
  return segments
    .filter(Boolean)
    .map((value) => normalizeSearchText(value))
    .filter(Boolean)
    .reduce<string[]>((chunks, value) => {
      const partitioned = value
        .split(/(?<=\.)\s+/)
        .map((segment) => segment.trim())
        .filter(Boolean);
      return [...chunks, ...partitioned];
    }, []);
}

export function buildSemanticChunks(item: Document | DriveDocumentReference | ResourceItem): SemanticSearchChunk[] {
  const dept = "dept" in item ? item.dept : undefined;
  const tag = "tag" in item ? item.tag : undefined;
  const storagePath = "storagePath" in item ? item.storagePath : undefined;
  const storageBucket = "storageBucket" in item ? item.storageBucket : undefined;

  const baseText = [item.title, item.description, dept, tag, item.visibilityScope, storagePath, storageBucket]
    .filter(Boolean)
    .join(" ");

  const rawChunks = buildChunks(
    baseText,
    "author" in item ? item.author : (item as any).authorId,
    "rawSourceUrl" in item ? item.rawSourceUrl : undefined,
    "driveUrl" in item ? item.driveUrl : undefined,
    "folderName" in item ? item.folderName : undefined,
    "href" in item ? item.href : undefined
  );
  const uniqueChunks = Array.from(new Set(rawChunks)).slice(0, 12);

  return uniqueChunks.map((text, index) => ({
    id: `${item.id}-chunk-${index}`,
    text,
    metadata: {
      source: "source" in item ? item.source : "uploaded",
      departmentId: "departmentId" in item ? item.departmentId : undefined,
      visibilityScope: item.visibilityScope,
      entityType: "entityType" in item ? item.entityType : "document",
    },
  }));
}
