// ─────────────────────────────────────────────────────────────────────────────
// Operon — Domain Orchestration
//
// This file is the public API of the domain layer. It:
//   1. Re-exports every type from core/types.ts (backward-compatible)
//   2. Composes helpers from core/helpers.ts with live API/service calls
//   3. Enforces RBAC via security/accessControl guards before every mutation
//
// Import rules:
//   - Components / features: import from "@/core/operon"
//   - Types only: import from "@/core/types"
//   - Pure helpers only: import from "@/core/helpers"
// ─────────────────────────────────────────────────────────────────────────────

// ─── Re-export types (backward compat) ───────────────────────────────────────

export type {
  UserType,
  UserStatus,
  RoleId,
  DeptId,
  PermissionId,
  RolePermissions,
  Role,
  Department,
  Team,
  User,
  DocTag,
  ParserStatus,
  SyncStatus,
  DocumentSource,
  DocumentState,
  VisibilityScope,
  BroadcastAudience,
  IngestionStatus,
  DocMeta,
  DriveDocumentPermission,
  DriveDocumentReference,
  GoogleDocsApiStructuralElement,
  GoogleDocsApiDocument,
  BlockType,
  BaseBlock,
  HeadingBlock,
  SubheadingBlock,
  ParagraphBlock,
  AlertBlock,
  ChecklistItem,
  ChecklistBlock,
  StepItem,
  StepsBlock,
  FaqItem,
  FaqBlock,
  TableBlock,
  TimelineItem,
  TimelineBlock,
  ResourceBlock,
  VideoProvider,
  VideoTimestamp,
  VideoBlock,
  Block,
  TocItem,
  Document,
  DriveParsedDocument,
  ParsedDocument,
  DocumentVersion,
  ResourceCategory,
  ResourceItem,
  VideoItem,
  ActivityAction,
  ActivityEvent,
  Notification,
  QuickActionItem,
} from "@/core/types";

export {
  EMPTY_ROLE_PERMISSIONS,
  mergePermissions,
  userMatchesAccessRestrictions,
  deriveAvatar,
  estimateReadTime,
  normalizeTocItems,
  formatDocumentDate,
} from "@/core/helpers";

export { ROLE_IDS, DEFAULT_ROLE_ID, ROLE_SELECTION_OPTIONS } from "@/core/roles";
export type { RoleSelectionId, RoleSelectionOption } from "@/core/roles";

// Pull in types we use internally in this file
import { ROLE_IDS, DEFAULT_ROLE_ID } from "@/core/roles";
import type {
  User,
  Role,
  RoleId,
  RolePermissions,
  PermissionId,
  DeptId,
  DocTag,
  Block,
  Document,
  DriveDocumentReference,
  DriveDocumentPermission,
  DocumentSource,
  DocumentState,
  VisibilityScope,
  BroadcastAudience,
  ResourceItem,
  ResourceCategory,
  VideoItem,
  VideoProvider,
  VideoTimestamp,
  ActivityEvent,
  DocumentVersion,
  UserType,
  TocItem,
  DriveParsedDocument,
} from "@/core/types";

import {
  EMPTY_ROLE_PERMISSIONS,
  mergePermissions,
  getRoleEffectivePermissions as computeRoleEffectivePermissions,
  getRolePermissionIds as computeRolePermissionIds,
  permissionFromPolicy,
  userMatchesAccessRestrictions,
  deriveAvatar,
  estimateReadTime,
  normalizeTocItems,
  formatDocumentDate,
  deriveQuickActions,
  generateIngestionJobId,
  generateDocumentId,
  generateDriveDocumentId,
  generateActivityId,
  generateUserId,
  generateVideoId,
  generateResourceId,
  generateSnapshotId,
} from "@/core/helpers";

import * as api from "@/services/api";
import { parseGoogleDriveDocument } from "@/services/parser";
import { getParserByExtension, getParserByMimeType } from "@/services/parser/registry";
import { enqueueIngestionJob, startIngestionWorker } from "@/services/ingestion";
import { filterActivityForUser } from "@/services/activity";
import { isVisibleToUser } from "@/security/visibility";
import {
  requireAuthenticatedUser,
  requirePublishingPermission,
  requireResourceManagementPermission,
  requireUploadPermission,
  requireEditingPermission,
} from "@/security/accessControl";
import {
  searchDocuments as searchDocumentsService,
  searchDriveDocuments as searchDriveDocumentsService,
  searchResources as searchResourcesService,
} from "@/services/search";

// ─── Role & Permission Queries ────────────────────────────────────────────────

export function getRoles() {
  return api.getRoles();
}

export function getRoleById(id: RoleId) {
  return api.getRoleById(id);
}

export function getUserRole(user: User) {
  return getRoleById(user.roleId);
}

export function getRoleEffectivePermissions(role: Role): RolePermissions {
  return computeRoleEffectivePermissions(role, getRoleById);
}

export function getRolePermissionIds(role: Role): PermissionId[] {
  return computeRolePermissionIds(getRoleEffectivePermissions(role));
}

export function getUserEffectivePermissions(user: User): RolePermissions {
  const role = getUserRole(user);
  return role ? getRoleEffectivePermissions(role) : EMPTY_ROLE_PERMISSIONS;
}

export function hasPermission(user: User, permission: PermissionId): boolean {
  return permissionFromPolicy(getUserEffectivePermissions(user), permission);
}

export function isAdmin(user: User): boolean {
  return getUserEffectivePermissions(user).system.adminPanelAccess;
}

export function isLeadRole(user: User): boolean {
  const perms = getUserEffectivePermissions(user);
  return perms.system.roleManagement && !perms.system.adminPanelAccess;
}

export function canManageRoles(user: User): boolean {
  return getUserEffectivePermissions(user).system.roleManagement;
}

export function canEditRole(user: User, role: Role): boolean {
  if (isAdmin(user)) return true;
  if (!canManageRoles(user)) return false;
  return role.createdById === user.id;
}

export function canDeleteRole(user: User, _role: Role): boolean {
  return isAdmin(user);
}

export function getRoleLabel(id: RoleId): string {
  return getRoleById(id)?.name ?? "Unknown role";
}

export function saveRole(role: Role) {
  return api.saveRole(role);
}

export function deleteRole(roleId: RoleId) {
  return api.deleteRole(roleId);
}

// ─── Department & Team Queries ────────────────────────────────────────────────

export function getDepartments() {
  return api.getDepartments();
}

export function getDepartmentById(id: DeptId) {
  return api.getDepartmentById(id);
}

export function getDepartmentLabel(id: DeptId): string {
  return getDepartmentById(id)?.name ?? "Unknown";
}

export function getDepartmentFilters() {
  return [
    { id: "all", label: "All" },
    ...getDepartments().map((dept) => ({ id: dept.id, label: dept.name })),
  ];
}

export function getTeams() {
  return api.getTeams();
}

// ─── User Queries ─────────────────────────────────────────────────────────────

export function getUsers() {
  return api.getUsers();
}

export function getUserById(id: string) {
  return api.getUserById(id);
}

export function getUserByRoleId(roleId: RoleId) {
  return api.getUserByRoleId(roleId);
}

/** Alias for getUsers() — prefer getUsers() in new code. */
export function getAllUsers() {
  return getUsers();
}

// ─── Document Queries ─────────────────────────────────────────────────────────

export function getDocuments() {
  return api.getDocuments();
}

export function getDocumentById(id: string) {
  return api.getDocumentById(id);
}

export function getDriveDocuments() {
  return api.getDriveDocuments();
}

export function getDriveDocumentById(id: string) {
  return api.getDriveDocumentById(id);
}

// ─── Resource & Video Queries ─────────────────────────────────────────────────

export function getResources() {
  return api.getResources();
}

export function getResourceById(id: string) {
  return api.getResourceById(id);
}

export function getVideos() {
  return api.getVideos();
}

export function getActivityEvents() {
  return api.getActivityEvents();
}

// ─── Permission Convenience Functions ────────────────────────────────────────

export function canManageUsers(user: User): boolean {
  return hasPermission(user, "manage_users") || hasPermission(user, "manage_roles");
}

export function canManageResources(user: User): boolean {
  return hasPermission(user, "manage_resources") || isAdmin(user);
}

export function canViewResources(user: User): boolean {
  return hasPermission(user, "view_resources");
}

export function canViewActivity(user: User): boolean {
  return hasPermission(user, "view_activity");
}

export function canAddDocuments(user: User): boolean {
  return hasPermission(user, "add_documents");
}

export function canUploadDocuments(user: User): boolean {
  return hasPermission(user, "manage_uploads");
}

export function canPublishGlobally(user: User): boolean {
  return hasPermission(user, "send_to_all");
}

export function canEditDocuments(user: User): boolean {
  return hasPermission(user, "edit_documents");
}

export function canDeleteDocuments(user: User): boolean {
  return hasPermission(user, "delete_documents");
}

export function canManageTeamDocuments(user: User): boolean {
  return hasPermission(user, "manage_team_documents") || isAdmin(user);
}

// ─── Document Visibility ─────────────────────────────────────────────────────

export function canViewDocument(user: User, document: Document): boolean {
  if (isAdmin(user)) return true;
  if (!getUserEffectivePermissions(user).documents.view) return false;
  if (!document.allowedUserTypes.includes(user.userType)) return false;

  return (
    isVisibleToUser(
      user,
      document.visibilityScope,
      document.departmentId,
      document.allowedUserTypes,
      document.assignedUserIds,
      document.allowedDepartments,
      document.allowedTeamIds,
    ) &&
    userMatchesAccessRestrictions(
      user,
      document.allowedRoleIds,
      document.assignedUserIds,
      document.allowedDepartments,
      document.allowedTeamIds,
    )
  );
}

export function canViewDriveDocument(user: User, document: DriveDocumentReference): boolean {
  if (isAdmin(user)) return true;
  if (!getUserEffectivePermissions(user).documents.view) return false;
  if (!document.allowedUserTypes.includes(user.userType)) return false;

  return (
    isVisibleToUser(
      user,
      document.visibilityScope,
      document.departmentId,
      document.allowedUserTypes,
      document.assignedUserIds,
      document.allowedDepartments,
      document.allowedTeamIds,
    ) &&
    userMatchesAccessRestrictions(
      user,
      document.allowedRoleIds,
      document.assignedUserIds,
      document.allowedDepartments,
      document.allowedTeamIds,
    )
  );
}

export function canViewResource(user: User, resource: ResourceItem): boolean {
  if (isAdmin(user)) return true;
  if (!resource.allowedUserTypes.includes(user.userType)) return false;

  const roleAllowed = resource.allowedRoleIds.length === 0 || resource.allowedRoleIds.includes(user.roleId);
  const deptAllowed = !resource.allowedDepartments?.length ||
    (user.departmentId ? resource.allowedDepartments.includes(user.departmentId) : false);
  const teamAllowed = !resource.allowedTeamIds?.length ||
    (user.teamId ? resource.allowedTeamIds.includes(user.teamId) : false);

  return (
    isVisibleToUser(
      user,
      resource.visibilityScope,
      undefined,
      resource.allowedUserTypes,
      undefined,
      resource.allowedDepartments,
      resource.allowedTeamIds,
    ) && roleAllowed && deptAllowed && teamAllowed
  );
}

// ─── Accessible Collection Getters ───────────────────────────────────────────

export function getAccessibleDocuments(user: User) {
  return getDocuments().filter((doc) => canViewDocument(user, doc));
}

export function getAccessibleDocument(user: User, id: string) {
  const doc = getDocumentById(id);
  return doc && canViewDocument(user, doc) ? doc : undefined;
}

export function getAccessibleDriveDocuments(user: User) {
  return getDriveDocuments().filter((doc) => canViewDriveDocument(user, doc));
}

export function getAccessibleDocumentEntities(user: User) {
  return [...getAccessibleDocuments(user), ...getAccessibleDriveDocuments(user)];
}

export function getPinnedDocuments(user: User, limit = 3) {
  return getAccessibleDocuments(user)
    .filter((doc) => doc.pinned)
    .slice(0, limit);
}

export function getAccessibleResources(user: User) {
  return getResources().filter((resource) => canViewResource(user, resource));
}

export function getAccessibleVideos(user: User) {
  return getVideos().filter((video) =>
    isVisibleToUser(
      user,
      video.visibilityScope,
      video.allowedDepartments?.[0],
      video.allowedUserTypes,
      [video.createdById],
    ),
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function searchDocuments(user: User, query = "", departmentId?: DeptId | "all") {
  return searchDocumentsService(user, getDocuments(), query, departmentId);
}

export function searchDriveDocuments(user: User, query = "", departmentId?: DeptId | "all") {
  return searchDriveDocumentsService(user, getDriveDocuments(), query, departmentId);
}

export function searchResources(user: User, query = "", category?: ResourceCategory) {
  return searchResourcesService(user, getResources(), query, category);
}

// ─── Drive Document Parsing ───────────────────────────────────────────────────

export async function getParsedDriveDocument(id: string): Promise<DriveParsedDocument | undefined> {
  const reference = getDriveDocumentById(id);
  if (!reference) return undefined;

  const rawDoc = await api.fetchGoogleDocsApiDocument(reference.googleDocId);
  const parsed = parseGoogleDriveDocument(rawDoc as never);

  return {
    ...reference,
    toc: normalizeTocItems(
      parsed.toc.map((item: { id: string; label?: string; text?: string; level: 1 | 2 | 3 }) => ({
        ...item,
        label: item.label ?? item.text,
      }))
    ),
    blocks: parsed.blocks as unknown as Block[],
  };
}

export async function refreshDriveDocumentSync(id: string): Promise<DriveParsedDocument> {
  const reference = getDriveDocumentById(id);
  if (!reference) throw new Error("Drive document not found");

  const rawDoc = await api.fetchGoogleDocsApiDocument(reference.googleDocId);
  const parsed = parseGoogleDriveDocument(rawDoc as never);

  api.updateDriveDocumentSyncMetadata(id, {
    lastSyncedAt: new Date().toISOString(),
    syncStatus:   "synced",
    updatedAt:    formatDocumentDate(),
  });

  return {
    ...reference,
    toc: normalizeTocItems(
      parsed.toc.map((item: { id: string; label?: string; text?: string; level: 1 | 2 | 3 }) => ({
        ...item,
        label: item.label ?? item.text,
      }))
    ),
    blocks: parsed.blocks as unknown as Block[],
  };
}

export async function getDocumentEntity(user: User, id: string) {
  const nativeDoc = getAccessibleDocument(user, id);
  if (nativeDoc) return nativeDoc;

  const driveDoc = getDriveDocumentById(id);
  if (!driveDoc || !canViewDriveDocument(user, driveDoc)) return undefined;

  return getParsedDriveDocument(id);
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function getActivityFeed(user: User) {
  if (!canViewActivity(user)) return [];
  return filterActivityForUser(user, getActivityEvents())
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function recordActivity(event: Omit<ActivityEvent, "id" | "timestamp">) {
  const activity: ActivityEvent = {
    ...event,
    id:        generateActivityId(),
    timestamp: new Date().toISOString(),
  };
  return api.saveActivity(activity);
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

export function getQuickActions(user: User) {
  return deriveQuickActions(
    (id) => hasPermission(user, id),
    ()   => canManageResources(user),
  );
}

// ─── Sign-In Role Options ─────────────────────────────────────────────────────

export function getSignInRoleOptions() {
  return getRoles().filter(
    (role) => role.userType === "employee" || role.userType === "creator",
  );
}

// ─── User Management ─────────────────────────────────────────────────────────

export function getCreatableRoles(user: User) {
  if (isAdmin(user)) return getRoles();
  if (!canManageRoles(user)) return [];

  const scopeRoleId = user.roleId;
  return getRoles().filter((role) => {
    if (role.createdById === user.id) return true;
    if (role.createdById === "system") {
      if (scopeRoleId === ROLE_IDS.IM_TEAM_LEAD) {
        return ([ROLE_IDS.IM_MEMBER, ROLE_IDS.INTERN, ROLE_IDS.CONTENT_CREATOR] as string[]).includes(role.id);
      }
      if (scopeRoleId === ROLE_IDS.TM_TEAM_LEAD) {
        return ([ROLE_IDS.TM_MEMBER, ROLE_IDS.INTERN, ROLE_IDS.CONTENT_CREATOR] as string[]).includes(role.id);
      }
    }
    return false;
  });
}

export function canCreateUser(user: User, roleId: RoleId): boolean {
  if (isAdmin(user)) return true;
  if (!canManageRoles(user)) return false;
  return getCreatableRoles(user).some((role) => role.id === roleId);
}

export function getAssignableDepartments(user: User, roleId: RoleId): DeptId[] {
  if (isAdmin(user)) return getDepartments().map((dept) => dept.id);

  if (isLeadRole(user)) {
    if (roleId === ROLE_IDS.CONTENT_CREATOR) return ["creator"];
    return [user.departmentId ?? "operations"];
  }

  return [];
}

export function getSupervisors(user: User) {
  return getUsers().filter((candidate) => {
    const role = getRoleById(candidate.roleId);
    if (!role) return false;
    if (candidate.id === user.id) return true;
    if (isAdmin(user)) return role.group === "team_lead" || role.id === ROLE_IDS.COFOUNDER;
    if (isLeadRole(user)) {
      return (
        role.group === "team_lead" &&
        candidate.departmentId === user.departmentId &&
        candidate.id !== user.id
      );
    }
    return false;
  });
}

export function createUser(input: {
  creator:              User;
  name:                 string;
  email:                string;
  roleId:               RoleId;
  departmentId:         DeptId;
  supervisorId?:        string;
  assignedDocumentIds?: string[];
  status:               User["status"];
}): User | null {
  const { creator, name, email, roleId, departmentId, supervisorId, assignedDocumentIds, status } = input;

  if (!name.trim() || !email.trim() || !departmentId || !roleId) return null;
  if (!canCreateUser(creator, roleId)) return null;

  const role = getRoleById(roleId) ?? getRoleById(DEFAULT_ROLE_ID);
  if (!role) return null;

  const allowedDepts = getAssignableDepartments(creator, roleId);
  if (allowedDepts.length > 0 && !allowedDepts.includes(departmentId)) return null;

  const user: User = {
    id:            generateUserId(),
    name:          name.trim(),
    email:         email.trim().toLowerCase(),
    avatar:        deriveAvatar(name),
    userType:      role.userType,
    roleId:        role.id,
    departmentId,
    supervisorId,
    permissionIds: computeRolePermissionIds(getRoleEffectivePermissions(role)),
    createdById:   creator.id,
    status,
  };

  api.saveUser(user);

  if (assignedDocumentIds?.length) {
    for (const documentId of assignedDocumentIds) {
      const doc = getDocumentById(documentId);
      if (!doc) continue;
      if (!doc.assignedUserIds) doc.assignedUserIds = [];
      if (!doc.assignedUserIds.includes(user.id)) {
        doc.assignedUserIds.push(user.id);
      }
    }
  }

  recordActivity({
    userId:     creator.id,
    action:     "USER_MANAGED",
    targetType: "user",
    targetId:   user.id,
    metadata:   { role: role.name, status },
  });

  return user;
}

// ─── Resource Mutations ───────────────────────────────────────────────────────

export function createResource(resource: {
  title:                  string;
  description:            string;
  category:               ResourceCategory;
  href:                   string;
  external?:              boolean;
  icon:                   string;
  allowedRoleIds:         RoleId[];
  allowedUserTypes:       UserType[];
  allowedDepartments?:    DeptId[];
  allowedTeamIds?:        string[];
  visibilityScope?:       VisibilityScope;
  globalPinned?:          boolean;
  mandatoryRead?:         boolean;
  broadcastAudience?:     BroadcastAudience;
  broadcastRoleIds?:      RoleId[];
  broadcastDepartmentIds?: DeptId[];
  createdById:            string;
}): ResourceItem {
  const creator = getUserById(resource.createdById);
  requireAuthenticatedUser(creator);
  requireResourceManagementPermission(creator);

  if (!resource.allowedRoleIds?.length) throw new Error("Resource requires at least one allowed role.");
  if (!resource.allowedUserTypes?.length) throw new Error("Resource requires at least one allowed user type.");
  if (resource.visibilityScope === "global" && !canPublishGlobally(creator!)) {
    throw new Error("You are not authorized to publish resources globally.");
  }

  const newResource: ResourceItem = {
    id:              generateResourceId(),
    title:           resource.title,
    description:     resource.description,
    category:        resource.category,
    href:            resource.href,
    external:        resource.external ?? false,
    icon:            resource.icon,
    allowedRoleIds:  resource.allowedRoleIds,
    allowedUserTypes: resource.allowedUserTypes,
    allowedDepartments: resource.allowedDepartments,
    allowedTeamIds:  resource.allowedTeamIds,
    visibilityScope: resource.visibilityScope ?? "private",
    createdById:     resource.createdById,
    updatedAt:       formatDocumentDate(),
    pinned:          false,
    globalPinned:    resource.globalPinned ?? false,
    mandatoryRead:   resource.mandatoryRead ?? false,
    broadcastAudience: resource.broadcastAudience ?? "none",
    broadcastRoleIds: resource.broadcastRoleIds,
    broadcastDepartmentIds: resource.broadcastDepartmentIds,
  };

  api.saveResource(newResource);
  return newResource;
}

// ─── Video Mutations ──────────────────────────────────────────────────────────

export function createVideoItem(input: {
  title:             string;
  description:       string;
  provider:          VideoProvider;
  embedUrl:          string;
  thumbnail?:        string;
  allowedRoleIds:    RoleId[];
  allowedUserTypes:  UserType[];
  visibilityScope:   VisibilityScope;
  createdById:       string;
  allowedDepartments?: DeptId[];
  allowedTeamIds?:   string[];
}): VideoItem {
  const user = getUserById(input.createdById);
  if (!user || !canUploadDocuments(user)) {
    throw new Error("You are not authorized to add video content.");
  }

  const videoItem: VideoItem = {
    id:               generateVideoId(),
    title:            input.title,
    description:      input.description,
    provider:         input.provider,
    embedUrl:         input.embedUrl,
    thumbnail:        input.thumbnail,
    visibilityScope:  input.visibilityScope,
    allowedRoleIds:   input.allowedRoleIds,
    allowedUserTypes: input.allowedUserTypes,
    allowedDepartments: input.allowedDepartments,
    allowedTeamIds:   input.allowedTeamIds,
    createdById:      input.createdById,
    updatedAt:        new Date().toISOString(),
    pinned:           false,
  };

  api.saveVideo(videoItem);
  return videoItem;
}

export function createVideoBlock(input: {
  title:              string;
  description:        string;
  provider:           VideoProvider;
  embedUrl:           string;
  thumbnail?:         string;
  timestamps?:        VideoTimestamp[];
  transcript?:        string;
  relatedResourceIds?: string[];
  id?:                string;
}) {
  return {
    id:                 input.id ?? `video-${Date.now()}`,
    type:               "video" as const,
    title:              input.title,
    description:        input.description,
    provider:           input.provider,
    embedUrl:           input.embedUrl,
    thumbnail:          input.thumbnail,
    timestamps:         input.timestamps ?? [],
    transcript:         input.transcript,
    relatedResourceIds: input.relatedResourceIds,
  };
}

// ─── Document Mutations ───────────────────────────────────────────────────────

export function createDocumentUpload(document: {
  title:                  string;
  description:            string;
  departmentId:           DeptId;
  authorId:               string;
  tag:                    DocTag;
  allowedRoleIds:         RoleId[];
  allowedUserTypes?:      UserType[];
  assignedUserIds?:       string[];
  visibilityScope?:       VisibilityScope;
  allowedDepartments?:    DeptId[];
  allowedTeamIds?:        string[];
  globalPinned?:          boolean;
  mandatoryRead?:         boolean;
  broadcastAudience?:     BroadcastAudience;
  broadcastRoleIds?:      RoleId[];
  broadcastDepartmentIds?: DeptId[];
  toc?:            TocItem[];
  blocks?:         Block[];
  rawSourceUrl?:   string;
  previewUrl?:     string;
  mimeType?:       string;
  storageBucket?:  string;
  storagePath?:    string;
  storageSize?:    number;
  uploadedBy?:     string;
  extractedText?:  string;
  parsedBlocks?:   Block[];
  parserStatus?:   import("@/core/types").ParserStatus;
  parserVersion?:  string;
  lifecycleState?: import("@/core/types").DocumentState;
  ingestionStatus?: "queued" | "processing" | "completed" | "failed" | "retrying";
  ingestionJobId?:  string;
  parserConfidence?:  number;
  parserWarnings?:    string[];
}): Document {
  const author = getUserById(document.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  if (!document.allowedRoleIds?.length) {
    throw new Error("Document upload requires at least one allowed role.");
  }

  const normalizedUserTypes: UserType[] =
    document.allowedUserTypes?.length
      ? document.allowedUserTypes
      : ([...new Set(
          document.allowedRoleIds
            .map((id) => getRoleById(id)?.userType)
            .filter((t): t is UserType => !!t),
        )] as UserType[]);

  if (!normalizedUserTypes.length) {
    throw new Error("Document upload requires at least one user type.");
  }

  const isBroadcast =
    document.visibilityScope === "global" ||
    document.broadcastAudience === "all" ||
    document.broadcastAudience === "department" ||
    !!document.broadcastRoleIds?.length;

  if (isBroadcast && !canPublishGlobally(author!)) {
    throw new Error("You are not authorized to publish documents globally.");
  }

  const now = formatDocumentDate();

  const newDocument: Document = {
    id:               generateDocumentId(),
    title:            document.title,
    description:      document.description,
    departmentId:     document.departmentId,
    dept:             getDepartmentLabel(document.departmentId),
    tag:              document.tag,
    allowedRoleIds:   document.allowedRoleIds,
    allowedUserTypes: normalizedUserTypes,
    assignedUserIds:  document.assignedUserIds,
    readTime:         estimateReadTime(document.description),
    authorId:         document.authorId,
    author:           author!.name,
    createdById:      document.authorId,
    updatedAt:        now,
    updatedById:      document.authorId,
    version:          "v1.0",
    pinned:           false,
    globalPinned:     document.globalPinned ?? false,
    mandatoryRead:    document.mandatoryRead ?? false,
    broadcastAudience: document.broadcastAudience ?? "none",
    broadcastRoleIds: document.broadcastRoleIds,
    broadcastDepartmentIds: document.broadcastDepartmentIds,
    source:           "uploaded",
    sourceProvider:   "localUpload",
    lifecycleState:   document.lifecycleState ?? "uploaded",
    visibilityScope:  document.visibilityScope ?? "department",
    allowedDepartments: document.allowedDepartments ?? [document.departmentId],
    allowedTeamIds:   document.allowedTeamIds,
    rawSourceUrl:     document.rawSourceUrl,
    previewUrl:       document.previewUrl,
    mimeType:         document.mimeType,
    storageBucket:    document.storageBucket,
    storagePath:      document.storagePath,
    storageSize:      document.storageSize,
    uploadedBy:       document.uploadedBy,
    extractedText:    document.extractedText,
    parsedBlocks:     document.parsedBlocks,
    parserStatus:     document.parserStatus,
    parserVersion:    document.parserVersion,
    parserConfidence: document.parserConfidence,
    parserWarnings:   document.parserWarnings,
    ingestionStatus:  document.ingestionStatus,
    ingestionJobId:   document.ingestionJobId,
    toc: document.toc ?? [{ id: "overview", label: "Overview", level: 1 }],
    blocks: document.blocks ?? [
      { type: "heading",   id: "overview", content: document.title, anchorId: "overview" },
      { type: "paragraph", content: document.description },
    ],
  };

  api.saveDocument(newDocument);
  recordActivity({
    userId:     document.authorId,
    action:     "DOCUMENT_CREATED",
    targetType: "document",
    targetId:   newDocument.id,
    metadata:   { title: newDocument.title },
  });

  return newDocument;
}

export async function createDocumentUploadFromFile(
  file: File,
  options: {
    title:               string;
    description?:        string;
    departmentId:        DeptId;
    authorId:            string;
    tag:                 DocTag;
    allowedRoleIds:      RoleId[];
    allowedUserTypes?:   UserType[];
    assignedUserIds?:    string[];
    visibilityScope?:    VisibilityScope;
    allowedDepartments?: DeptId[];
    allowedTeamIds?:     string[];
  },
): Promise<Document> {
  const author = getUserById(options.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  const uploadMetadata = await api.saveUploadFileToStorage(file, options.authorId, {
    tag:          options.tag,
    departmentId: options.departmentId,
  });

  const parserType =
    getParserByMimeType(uploadMetadata.mimeType || file.type)?.parserType ??
    getParserByExtension(file.name.split(".").pop()?.toLowerCase())?.parserType ??
    "plainText";

  const ingestionJobId = generateIngestionJobId();

  const document = createDocumentUpload({
    title:            options.title.trim() || file.name.replace(/\.[^/.]+$/, ""),
    description:      options.description?.trim() ?? "",
    departmentId:     options.departmentId,
    authorId:         options.authorId,
    tag:              options.tag,
    allowedRoleIds:   options.allowedRoleIds,
    allowedUserTypes: options.allowedUserTypes,
    assignedUserIds:  options.assignedUserIds,
    visibilityScope:  options.visibilityScope,
    allowedDepartments: options.allowedDepartments,
    allowedTeamIds:   options.allowedTeamIds,
    rawSourceUrl:     uploadMetadata.rawSourceUrl,
    previewUrl:       uploadMetadata.previewUrl,
    mimeType:         uploadMetadata.mimeType,
    storageBucket:    uploadMetadata.storageBucket,
    storagePath:      uploadMetadata.storagePath,
    storageSize:      uploadMetadata.storageSize,
    uploadedBy:       uploadMetadata.uploadedBy,
    extractedText:    "",
    parsedBlocks:     [],
    parserStatus:     "pending",
    parserVersion:    "1.0",
    lifecycleState:   "processing",
    ingestionStatus:  "queued",
    ingestionJobId,
  });

  const job = enqueueIngestionJob({
    uploadId:   uploadMetadata.uploadQueueId,
    documentId: document.id,
    sourceType: "localUpload",
    parserType,
    sourceUrl:  uploadMetadata.rawSourceUrl,
    fileName:   file.name,
    mimeType:   uploadMetadata.mimeType || file.type,
    file,
    metadata: {
      authorId:     options.authorId,
      departmentId: options.departmentId,
      tag:          options.tag,
    },
  });

  document.ingestionJobId = job.id;
  document.ingestionStatus = job.status;
  api.saveDocument(document);

  startIngestionWorker();
  return document;
}

export function publishDocument(user: User, documentId: string): Document {
  requireAuthenticatedUser(user);
  requirePublishingPermission(user);

  const document = getDocumentById(documentId);
  if (!document) throw new Error("Document not found.");

  document.lifecycleState = "published";
  document.updatedAt      = formatDocumentDate();
  document.updatedById    = user.id;

  api.saveDocument(document);
  recordActivity({
    userId:     user.id,
    action:     "DOCUMENT_PUBLISHED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { title: document.title },
  });

  return document;
}

export function archiveDocument(user: User, documentId: string): Document {
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  const document = getDocumentById(documentId);
  if (!document) throw new Error("Document not found.");

  document.lifecycleState = "archived";
  document.updatedAt      = formatDocumentDate();
  document.updatedById    = user.id;

  api.saveDocument(document);
  recordActivity({
    userId:     user.id,
    action:     "DOCUMENT_ARCHIVED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { title: document.title },
  });

  return document;
}

export function updateDocumentMetadata(
  user: User,
  documentId: string,
  updates: Partial<
    Pick<
      Document,
      | "title"
      | "description"
      | "tag"
      | "visibilityScope"
      | "allowedRoleIds"
      | "allowedUserTypes"
      | "allowedDepartments"
      | "allowedTeamIds"
      | "pinned"
    >
  >,
): Document {
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  const document = getDocumentById(documentId);
  if (!document) throw new Error("Document not found.");

  Object.assign(document, updates, {
    updatedAt:   formatDocumentDate(),
    updatedById: user.id,
  });

  api.saveDocument(document);
  recordActivity({
    userId:     user.id,
    action:     "DOCUMENT_UPDATED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { title: document.title },
  });

  return document;
}

export function createDocumentVersionSnapshot(documentId: string, userId: string) {
  const document = getDocumentById(documentId);
  const user     = getUserById(userId);
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  if (!document) throw new Error("Document not found.");

  const versionId = generateSnapshotId(document.id);
  const snapshot = {
    ...document,
    versionId,
    snapshotAt: new Date().toISOString(),
    snapshotBy: user!.id,
  };

  recordActivity({
    userId:     user!.id,
    action:     "DOCUMENT_VERSIONED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { snapshotId: versionId, title: document.title },
  });

  return snapshot;
}

export function createDriveDocumentReference(input: {
  title:                  string;
  description:            string;
  departmentId:           DeptId;
  authorId:               string;
  tag:                    DocTag;
  driveFileId:            string;
  googleDocId:            string;
  webViewLink:            string;
  fileMimeType:           string;
  ownerEmail:             string;
  allowedRoleIds:         RoleId[];
  allowedUserTypes:       UserType[];
  allowedDepartments?:    DeptId[];
  allowedDepartmentIds?:  DeptId[];
  allowedTeamIds?:        string[];
  visibilityScope?:       VisibilityScope;
  source?:                DocumentSource;
  sourceProvider?:        "googleDrive" | "localDrive";
  driveProvider?:         "googleDrive" | "localDrive";
  globalPinned?:          boolean;
  mandatoryRead?:         boolean;
  broadcastAudience?:     BroadcastAudience;
  broadcastRoleIds?:      RoleId[];
  broadcastDepartmentIds?: DeptId[];
  folderId?:              string;
  folderName?:            string;
  linkedDocumentId?:      string;
  uploadedBy?:            string;
  permissionSummary?:     DriveDocumentPermission[];
}): DriveDocumentReference {
  const author = getUserById(input.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  if (!input.allowedRoleIds?.length) {
    throw new Error("Drive document requires at least one allowed role.");
  }

  const normalizedUserTypes: UserType[] =
    input.allowedUserTypes?.length
      ? input.allowedUserTypes
      : ([...new Set(
          input.allowedRoleIds
            .map((id) => getRoleById(id)?.userType)
            .filter((t): t is UserType => !!t),
        )] as UserType[]);

  if (!normalizedUserTypes.length) {
    throw new Error("Drive document requires at least one user type.");
  }

  const now = formatDocumentDate();

  const document: DriveDocumentReference = {
    id:               generateDriveDocumentId(),
    title:            input.title,
    description:      input.description,
    departmentId:     input.departmentId,
    dept:             getDepartmentLabel(input.departmentId),
    tag:              input.tag,
    allowedRoleIds:   input.allowedRoleIds,
    allowedUserTypes: normalizedUserTypes,
    allowedDepartments: input.allowedDepartments,
    allowedTeamIds:   input.allowedTeamIds,
    visibilityScope:  input.visibilityScope ?? "department",
    globalPinned:     input.globalPinned ?? false,
    mandatoryRead:    input.mandatoryRead ?? false,
    broadcastAudience: input.broadcastAudience ?? "none",
    broadcastRoleIds: input.broadcastRoleIds,
    broadcastDepartmentIds: input.broadcastDepartmentIds,
    readTime:         estimateReadTime(input.description),
    authorId:         input.authorId,
    author:           author!.name,
    createdById:      input.authorId,
    updatedAt:        now,
    updatedById:      input.authorId,
    version:          "v1.0",
    pinned:           false,
    source:           input.source === "uploaded" ? "local_drive" : (input.source ?? "google_drive"),
    sourceProvider:   input.sourceProvider ?? (input.source === "uploaded" ? "localDrive" : "googleDrive"),
    driveProvider:    input.driveProvider ?? input.sourceProvider ?? "googleDrive",
    lifecycleState:   "uploaded",
    driveFileId:      input.driveFileId,
    googleDocId:      input.googleDocId,
    webViewLink:      input.webViewLink,
    driveUrl:         input.webViewLink,
    fileMimeType:     input.fileMimeType,
    ownerEmail:       input.ownerEmail,
    folderId:         input.folderId,
    folderName:       input.folderName,
    linkedDocumentId: input.linkedDocumentId,
    uploadedBy:       input.uploadedBy ?? input.authorId,
    permissionSummary: input.permissionSummary ?? [],
    syncStatus:       "pending",
    lastSyncedAt:     new Date().toISOString(),
    lastDriveModifiedAt: new Date().toISOString(),
    extractedText:    undefined,
    parsedBlocks:     [],
    parserStatus:     "pending",
    parserVersion:    "1.0",
  };

  api.saveDriveDocumentReference(document);
  recordActivity({
    userId:     input.authorId,
    action:     "DOCUMENT_CREATED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { title: document.title, source: "google_drive" },
  });

  return document;
}