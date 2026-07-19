import { workforceDb, workforceRpc, WorkforceDataError } from "./client";
import type { UUID } from "./types";

export const saveDocumentProgress = (versionId: UUID, progressPercent: number, lastBlockIndex: number) => workforceRpc("save_document_progress", { p_document_version_id: versionId, p_progress_percent: progressPercent, p_last_block_index: lastBlockIndex });
export const getDocumentDownload = (versionId: UUID) => workforceRpc<Record<string, unknown>>("get_document_download", { p_document_version_id: versionId });
export const archiveDocument = (documentId: UUID, reason: string) => workforceRpc("archive_document", { p_document_id: documentId, p_reason: reason });
export async function getCurrentDocumentVersionId(documentId: UUID): Promise<UUID | null> {
  const { data, error } = await workforceDb.from("document_versions").select("id")
    .eq("document_id", documentId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new WorkforceDataError("get current document version", error);
  return data?.id ?? null;
}
