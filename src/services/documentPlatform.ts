/**
 * Compatibility surface for callers that have not moved to `lib/workforce`.
 * All authorization-sensitive reads and mutations are delegated to the
 * Workforce RPC contract; this module never queries the Finance schema.
 */
export { getCurrentDocumentVersionId } from "@/lib/workforce/documents";
