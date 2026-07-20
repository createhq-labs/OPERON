import "server-only";
import { isAdmin } from "@/core/operon";
import type { User, VisibilityScope } from "@/core/types";

export interface DocumentAccessInput {
  visibilityScope: VisibilityScope;
  homeDepartmentId: string | undefined;
  allowedRoleIds: string[];
}

/**
 * Access check for the workforce.documents-backed Library, run in the
 * trusted backend against the service-role client — not Postgres RLS.
 * Two independent, simultaneously-required layers (matching the app's
 * original in-memory document model, not workforce.documents' own
 * mutually-exclusive visibility_scope RLS design):
 *   1. Visibility scope: global (everyone) / department (must match the
 *      document's home department) / private (assigned users — not
 *      implemented in the upload UI today, so private documents are
 *      admin-only in practice).
 *   2. Role restriction: caller's real global.roles.id must be in the
 *      document's allowed-roles set — always required, a document always
 *      has at least one allowed role.
 */
export function canViewWorkforceDocument(user: User, doc: DocumentAccessInput): boolean {
  if (isAdmin(user)) return true;

  const visible =
    doc.visibilityScope === "global" ||
    (doc.visibilityScope === "department" && !!user.departmentId && user.departmentId === doc.homeDepartmentId);
  if (!visible) return false;

  if (doc.allowedRoleIds.length === 0) return true;
  return !!user.globalRoleId && doc.allowedRoleIds.includes(user.globalRoleId);
}
