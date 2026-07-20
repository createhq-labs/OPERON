import "server-only";
import type {
  Document,
  DocTag,
  DeptId,
  VisibilityScope,
  DocumentState,
} from "@/core/types";

// workforce.documents.visibility_scope is a Postgres enum pre-dating this
// feature: 'global' | 'team' | 'role' | 'private'. This app only ever
// writes/reads 'global' | 'department' | 'private' — "team" is the on-disk
// name for "department". The enum's 'role' value is never written here;
// role-based targeting is a separate, always-active layer via
// workforce.document_allowed_roles, not a visibility_scope mode.
export function toWorkforceVisibilityScope(scope: VisibilityScope): string {
  return scope === "department" ? "team" : scope;
}

export function fromWorkforceVisibilityScope(value: string): VisibilityScope {
  if (value === "global" || value === "private") return value;
  return "department";
}

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  preview_url: string | null;
  visibility_scope: string;
  current_version: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_by: string;
  created_at: string;
}

function lifecycleStateFor(hasDriveFile: boolean): DocumentState {
  return hasDriveFile ? "uploaded" : "processing";
}

export interface DocumentJoinedData {
  currentVersionId: string;
  tag: DocTag;
  /** Home department, resolved from the single document_allowed_departments row for this doc. */
  departmentId: DeptId | undefined;
  /** Display-only role names (e.g. "HR Manager") — NOT matchable against User.roleId. Access control uses the raw global.roles UUIDs separately, before this mapping runs. */
  allowedRoleNames: string[];
  readTime?: string;
}

/** Maps a workforce.documents row + its joined data into the client's Document shape. */
export function documentRowToDocument(row: DocumentRow, joined: DocumentJoinedData): Document {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    departmentId: (joined.departmentId ?? "") as DeptId,
    dept: joined.departmentId ?? "",
    tag: joined.tag,
    allowedRoleIds: joined.allowedRoleNames,
    allowedUserTypes: ["employee", "creator"],
    assignedUserIds: [],
    readTime: joined.readTime ?? "1 min",
    authorId: row.created_by,
    author: row.created_by,
    createdById: row.created_by,
    updatedAt: row.updated_at,
    updatedById: row.updated_by ?? row.created_by,
    version: `v${row.current_version}.0`,
    globalPinned: false,
    mandatoryRead: false,
    source: "google_drive",
    sourceProvider: "googleDrive",
    rawSourceUrl: row.preview_url ?? undefined,
    mimeType: row.mime_type ?? undefined,
    storageSize: row.file_size_bytes ?? undefined,
    lifecycleState: lifecycleStateFor(Boolean(row.storage_path)),
    visibilityScope: fromWorkforceVisibilityScope(row.visibility_scope),
    allowedDepartments: joined.departmentId ? [joined.departmentId as DeptId] : [],
    allowedTeamIds: [],
    broadcastAudience: "none",
    broadcastRoleIds: [],
    broadcastDepartmentIds: [],
    driveFileId: row.storage_path ?? undefined,
    driveWebViewLink: row.preview_url ?? undefined,
    currentVersionId: joined.currentVersionId,
    toc: [],
    blocks: [],
  };
}
