import { workforceDb, workforceRpc, WorkforceDataError } from "./client";
import type { AccessibleDocument, UUID } from "./types";

export const listAccessibleDocuments = (categoryId?: UUID, includeArchived = false, limit = 50, offset = 0) =>
  workforceRpc<AccessibleDocument[]>("list_accessible_documents", { p_category_id: categoryId ?? null, p_include_archived: includeArchived, p_limit: limit, p_offset: offset });
export const pendingAcknowledgements = () => workforceRpc<Record<string, unknown>[]>("my_pending_acknowledgements");
export const acknowledgeDocumentVersion = (versionId: UUID, note?: string) => workforceRpc("acknowledge_document_version", { p_document_version_id: versionId, p_note: note ?? null });
export const saveDocumentProgress = (versionId: UUID, progressPercent: number, lastBlockIndex: number) => workforceRpc("save_document_progress", { p_document_version_id: versionId, p_progress_percent: progressPercent, p_last_block_index: lastBlockIndex });
export const getDocumentDownload = (versionId: UUID) => workforceRpc<Record<string, unknown>>("get_document_download", { p_document_version_id: versionId });
export const archiveDocument = (documentId: UUID, reason: string) => workforceRpc("archive_document", { p_document_id: documentId, p_reason: reason });
export const restoreDocument = (documentId: UUID, reason: string) => workforceRpc("restore_document", { p_document_id: documentId, p_reason: reason });
export const reviewDocumentVersion = (versionId: UUID) => workforceRpc("review_document_version", { p_document_version_id: versionId });
export const publishDocumentVersion = (versionId: UUID) => workforceRpc("publish_document_version", { p_document_version_id: versionId });
export async function getCurrentDocumentVersionId(documentId: UUID): Promise<UUID | null> {
  const { data, error } = await workforceDb.from("document_versions").select("id")
    .eq("document_id", documentId).order("version_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new WorkforceDataError("get current document version", error);
  return data?.id ?? null;
}

export async function replaceDocumentVisibility(documentId: UUID, roleIds: UUID[], departmentIds: UUID[], userIds: UUID[]) {
  const operations = [
    ["document_allowed_roles", "role_id", roleIds],
    ["document_allowed_departments", "department_id", departmentIds],
    ["document_assigned_users", "user_id", userIds],
  ] as const;
  for (const [table, field, ids] of operations) {
    const removed = await workforceDb.from(table).delete().eq("document_id", documentId);
    if (removed.error) throw new WorkforceDataError(`replace ${table}`, removed.error);
    if (ids.length) {
      const inserted = await workforceDb.from(table).insert(ids.map((id) => ({ document_id: documentId, [field]: id })));
      if (inserted.error) throw new WorkforceDataError(`replace ${table}`, inserted.error);
    }
  }
}
