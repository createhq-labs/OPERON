import type { IngestionJob } from "../types";
import type { EnrichedDocument } from "./enrich";
import type { DeptId } from "@/core/operon";
import { indexDocument } from "@/services/search/indexer";

export async function indexParsedDocument(enriched: EnrichedDocument, job: IngestionJob) {
  await indexDocument({
    id: job.documentId,
    entityType: job.sourceType === "googleDrive" ? "drive" : "document",
    ref: enriched.parsed,
    title: enriched.parsed.title,
    description: enriched.parsed.description,
    content: enriched.searchableText,
    tags: (job.metadata?.tags as string[]) ?? [],
    departmentId: job.metadata?.departmentId as unknown as DeptId | undefined,
    updatedAt: new Date().toISOString(),
    pinned: false,
    visibilityScope: "department",
    allowedRoleIds: [],
    allowedUserTypes: [],
    allowedDepartments: undefined,
    allowedTeamIds: undefined,
    authorId: job.metadata?.authorId as string,
    semanticChunks: enriched.semanticChunks,
  });
}
