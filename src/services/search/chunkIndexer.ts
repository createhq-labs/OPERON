import type { Document, DriveDocumentReference, ResourceItem } from "@/core/operon";
import type { SemanticSearchChunk } from "./types";
import { normalizeSearchText } from "./filters";

type ChunkableItem = Document | DriveDocumentReference | ResourceItem;

function buildChunks(...segments: Array<string | undefined>): string[] {
  return segments
    .filter((v): v is string => Boolean(v))
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

function resolveAuthorText(item: ChunkableItem): string | undefined {
  if ("author" in item && typeof item.author === "string") return item.author;
  if ("authorId" in item && typeof item.authorId === "string") return item.authorId;
  if ("createdById" in item && typeof item.createdById === "string") return item.createdById;
  return undefined;
}

export function buildSemanticChunks(item: ChunkableItem): SemanticSearchChunk[] {
  const dept         = "dept" in item        ? item.dept        : undefined;
  const tag          = "tag" in item         ? item.tag         : undefined;
  const storagePath  = "storagePath" in item ? item.storagePath : undefined;
  const storageBucket= "storageBucket" in item ? item.storageBucket : undefined;

  const baseText = [
    item.title, item.description, dept, tag,
    item.visibilityScope, storagePath, storageBucket,
  ].filter(Boolean).join(" ");

  const rawChunks = buildChunks(
    baseText,
    resolveAuthorText(item),
    "rawSourceUrl" in item  ? item.rawSourceUrl  : undefined,
    "driveUrl" in item      ? item.driveUrl       : undefined,
    "folderName" in item    ? item.folderName     : undefined,
    "href" in item          ? item.href           : undefined,
  );

  const uniqueChunks = Array.from(new Set(rawChunks)).slice(0, 12);

  return uniqueChunks.map((text, index) => ({
    id:   `${item.id}-chunk-${index}`,
    text,
    metadata: {
      source:          "source" in item       ? item.source       : "uploaded",
      departmentId:    "departmentId" in item ? item.departmentId : undefined,
      visibilityScope: item.visibilityScope,
      entityType:      "entityType" in item   ? item.entityType   : "document",
    },
  }));
}