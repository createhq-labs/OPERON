import type { Document, DriveDocumentReference, ResourceItem } from "@/core/operon";
import type { SearchEntry } from "./types";
import { joinSearchText } from "./tokenizer";
import { buildSemanticChunks } from "@/services/search/chunkIndexer";
import { logInfo } from "@/services/logger";

export function buildDocumentIndex(documents: Document[]): SearchEntry<Document>[] {
  return documents.map((document) => ({
    id:          document.id,
    entityType:  "document",
    ref:         document,
    title:       document.title,
    description: document.description,
    content:     joinSearchText(
      document.title,
      document.description,
      document.tag,
      document.dept,
      document.rawSourceUrl,
      document.author,
      document.storagePath,
      document.storageBucket,
      document.extractedText,
      ...(document.parsedBlocks ?? []).map((block) =>
        "content" in block
          ? typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content)
          : JSON.stringify(block)
      ),
    ),
    tags:               [document.tag],
    departmentId:       document.departmentId,
    updatedAt:          document.updatedAt,
    pinned:             document.pinned ?? false,
    visibilityScope:    document.visibilityScope,
    allowedRoleIds:     document.allowedRoleIds,
    allowedUserTypes:   document.allowedUserTypes,
    allowedDepartments: document.allowedDepartments,
    allowedTeamIds:     document.allowedTeamIds,
    authorId:           document.authorId,
    semanticChunks:     buildSemanticChunks(document),
  }));
}

export function buildDriveDocumentIndex(
  documents: DriveDocumentReference[]
): SearchEntry<DriveDocumentReference>[] {
  return documents.map((document) => ({
    id:          document.id,
    entityType:  "drive",
    ref:         document,
    title:       document.title,
    description: document.description,
    content:     joinSearchText(
      document.title,
      document.description,
      document.dept,
      document.tag,
      document.author,
      document.driveUrl,
      document.folderName,
      document.fileMimeType,
      ...(document.permissionSummary ?? []).map(
        (permission) => `${permission.role} ${permission.emailAddress ?? ""}`
      ),
    ),
    tags:               [document.tag],
    departmentId:       document.departmentId,
    updatedAt:          document.updatedAt,
    pinned:             document.pinned ?? false,
    visibilityScope:    document.visibilityScope,
    allowedRoleIds:     document.allowedRoleIds,
    allowedUserTypes:   document.allowedUserTypes,
    allowedDepartments: document.allowedDepartments,
    allowedTeamIds:     document.allowedTeamIds,
    authorId:           document.authorId,
    semanticChunks:     buildSemanticChunks(document),
  }));
}

export function buildResourceIndex(resources: ResourceItem[]): SearchEntry<ResourceItem>[] {
  return resources.map((resource) => ({
    id:          resource.id,
    entityType:  "resource",
    ref:         resource,
    title:       resource.title,
    description: resource.description,
    content:     joinSearchText(resource.title, resource.description, resource.category, resource.href),
    tags:        [resource.category],
    // ResourceItem uses allowedDepartments; fall back to the first allowed department.
    departmentId:       resource.allowedDepartments?.[0],
    updatedAt:          resource.updatedAt,
    pinned:             resource.globalPinned ?? false,
    visibilityScope:    resource.visibilityScope,
    allowedRoleIds:     resource.allowedRoleIds,
    allowedUserTypes:   resource.allowedUserTypes,
    allowedDepartments: resource.allowedDepartments,
    allowedTeamIds:     resource.allowedTeamIds,
    authorId:           resource.createdById,
  }));
}

export async function indexDocument(entry: SearchEntry<unknown>): Promise<void> {
  logInfo("search.indexDocument", {
    id:         entry.id,
    entityType: entry.entityType,
    tags:       entry.tags,
  });
}