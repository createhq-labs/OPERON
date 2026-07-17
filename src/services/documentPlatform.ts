/**
 * Compatibility surface for callers that have not moved to `lib/workforce`.
 * All authorization-sensitive reads and mutations are delegated to the
 * Workforce RPC contract; this module never queries the Finance schema.
 */
export {
  acknowledgeDocumentVersion as acknowledgeDocument,
  archiveDocument,
  getDocumentDownload,
  getCurrentDocumentVersionId,
  listAccessibleDocuments as listDocuments,
  pendingAcknowledgements,
  publishDocumentVersion,
  replaceDocumentVisibility,
  restoreDocument,
  reviewDocumentVersion,
  saveDocumentProgress,
} from "@/lib/workforce/documents";
export {
  archiveResource,
  listAccessibleResources as listResources,
  notifyResourcePublished,
  restoreResource,
} from "@/lib/workforce/resources";
export { getCurrentGlobalUser as getCurrentDocPlatformUser } from "@/lib/workforce/auth";
export type {
  AccessibleDocument as DocPlatformDocument,
  AccessibleResource as DocPlatformResource,
  GlobalUser as DocPlatformUser,
  VisibilityScope as DocPlatformVisibilityScope,
} from "@/lib/workforce/types";
