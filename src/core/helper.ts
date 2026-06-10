// ─────────────────────────────────────────────────────────────────────────────
// Operon — Domain Helpers
//
// Pure utility functions and business logic helpers.
// No side effects. No API calls. No direct Supabase access.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  User,
  Role,
  RoleId,
  RolePermissions,
  PermissionId,
  DeptId,
  UserType,
  DocTag,
  Block,
  TocItem,
  VideoProvider,
  VideoTimestamp,
  ResourceCategory,
  VisibilityScope,
  BroadcastAudience,
  DriveDocumentPermission,
  DocumentSource,
  QuickActionItem,
} from "./types";
import { ROLE_IDS, DEFAULT_ROLE_ID } from "./roles";

// ─── Permission Resolution ───────────────────────────────────────────────────

export const EMPTY_ROLE_PERMISSIONS: RolePermissions = {
  documents: { create: false, view: false, edit: false, delete: false, upload: false },
  users:     { create: false, edit: false, delete: false, assignRole: false },
  system:    { adminPanelAccess: false, roleManagement: false },
};

/**
 * Intersects two RolePermissions objects (logical AND).
 * Used when resolving inherited permissions: the child must satisfy both its own
 * policy and its parent's to be granted a permission.
 */
export function mergePermissions(base: RolePermissions, next: RolePermissions): RolePermissions {
  return {
    documents: {
      create: base.documents.create && next.documents.create,
      view:   base.documents.view   && next.documents.view,
      edit:   base.documents.edit   && next.documents.edit,
      delete: base.documents.delete && next.documents.delete,
      upload: base.documents.upload && next.documents.upload,
    },
    users: {
      create:     base.users.create     && next.users.create,
      edit:       base.users.edit       && next.users.edit,
      delete:     base.users.delete     && next.users.delete,
      assignRole: base.users.assignRole && next.users.assignRole,
    },
    system: {
      adminPanelAccess: base.system.adminPanelAccess && next.system.adminPanelAccess,
      roleManagement:   base.system.roleManagement   && next.system.roleManagement,
    },
    features: {
      viewActivity:    !!(base.features?.viewActivity    && next.features?.viewActivity),
      viewResources:   !!(base.features?.viewResources   && next.features?.viewResources),
      manageResources: !!(base.features?.manageResources && next.features?.manageResources),
      sendToAll:       !!(base.features?.sendToAll       && next.features?.sendToAll),
      viewHr:          !!(base.features?.viewHr          && next.features?.viewHr),
      viewOnboarding:  !!(base.features?.viewOnboarding  && next.features?.viewOnboarding),
      viewCreatorOps:  !!(base.features?.viewCreatorOps  && next.features?.viewCreatorOps),
      viewBrand:       !!(base.features?.viewBrand       && next.features?.viewBrand),
      viewOperations:  !!(base.features?.viewOperations  && next.features?.viewOperations),
    },
  };
}

/**
 * Resolves the effective permissions for a role, walking up any inheritance
 * chain. Cycles are guarded with a visited set.
 *
 * @param role       - The role to resolve
 * @param getRoleById - Lookup function (injected to avoid circular imports)
 */
export function getRoleEffectivePermissions(
  role: Role,
  getRoleById: (id: RoleId) => Role | undefined,
): RolePermissions {
  const visited = new Set<string>();

  function resolve(current: Role | undefined): RolePermissions {
    if (!current || visited.has(current.id)) return EMPTY_ROLE_PERMISSIONS;
    visited.add(current.id);
    const parent = current.inheritsFrom ? getRoleById(current.inheritsFrom) : undefined;
    const parentPerms = resolve(parent);
    return parent ? mergePermissions(parentPerms, current.permissions) : current.permissions;
  }

  return resolve(role);
}

/**
 * Materialises the flat PermissionId[] that is stored on the User record
 * and checked throughout the app via hasPermission().
 */
export function getRolePermissionIds(permissions: RolePermissions): PermissionId[] {
  const ids: PermissionId[] = [];

  if (permissions.documents.view)                              ids.push("view_library", "view_documents");
  if (permissions.documents.create || permissions.documents.upload) ids.push("add_documents");
  if (permissions.documents.edit)                              ids.push("edit_documents", "manage_team_documents");
  if (permissions.documents.delete)                            ids.push("delete_documents");
  if (permissions.documents.upload)                            ids.push("manage_uploads");
  if (permissions.features?.sendToAll)                         ids.push("send_to_all");
  if (permissions.users.create || permissions.users.edit || permissions.users.delete) ids.push("manage_users");
  if (permissions.system.roleManagement)                       ids.push("manage_roles");
  if (permissions.features?.viewActivity)                      ids.push("view_activity");
  if (permissions.features?.viewResources)                     ids.push("view_resources");
  if (permissions.features?.manageResources)                   ids.push("manage_resources");
  if (permissions.features?.viewHr)                            ids.push("view_hr");
  if (permissions.features?.viewOnboarding)                    ids.push("view_onboarding");
  if (permissions.features?.viewCreatorOps)                    ids.push("view_creator_ops");
  if (permissions.features?.viewBrand)                         ids.push("view_brand");
  if (permissions.features?.viewOperations)                    ids.push("view_operations");

  // Deduplicate while preserving order
  return [...new Set(ids)];
}

/**
 * Tests a single PermissionId against a resolved RolePermissions object.
 * This is the inner check; most callers should use hasPermission(user, id).
 */
export function permissionFromPolicy(permissions: RolePermissions, permission: PermissionId): boolean {
  switch (permission) {
    case "view_library":
    case "view_documents":        return permissions.documents.view;
    case "add_documents":         return permissions.documents.create || permissions.documents.upload;
    case "edit_documents":        return permissions.documents.edit;
    case "delete_documents":      return permissions.documents.delete;
    case "manage_team_documents": return permissions.documents.edit;
    case "manage_users":          return permissions.users.create || permissions.users.edit || permissions.users.delete;
    case "manage_roles":          return permissions.system.roleManagement;
    case "manage_uploads":        return permissions.documents.upload;
    case "send_to_all":           return permissions.features?.sendToAll       ?? false;
    case "view_activity":         return permissions.features?.viewActivity    ?? false;
    case "manage_resources":      return permissions.features?.manageResources ?? false;
    case "view_resources":        return permissions.features?.viewResources   ?? false;
    case "view_hr":               return permissions.features?.viewHr          ?? false;
    case "view_onboarding":       return permissions.features?.viewOnboarding  ?? false;
    case "view_creator_ops":      return permissions.features?.viewCreatorOps  ?? false;
    case "view_brand":            return permissions.features?.viewBrand       ?? false;
    case "view_operations":       return permissions.features?.viewOperations  ?? false;
    default:                      return false;
  }
}

// ─── Access Restriction Checks ───────────────────────────────────────────────

/**
 * Returns true if the user satisfies all access restriction arrays on a
 * document or resource. An empty/absent array is treated as unrestricted.
 */
export function userMatchesAccessRestrictions(
  user: User,
  allowedRoleIds?:    RoleId[],
  assignedUserIds?:   string[],
  allowedDepartments?: DeptId[],
  allowedTeamIds?:    string[],
): boolean {
  if (allowedRoleIds?.length    && !allowedRoleIds.includes(user.roleId))                               return false;
  if (allowedDepartments?.length && (!user.departmentId || !allowedDepartments.includes(user.departmentId))) return false;
  if (allowedTeamIds?.length    && (!user.teamId || !allowedTeamIds.includes(user.teamId)))             return false;
  if (assignedUserIds?.length   && !assignedUserIds.includes(user.id))                                  return false;
  return true;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

/** Derives a 1–2 character uppercase avatar string from a display name. */
export function deriveAvatar(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─── Read Time ───────────────────────────────────────────────────────────────

/** Estimates reading time at 180 wpm. Returns a "N min" string. */
export function estimateReadTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 180))} min`;
}

// ─── ToC Normalisation ───────────────────────────────────────────────────────

/**
 * Normalises a parsed ToC, clamping level 3 headings to level 2 since the UI
 * only renders two levels of nesting.
 */
export function normalizeTocItems(
  toc: Array<{ id: string; label: string; level: 1 | 2 | 3 }>,
): TocItem[] {
  return toc.map((item) => ({
    id:    item.id,
    label: item.label,
    level: (item.level === 3 ? 2 : item.level) as 1 | 2,
  }));
}

// ─── Timestamp Formatting ────────────────────────────────────────────────────

/** Returns a localised date string in "Mon DD, YYYY" format. */
export function formatDocumentDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
}

// ─── Quick Actions ───────────────────────────────────────────────────────────

/**
 * Derives the visible quick-action items for a user based on their permissions.
 * Returned items are always filtered; callers do not need to filter further.
 */
export function deriveQuickActions(
  hasPermissionFn: (id: PermissionId) => boolean,
  canManageResourcesFn: () => boolean,
): QuickActionItem[] {
  const actions: QuickActionItem[] = [
    {
      id:          "library",
      label:       "Document library",
      description: "Search SOPs and guides for your role.",
      visible:     true,
    },
    {
      id:          "library",
      label:       "Onboarding hub",
      description: "Access role-based orientation workflows.",
      category:    "onboarding",
      visible:     hasPermissionFn("view_onboarding"),
    },
    {
      id:          "library",
      label:       "Creator workflows",
      description: "Review creator operations guides.",
      category:    "creator",
      visible:     hasPermissionFn("view_creator_ops"),
    },
    {
      id:          "library",
      label:       "Brand alignment",
      description: "Open brand review and guidance documents.",
      category:    "brand",
      visible:     hasPermissionFn("view_brand"),
    },
    {
      id:          "finance",
      label:       "Finance hub",
      description: "Open finance operations for notices, expense forms, invoices, and policies.",
      visible:     hasPermissionFn("send_to_all"),
    },
    {
      id:          "resources",
      label:       "HR & compliance",
      description: "Browse HR policies and team resources.",
      visible:     hasPermissionFn("view_hr"),
    },
    {
      id:          "resources",
      label:       "Manage resources",
      description: "Add links and forms for your team.",
      visible:     canManageResourcesFn(),
    },
  ];

  return actions.filter((action) => action.visible);
}

// ─── Ingestion ID Generation ─────────────────────────────────────────────────

/** Generates a unique ingestion job ID. */
export function generateIngestionJobId(): string {
  return `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generates a document ID for a locally uploaded document. */
export function generateDocumentId(): string {
  return `doc-${Date.now()}`;
}

/** Generates a Drive document reference ID. */
export function generateDriveDocumentId(): string {
  return `drive-${Date.now()}`;
}

/** Generates an activity event ID. */
export function generateActivityId(): string {
  return `act_${Date.now()}`;
}

/** Generates a user ID. */
export function generateUserId(): string {
  return `u-${Date.now()}`;
}

/** Generates a video item ID. */
export function generateVideoId(): string {
  return `video_${Date.now()}`;
}

/** Generates a resource ID. */
export function generateResourceId(): string {
  return `res_${Date.now()}`;
}

/** Generates a version snapshot ID. */
export function generateSnapshotId(documentId: string): string {
  return `snapshot-${documentId}-${Date.now()}`;
}