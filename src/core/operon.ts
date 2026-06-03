import * as api from "@/services/api";
import { parseUploadedFile, parseGoogleDriveDocument } from "@/services/parser";
import { getParserByExtension, getParserByMimeType } from "@/services/parser/registry";
import { enqueueIngestionJob, startIngestionWorker } from "@/services/ingestion";
import { filterActivityForUser } from "@/services/activity";
import { isVisibleToUser } from "@/security/visibility";
import {
  requireAuthenticatedUser,
  requirePublishingPermission,
  requireRoleManagementPermission,
  requireResourceManagementPermission,
  requireUploadPermission,
  requireEditingPermission,
} from "@/security/accessControl";
import { searchDocuments as searchDocumentsService, searchDriveDocuments as searchDriveDocumentsService, searchResources as searchResourcesService } from "@/services/search";

export type UserType = "employee" | "creator";
export type UserStatus = "active" | "invited" | "disabled";
export type RoleId = string;
export type DeptId = "im" | "tm" | "hr" | "finance" | "onboarding" | "creator" | "brand" | "operations";
export type PermissionId =
  | "view_library"
  | "view_documents"
  | "add_documents"
  | "edit_documents"
  | "delete_documents"
  | "manage_team_documents"
  | "manage_users"
  | "manage_roles"
  | "manage_uploads"
  | "send_to_all"
  | "view_activity"
  | "view_resources"
  | "manage_resources"
  | "view_hr"
  | "view_onboarding"
  | "view_creator_ops"
  | "view_brand"
  | "view_operations";

export interface RolePermissions {
  documents: {
    create: boolean;
    view: boolean;
    edit: boolean;
    delete: boolean;
    upload: boolean;
  };
  users: {
    create: boolean;
    edit: boolean;
    delete: boolean;
    assignRole: boolean;
  };
  system: {
    adminPanelAccess: boolean;
    roleManagement: boolean;
  };
  features?: Partial<{
    viewActivity: boolean;
    viewResources: boolean;
    manageResources: boolean;
    sendToAll: boolean;
    viewHr: boolean;
    viewOnboarding: boolean;
    viewCreatorOps: boolean;
    viewBrand: boolean;
    viewOperations: boolean;
  }>;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  userType: UserType;
  permissions: RolePermissions;
  inheritsFrom?: string;
  createdById?: string;
  group?: string;
  permissionIds?: PermissionId[];
}

export interface Department {
  id: DeptId;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  departmentId: DeptId;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  userType: UserType;
  roleId: RoleId;
  departmentId?: DeptId;
  teamId?: string;
  supervisorId?: string;
  permissionIds: PermissionId[];
  createdById: string;
  status: UserStatus;
}

export type DocTag = "sop" | "onboarding" | "brand" | "creator" | "ops" | "hr" | "internal";

export type ParserStatus = "pending" | "parsed" | "failed";

export interface DocMeta {
  id: string;
  title: string;
  description: string;
  departmentId: DeptId;
  dept: string;
  tag: DocTag;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  assignedUserIds?: string[];
  readTime: string;
  authorId: string;
  author: string;
  createdById?: string;
  updatedAt: string;
  updatedById?: string;
  version: string;
  pinned?: boolean;
  source?: DocumentSource;
  sourceProvider?: "localUpload" | "googleDrive" | "localDrive";
  rawSourceUrl?: string;
  mimeType?: string;
  storageBucket?: string;
  storagePath?: string;
  storageSize?: number;
  previewUrl?: string;
  uploadedBy?: string;
  extractedText?: string;
  parsedBlocks?: Block[];
  parserStatus?: ParserStatus;
  parserVersion?: string;
  lifecycleState: DocumentState;
  visibilityScope: VisibilityScope;
  allowedDepartments?: DeptId[];
  allowedDepartmentIds?: DeptId[];
  allowedTeamIds?: string[];
  ingestionStatus?: "uploaded" | "queued" | "processing" | "parsed" | "indexed" | "completed" | "failed" | "retrying";
  ingestionJobId?: string;
  parserConfidence?: number;
  parserWarnings?: string[];
  globalPinned?: boolean;
  mandatoryRead?: boolean;
  broadcastAudience?: BroadcastAudience;
  broadcastRoleIds?: RoleId[];
  broadcastDepartmentIds?: DeptId[];
}

export type SyncStatus = "pending" | "synced" | "stale" | "failed";

export type DocumentSource = "uploaded" | "google_drive" | "local_drive";
export type DocumentState = "draft" | "uploaded" | "processing" | "parsed" | "review" | "approved" | "published" | "archived" | "failed";
export type VisibilityScope = "global" | "department" | "private";
export type BroadcastAudience = "none" | "department" | "all";

export interface DriveDocumentPermission {
  role: "reader" | "commenter" | "writer" | "owner";
  emailAddress?: string;
  domain?: string;
}

export interface DriveDocumentReference extends DocMeta {
  source: "google_drive" | "local_drive";
  sourceProvider: "googleDrive" | "localDrive";
  driveProvider?: "googleDrive" | "localDrive";
  driveFileId: string;
  googleDocId: string;
  driveUrl?: string;
  folderId?: string;
  folderName?: string;
  linkedDocumentId?: string;
  webViewLink: string;
  fileMimeType: string;
  ownerEmail: string;
  permissionSummary: DriveDocumentPermission[];
  syncStatus: SyncStatus;
  lastSyncedAt: string;
  lastDriveModifiedAt: string;
}

export interface GoogleDocsApiDocument {
  documentId: string;
  title: string;
  body: {
    content: GoogleDocsApiStructuralElement[];
  };
}

export type GoogleDocsApiStructuralElement =
  | {
      type: "paragraph";
      paragraph: {
        elements?: Array<{
          textRun?: { content?: string };
        }>;
        paragraphStyle?: {
          namedStyleType?: string;
        };
        bullet?: {
          listId?: string;
          glyphType?: string;
        };
      };
    }
  | {
      type: "table";
      table: {
        tableRows: Array<{
          tableCells: Array<{
            content: GoogleDocsApiStructuralElement[];
          }>;
        }>;
      };
    };

export interface DriveParsedDocument extends DriveDocumentReference {
  toc: TocItem[];
  blocks: Block[];
}

export interface TocItem {
  id: string;
  label: string;
  level: 1 | 2;
}

export type BlockType =
  | "heading"
  | "subheading"
  | "paragraph"
  | "warning"
  | "note"
  | "callout"
  | "success"
  | "checklist"
  | "steps"
  | "faq"
  | "table"
  | "timeline"
  | "divider"
  | "resource"
  | "video";

export interface BaseBlock {
  type: BlockType;
  id?: string;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  content: string;
  anchorId: string;
}

export interface SubheadingBlock extends BaseBlock {
  type: "subheading";
  content: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  content: string;
}

export interface AlertBlock extends BaseBlock {
  type: "warning" | "note" | "callout" | "success";
  title?: string;
  content: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  required?: boolean;
}

export interface ChecklistBlock extends BaseBlock {
  type: "checklist";
  title: string;
  items: ChecklistItem[];
}

export interface StepItem {
  title: string;
  description: string;
}

export interface StepsBlock extends BaseBlock {
  type: "steps";
  items: StepItem[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqBlock extends BaseBlock {
  type: "faq";
  items: FaqItem[];
}

export interface TableBlock extends BaseBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface TimelineItem {
  period: string;
  title: string;
  description: string;
}

export interface TimelineBlock extends BaseBlock {
  type: "timeline";
  items: TimelineItem[];
}

export interface ResourceBlock extends BaseBlock {
  type: "resource";
  title: string;
  description: string;
  href: string;
  external?: boolean;
}

export interface VideoTimestamp {
  label: string;
  seconds: number;
}

export type VideoProvider = "loom" | "google_drive" | "vimeo" | "youtube";

export interface VideoBlock extends BaseBlock {
  type: "video";
  title: string;
  description: string;
  provider: VideoProvider;
  embedUrl: string;
  thumbnail?: string;
  timestamps?: VideoTimestamp[];
  transcript?: string;
  relatedResourceIds?: string[];
}

export type Block =
  | HeadingBlock
  | SubheadingBlock
  | ParagraphBlock
  | AlertBlock
  | ChecklistBlock
  | StepsBlock
  | FaqBlock
  | TableBlock
  | TimelineBlock
  | ResourceBlock
  | VideoBlock
  | BaseBlock;

export interface Document extends DocMeta {
  toc: TocItem[];
  blocks: Block[];
}

export type ResourceCategory = "forms" | "policies" | "training" | "team" | "external";

export interface ResourceItem {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  href: string;
  external?: boolean;
  icon: string;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
  visibilityScope: VisibilityScope;
  createdById: string;
  updatedAt: string;
  pinned?: boolean;
  globalPinned?: boolean;
  mandatoryRead?: boolean;
  broadcastAudience?: BroadcastAudience;
  broadcastRoleIds?: RoleId[];
  broadcastDepartmentIds?: DeptId[];
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  provider: VideoProvider;
  embedUrl: string;
  thumbnail?: string;
  visibilityScope: VisibilityScope;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
  createdById: string;
  updatedAt: string;
  pinned?: boolean;
}

export interface QuickActionItem {
  id: string;
  label: string;
  description: string;
  category?: string;
  visible: boolean;
  createdById?: string;
  updatedAt?: string;
}

export type ActivityAction =
  | "DOCUMENT_OPENED"
  | "DOCUMENT_CREATED"
  | "DOCUMENT_EDITED"
  | "DOCUMENT_UPDATED"
  | "DOCUMENT_VERSIONED"
  | "DOCUMENT_PUBLISHED"
  | "DOCUMENT_ARCHIVED"
  | "DOCUMENT_DELETED"
  | "DOCUMENT_VISIBILITY_CHANGED"
  | "RESOURCE_ACCESSED"
  | "RESOURCE_UPDATED"
  | "RESOURCE_DELETED"
  | "USER_MANAGED"
  | "ROLE_ASSIGNED"
  | "INGESTION_FAILED"
  | "SYSTEM_EVENT";

export interface ActivityEvent {
  id: string;
  userId: string;
  action: ActivityAction;
  targetId?: string;
  targetType: "document" | "resource" | "user" | "system";
  timestamp: string;
  metadata?: Record<string, string>;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  createdById: string;
  createdAt: string;
  summary: string;
  snapshot: Document;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  notificationType: "system" | "document" | "resource" | "user";
  audience: "all" | "department" | "role" | "user";
  departmentIds?: DeptId[];
  roleIds?: RoleId[];
  userIds?: string[];
  metadata?: Record<string, string>;
  createdAt: string;
  expiresAt?: string;
  unreadBy?: string[];
}

export type ParsedDocument = {
  title: string;
  description: string;
  blocks: Block[];
  toc: TocItem[];
  content: string;
};

export function getRoles() {
  return api.getRoles();
}

export function getRoleById(id: RoleId) {
  return api.getRoleById(id);
}

const EMPTY_ROLE_PERMISSIONS: RolePermissions = {
  documents: { create: false, view: false, edit: false, delete: false, upload: false },
  users: { create: false, edit: false, delete: false, assignRole: false },
  system: { adminPanelAccess: false, roleManagement: false },
};

function mergePermissions(base: RolePermissions, next: RolePermissions) {
  return {
    documents: {
      create: base.documents.create && next.documents.create,
      view: base.documents.view && next.documents.view,
      edit: base.documents.edit && next.documents.edit,
      delete: base.documents.delete && next.documents.delete,
      upload: base.documents.upload && next.documents.upload,
    },
    users: {
      create: base.users.create && next.users.create,
      edit: base.users.edit && next.users.edit,
      delete: base.users.delete && next.users.delete,
      assignRole: base.users.assignRole && next.users.assignRole,
    },
    system: {
      adminPanelAccess: base.system.adminPanelAccess && next.system.adminPanelAccess,
      roleManagement: base.system.roleManagement && next.system.roleManagement,
    },
    features: {
      viewActivity: !!(base.features?.viewActivity && next.features?.viewActivity),
      viewResources: !!(base.features?.viewResources && next.features?.viewResources),
      manageResources: !!(base.features?.manageResources && next.features?.manageResources),
      viewHr: !!(base.features?.viewHr && next.features?.viewHr),
      viewOnboarding: !!(base.features?.viewOnboarding && next.features?.viewOnboarding),
      viewCreatorOps: !!(base.features?.viewCreatorOps && next.features?.viewCreatorOps),
      viewBrand: !!(base.features?.viewBrand && next.features?.viewBrand),
      viewOperations: !!(base.features?.viewOperations && next.features?.viewOperations),
    },
  };
}

export function getUserRole(user: User) {
  return getRoleById(user.roleId);
}

export function getRoleEffectivePermissions(role: Role): RolePermissions {
  const visited = new Set<string>();

  function resolve(current: Role | undefined): RolePermissions {
    if (!current || visited.has(current.id)) {
      return EMPTY_ROLE_PERMISSIONS;
    }
    visited.add(current.id);
    const parent = current.inheritsFrom ? getRoleById(current.inheritsFrom) : undefined;
    const parentPermissions = resolve(parent);
    return parent ? mergePermissions(parentPermissions, current.permissions) : current.permissions;
  }

  return resolve(role);
}

export function getRolePermissionIds(role: Role): PermissionId[] {
  const permissions = getRoleEffectivePermissions(role);
  const ids: PermissionId[] = [];

  if (permissions.documents.view) ids.push("view_documents");
  if (permissions.documents.create || permissions.documents.upload) ids.push("add_documents");
  if (permissions.documents.edit) ids.push("edit_documents");
  if (permissions.documents.delete) ids.push("delete_documents");
  if (permissions.documents.edit) ids.push("manage_team_documents");
  if (permissions.documents.upload) ids.push("manage_uploads");
  if (permissions.features?.sendToAll) ids.push("send_to_all");
  if (permissions.users.create || permissions.users.edit || permissions.users.delete) ids.push("manage_users");
  if (permissions.system.roleManagement) ids.push("manage_roles");
  if (permissions.features?.viewActivity) ids.push("view_activity");
  if (permissions.features?.viewResources) ids.push("view_resources");
  if (permissions.features?.manageResources) ids.push("manage_resources");
  if (permissions.features?.viewHr) ids.push("view_hr");
  if (permissions.features?.viewOnboarding) ids.push("view_onboarding");
  if (permissions.features?.viewCreatorOps) ids.push("view_creator_ops");
  if (permissions.features?.viewBrand) ids.push("view_brand");
  if (permissions.features?.viewOperations) ids.push("view_operations");

  return ids;
}

export function getUserEffectivePermissions(user: User) {
  const role = getUserRole(user);
  return role ? getRoleEffectivePermissions(role) : EMPTY_ROLE_PERMISSIONS;
}

export function hasPermission(user: User, permission: PermissionId) {
  const permissions = getUserEffectivePermissions(user);
  switch (permission) {
    case "view_library":
    case "view_documents":
      return permissions.documents.view;
    case "add_documents":
      return permissions.documents.create || permissions.documents.upload;
    case "edit_documents":
      return permissions.documents.edit;
    case "delete_documents":
      return permissions.documents.delete;
    case "manage_team_documents":
      return permissions.documents.edit;
    case "manage_users":
      return permissions.users.create || permissions.users.edit || permissions.users.delete;
    case "manage_roles":
      return permissions.system.roleManagement;
    case "manage_uploads":
      return permissions.documents.upload;
    case "send_to_all":
      return permissions.features?.sendToAll ?? false;
    case "view_activity":
      return permissions.features?.viewActivity ?? false;
    case "manage_resources":
      return permissions.features?.manageResources ?? false;
    case "view_hr":
      return permissions.features?.viewHr ?? false;
    case "view_onboarding":
      return permissions.features?.viewOnboarding ?? false;
    case "view_creator_ops":
      return permissions.features?.viewCreatorOps ?? false;
    case "view_brand":
      return permissions.features?.viewBrand ?? false;
    case "view_operations":
      return permissions.features?.viewOperations ?? false;
    default:
      return false;
  }
}

export function isAdmin(user: User) {
  return getUserEffectivePermissions(user).system.adminPanelAccess;
}

export function isLeadRole(user: User) {
  const permissions = getUserEffectivePermissions(user);
  return permissions.system.roleManagement && !permissions.system.adminPanelAccess;
}

export function canManageRoles(user: User) {
  return getUserEffectivePermissions(user).system.roleManagement;
}

export function canEditRole(user: User, role: Role) {
  if (isAdmin(user)) return true;
  if (!canManageRoles(user)) return false;
  return role.createdById === user.id;
}

export function canDeleteRole(user: User, role: Role) {
  return isAdmin(user);
}

export function getRoleLabel(id: RoleId) {
  return api.getRoleById(id)?.name ?? "Unknown role";
}

export function saveRole(role: Role) {
  return api.saveRole(role);
}

export function deleteRole(roleId: RoleId) {
  return api.deleteRole(roleId);
}

export function getDepartments() {
  return api.getDepartments();
}

export function getDepartmentById(id: DeptId) {
  return api.getDepartmentById(id);
}

export function getDepartmentLabel(id: DeptId) {
  return api.getDepartmentById(id)?.name ?? "Unknown";
}

export function getDepartmentFilters() {
  return [
    { id: "all", label: "All" },
    ...getDepartments().map((department) => ({ id: department.id, label: department.name })),
  ];
}

export function getTeams() {
  return api.getTeams();
}

export function getUsers() {
  return api.getUsers();
}

export function getUserById(id: string) {
  return api.getUserById(id);
}

export function getUserByRoleId(roleId: RoleId) {
  return api.getUserByRoleId(roleId);
}

export function getAllUsers() {
  return getUsers();
}

export function getDocuments() {
  return api.getDocuments();
}

export function getDocumentById(id: string) {
  return api.getDocumentById(id);
}

export function getResources() {
  return api.getResources();
}

export function getResourceById(id: string) {
  return api.getResourceById(id);
}

export function getActivityEvents() {
  return api.getActivityEvents();
}

export function canManageUsers(user: User) {
  return hasPermission(user, "manage_users") || hasPermission(user, "manage_roles");
}

export function canManageResources(user: User) {
  return hasPermission(user, "manage_resources") || isAdmin(user);
}

export function canViewResources(user: User) {
  return hasPermission(user, "view_resources");
}

export function canViewActivity(user: User) {
  return hasPermission(user, "view_activity");
}

export function canAddDocuments(user: User) {
  return hasPermission(user, "add_documents");
}

export function canUploadDocuments(user: User) {
  return hasPermission(user, "manage_uploads");
}

export function canPublishGlobally(user: User) {
  return hasPermission(user, "send_to_all");
}

export function canEditDocuments(user: User) {
  return hasPermission(user, "edit_documents");
}

export function canDeleteDocuments(user: User) {
  return hasPermission(user, "delete_documents");
}

export function canManageTeamDocuments(user: User) {
  return hasPermission(user, "manage_team_documents") || isAdmin(user);
}


export function canViewDocument(user: User, document: Document) {
  if (isAdmin(user)) return true;
  if (!getUserEffectivePermissions(user).documents.view) return false;
  if (!document.allowedUserTypes.includes(user.userType)) return false;

  const roleAllowed = document.allowedRoleIds.includes(user.roleId);
  const userExplicitlyAllowed = document.assignedUserIds?.includes(user.id) ?? false;
  return isVisibleToUser(user, document.visibilityScope, document.departmentId, document.allowedUserTypes, document.authorId) && (roleAllowed || userExplicitlyAllowed);
}

export function canViewResource(user: User, resource: ResourceItem) {
  if (isAdmin(user)) return true;
  if (!resource.allowedUserTypes.includes(user.userType)) return false;

  const roleAllowed = resource.allowedRoleIds.includes(user.roleId);
  return isVisibleToUser(user, resource.visibilityScope, undefined, resource.allowedUserTypes, resource.createdById) && roleAllowed;
}

export function getAccessibleDocuments(user: User) {
  return getDocuments().filter((document) => canViewDocument(user, document));
}

export function getAccessibleDocument(user: User, id: string) {
  const document = getDocumentById(id);
  return document && canViewDocument(user, document) ? document : undefined;
}

export function getDriveDocuments() {
  return api.getDriveDocuments();
}

export function getDriveDocumentById(id: string) {
  return api.getDriveDocumentById(id);
}

function normalizeTocItems(toc: { id: string; label: string; level: 1 | 2 | 3 }[]) {
  return toc.map((item) => ({
    id: item.id,
    label: item.label,
    level: item.level === 3 ? 2 : item.level,
  }));
}

export async function getParsedDriveDocument(id: string): Promise<DriveParsedDocument | undefined> {
  const reference = getDriveDocumentById(id);
  if (!reference) return undefined;
  const rawDoc = await api.fetchGoogleDocsApiDocument(reference.googleDocId);
  const parsed = parseGoogleDriveDocument(rawDoc as any);
  return {
    ...reference,
    toc: normalizeTocItems(parsed.toc),
    blocks: parsed.blocks as unknown as Block[],
  };
}

export async function refreshDriveDocumentSync(id: string) {
  const reference = getDriveDocumentById(id);
  if (!reference) {
    throw new Error("Drive document not found");
  }

  const rawDoc = await api.fetchGoogleDocsApiDocument(reference.googleDocId);
  const parsed = parseGoogleDriveDocument(rawDoc as any);

  api.updateDriveDocumentSyncMetadata(id, {
    lastSyncedAt: new Date().toISOString(),
    syncStatus: "synced",
    updatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  });

  return {
    ...reference,
    toc: normalizeTocItems(parsed.toc),
    blocks: parsed.blocks as unknown as Block[],
    source: "google_drive" as const,
    sourceMeta: reference,
  };
}

export function canViewDriveDocument(user: User, document: DriveDocumentReference) {
  if (isAdmin(user)) return true;
  if (!getUserEffectivePermissions(user).documents.view) return false;
  if (!document.allowedUserTypes.includes(user.userType)) return false;

  const roleAllowed = document.allowedRoleIds.includes(user.roleId);
  const userExplicitlyAllowed = document.assignedUserIds?.includes(user.id) ?? false;
  return isVisibleToUser(user, document.visibilityScope, document.departmentId, document.allowedUserTypes, document.authorId) && (roleAllowed || userExplicitlyAllowed);
}

export function getAccessibleDriveDocuments(user: User) {
  return getDriveDocuments().filter((document) => canViewDriveDocument(user, document));
}

export function searchDriveDocuments(user: User, query = "", departmentId?: DeptId | "all") {
  return searchDriveDocumentsService(user, getDriveDocuments(), query, departmentId);
}

export function getAccessibleDocumentEntities(user: User) {
  return [...getAccessibleDocuments(user), ...getAccessibleDriveDocuments(user)];
}

export async function getDocumentEntity(user: User, id: string) {
  const nativeDocument = getAccessibleDocument(user, id);
  if (nativeDocument) return nativeDocument;
  const driveDocument = getDriveDocumentById(id);
  if (!driveDocument || !canViewDriveDocument(user, driveDocument)) return undefined;
  return getParsedDriveDocument(id);
}

export function searchDocuments(user: User, query = "", departmentId?: DeptId | "all") {
  return searchDocumentsService(user, getDocuments(), query, departmentId);
}

export function getPinnedDocuments(user: User, limit = 3) {
  return getAccessibleDocuments(user).filter((doc) => doc.pinned).slice(0, limit);
}

export function getAccessibleResources(user: User) {
  return getResources().filter((resource) => canViewResource(user, resource));
}

export function searchResources(user: User, query = "", category?: ResourceCategory) {
  return searchResourcesService(user, getResources(), query, category);
}

export function getActivityFeed(user: User) {
  if (!canViewActivity(user)) return [];
  return filterActivityForUser(user, getActivityEvents()).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function recordActivity(event: Omit<ActivityEvent, "id" | "timestamp">) {
  const activity: ActivityEvent = {
    ...event,
    id: `act_${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  return api.saveActivity(activity);
}

export function getVideos() {
  return api.getVideos();
}

export function getAccessibleVideos(user: User) {
  return getVideos().filter((video) =>
    isVisibleToUser(user, video.visibilityScope, video.allowedDepartments?.[0], video.allowedUserTypes, video.createdById),
  );
}

export function createVideoItem(input: {
  title: string;
  description: string;
  provider: VideoProvider;
  embedUrl: string;
  thumbnail?: string;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  visibilityScope: VisibilityScope;
  createdById: string;
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
}) {
  const user = getUserById(input.createdById);
  if (!user || !canUploadDocuments(user)) {
    throw new Error("You are not authorized to add video content.");
  }
  const videoItem = {
    id: `video_${Date.now()}`,
    title: input.title,
    description: input.description,
    provider: input.provider,
    embedUrl: input.embedUrl,
    thumbnail: input.thumbnail,
    visibilityScope: input.visibilityScope,
    allowedRoleIds: input.allowedRoleIds,
    allowedUserTypes: input.allowedUserTypes,
    allowedDepartments: input.allowedDepartments,
    allowedTeamIds: input.allowedTeamIds,
    createdById: input.createdById,
    updatedAt: new Date().toISOString(),
    pinned: false,
  };
  api.saveVideo(videoItem);
  return videoItem;
}

export function getQuickActions(user: User) {
  const actions = [
    {
      label: "Document library",
      description: "Search SOPs and guides for your role.",
      id: "library",
      visible: true,
    },
    {
      label: "Onboarding hub",
      description: "Access role-based orientation workflows.",
      id: "library",
      category: "onboarding",
      visible: hasPermission(user, "view_onboarding"),
    },
    {
      label: "Creator workflows",
      description: "Review creator operations guides.",
      id: "library",
      category: "creator",
      visible: hasPermission(user, "view_creator_ops"),
    },
    {
      label: "Brand alignment",
      description: "Open brand review and guidance documents.",
      id: "library",
      category: "brand",
      visible: hasPermission(user, "view_brand"),
    },
    {
      label: "Finance hub",
      description: "Open finance operations for notices, expense forms, invoices, and policies.",
      id: "finance",
      visible: hasPermission(user, "send_to_all"),
    },
    {
      label: "HR & compliance",
      description: "Browse HR policies and team resources.",
      id: "resources",
      visible: hasPermission(user, "view_hr"),
    },
    {
      label: "Manage resources",
      description: "Add links and forms for your team.",
      id: "resources",
      visible: canManageResources(user),
    },
  ];

  return actions.filter((action) => action.visible !== false);
}

export function getSignInRoleOptions() {
  return getRoles().filter((role) => role.userType === "employee" || role.userType === "creator");
}

export function getCreatableRoles(user: User) {
  if (isAdmin(user)) {
    return getRoles();
  }

  if (!canManageRoles(user)) {
    return [];
  }

  const scopeRoleId = user.roleId;
  return getRoles().filter((role) => {
    if (role.createdById === user.id) return true;
    if (role.createdById === "system") {
      if (scopeRoleId === "role_im_team_lead") {
        return ["role_im_member", "role_intern", "role_creator"].includes(role.id);
      }
      if (scopeRoleId === "role_tm_team_lead") {
        return ["role_tm_member", "role_intern", "role_creator"].includes(role.id);
      }
    }
    return false;
  });
}

export function canCreateUser(user: User, roleId: RoleId) {
  if (isAdmin(user)) return true;
  if (!canManageRoles(user)) return false;
  return getCreatableRoles(user).some((role) => role.id === roleId);
}

export function getAssignableDepartments(user: User, roleId: RoleId) {
  if (isAdmin(user)) {
    return getDepartments().map((department) => department.id);
  }

  if (isLeadRole(user)) {
    if (roleId === "role_creator") return ["creator"];
    return [user.departmentId ?? "operations"];
  }

  return [];
}

export function getSupervisors(user: User) {
  return getUsers().filter((candidate) => {
    const role = getRoleById(candidate.roleId);
    if (!role) return false;
    if (candidate.id === user.id) return true;
    if (isAdmin(user)) return role.group === "team_lead" || role.id === "role_cofounder";
    if (isLeadRole(user)) {
      return role.group === "team_lead" && candidate.departmentId === user.departmentId && candidate.id !== user.id;
    }
    return false;
  });
}

export function createUser(input: {
  creator: User;
  name: string;
  email: string;
  roleId: RoleId;
  departmentId: DeptId;
  supervisorId?: string;
  assignedDocumentIds?: string[];
  status: User["status"];
}) {
  if (!input.name.trim() || !input.email.trim()) {
    throw new Error("Name and email are required.");
  }

  if (!input.departmentId) {
    throw new Error("Department is required.");
  }

  if (!input.roleId) {
    throw new Error("Role is required.");
  }

  if (!canCreateUser(input.creator, input.roleId)) {
    throw new Error("You are not authorized to create that role.");
  }

  const role = getRoleById(input.roleId);
  if (!role) {
    throw new Error("Selected role is invalid.");
  }

  const allowedDepartments = getAssignableDepartments(input.creator, input.roleId);
  if (allowedDepartments.length > 0 && !allowedDepartments.includes(input.departmentId)) {
    throw new Error("Selected department is outside your creation scope.");
  }

  const user: User = {
    id: `u-${Date.now()}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    avatar: input.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    userType: role.userType,
    roleId: role.id,
    departmentId: input.departmentId,
    supervisorId: input.supervisorId,
    permissionIds: getRolePermissionIds(role),
    createdById: input.creator.id,
    status: input.status,
  };

  api.saveUser(user);

  if (input.assignedDocumentIds && input.assignedDocumentIds.length > 0) {
    input.assignedDocumentIds.forEach((documentId) => {
      const document = getDocumentById(documentId);
      if (!document) return;
      if (!document.assignedUserIds) {
        document.assignedUserIds = [];
      }
      if (!document.assignedUserIds.includes(user.id)) {
        document.assignedUserIds.push(user.id);
      }
    });
  }

  recordActivity({
    userId: input.creator.id,
    action: "USER_MANAGED",
    targetType: "user",
    targetId: user.id,
    metadata: {
      role: role.name,
      status: input.status,
    },
  });

  return user;
}

export function createResource(resource: {
  title: string;
  description: string;
  category: ResourceCategory;
  href: string;
  external?: boolean;
  icon: string;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
  visibilityScope?: VisibilityScope;
  globalPinned?: boolean;
  mandatoryRead?: boolean;
  broadcastAudience?: BroadcastAudience;
  broadcastRoleIds?: RoleId[];
  broadcastDepartmentIds?: DeptId[];
  createdById: string;
}) {
  const creator = getUserById(resource.createdById);
  requireAuthenticatedUser(creator);
  requireResourceManagementPermission(creator);
  if (!resource.allowedRoleIds || resource.allowedRoleIds.length === 0) {
    throw new Error("Resource requires at least one allowed role.");
  }
  if (!resource.allowedUserTypes || resource.allowedUserTypes.length === 0) {
    throw new Error("Resource requires at least one allowed user type.");
  }
  if (resource.visibilityScope === "global" && !canPublishGlobally(creator)) {
    throw new Error("You are not authorized to publish resources globally.");
  }

  const newResource: ResourceItem = {
    id: `res_${Date.now()}`,
    title: resource.title,
    description: resource.description,
    category: resource.category,
    href: resource.href,
    external: resource.external ?? false,
    icon: resource.icon,
    allowedRoleIds: resource.allowedRoleIds,
    allowedUserTypes: resource.allowedUserTypes,
    allowedDepartments: resource.allowedDepartments,
    allowedTeamIds: resource.allowedTeamIds,
    visibilityScope: resource.visibilityScope ?? "private",
    createdById: resource.createdById,
    updatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    pinned: false,
    globalPinned: resource.globalPinned ?? false,
    mandatoryRead: resource.mandatoryRead ?? false,
    broadcastAudience: resource.broadcastAudience ?? "none",
    broadcastRoleIds: resource.broadcastRoleIds,
    broadcastDepartmentIds: resource.broadcastDepartmentIds,
  };
  api.saveResource(newResource);
  return newResource;
}

export async function createDocumentUploadFromFile(
  file: File,
  options: {
    title: string;
    description?: string;
    departmentId: DeptId;
    authorId: string;
    tag: DocTag;
    allowedRoleIds: RoleId[];
    allowedUserTypes?: UserType[];
    assignedUserIds?: string[];
    visibilityScope?: VisibilityScope;
    allowedDepartments?: DeptId[];
    allowedTeamIds?: string[];
  }
) {
  const author = getUserById(options.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  const uploadMetadata = await api.saveUploadFileToStorage(file, options.authorId, {
    tag: options.tag,
    departmentId: options.departmentId,
  });

  const parserType = getParserByMimeType(uploadMetadata.mimeType || file.type)?.parserType ?? getParserByExtension(file.name.split(".").pop()?.toLowerCase())?.parserType ?? "plainText";

  const document = createDocumentUpload({
    title: options.title.trim() || file.name.replace(/\.[^/.]+$/, ""),
    description: options.description?.trim() || "",
    departmentId: options.departmentId,
    authorId: options.authorId,
    tag: options.tag,
    allowedRoleIds: options.allowedRoleIds,
    allowedUserTypes: options.allowedUserTypes,
    assignedUserIds: options.assignedUserIds,
    visibilityScope: options.visibilityScope,
    allowedDepartments: options.allowedDepartments,
    allowedTeamIds: options.allowedTeamIds,
    rawSourceUrl: uploadMetadata.rawSourceUrl,
    previewUrl: uploadMetadata.previewUrl,
    mimeType: uploadMetadata.mimeType,
    storageBucket: uploadMetadata.storageBucket,
    storagePath: uploadMetadata.storagePath,
    storageSize: uploadMetadata.storageSize,
    uploadedBy: uploadMetadata.uploadedBy,
    extractedText: "",
    parsedBlocks: [],
    parserStatus: "pending",
    parserVersion: "1.0",
    lifecycleState: "processing",
    ingestionStatus: "queued",
    ingestionJobId: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  const job = enqueueIngestionJob({
    uploadId: uploadMetadata.uploadQueueId,
    documentId: document.id,
    sourceType: "localUpload",
    parserType,
    sourceUrl: uploadMetadata.rawSourceUrl,
    fileName: file.name,
    mimeType: uploadMetadata.mimeType || file.type,
    file,
    metadata: {
      authorId: options.authorId,
      departmentId: options.departmentId,
      tag: options.tag,
    },
  });

  document.ingestionJobId = job.id;
  document.ingestionStatus = job.status;
  api.saveDocument(document);

  startIngestionWorker();
  return document;
}

export function createDocumentUpload(document: {
  title: string;
  description: string;
  departmentId: DeptId;
  authorId: string;
  tag: DocTag;
  allowedRoleIds: RoleId[];
  allowedUserTypes?: UserType[];
  assignedUserIds?: string[];
  visibilityScope?: VisibilityScope;
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
  globalPinned?: boolean;
  mandatoryRead?: boolean;
  broadcastAudience?: BroadcastAudience;
  broadcastRoleIds?: RoleId[];
  broadcastDepartmentIds?: DeptId[];
  toc?: { id: string; label: string; level: 1 | 2 }[];
  blocks?: Block[];
  rawSourceUrl?: string;
  previewUrl?: string;
  mimeType?: string;
  storageBucket?: string;
  storagePath?: string;
  storageSize?: number;
  uploadedBy?: string;
  extractedText?: string;
  parsedBlocks?: Block[];
  parserStatus?: ParserStatus;
  parserVersion?: string;
  lifecycleState?: DocumentState;
  ingestionStatus?: "queued" | "processing" | "completed" | "failed" | "retrying";
  ingestionJobId?: string;
  parserConfidence?: number;
  parserWarnings?: string[];
}) {
  const author = getUserById(document.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  if (!document.allowedRoleIds || document.allowedRoleIds.length === 0) {
    throw new Error("Document upload requires at least one allowed role.");
  }

  const normalizedUserTypes =
    document.allowedUserTypes && document.allowedUserTypes.length > 0
      ? document.allowedUserTypes
      : [...new Set(document.allowedRoleIds.map((roleId) => getRoleById(roleId)?.userType).filter(Boolean) as UserType[])];

  if (normalizedUserTypes.length === 0) {
    throw new Error("Document upload requires at least one user type.");
  }

  if ((document.visibilityScope === "global" || document.broadcastAudience === "all" || document.broadcastAudience === "department" || document.broadcastRoleIds?.length) && !canPublishGlobally(author)) {
    throw new Error("You are not authorized to publish documents globally.");
  }

  const newDocument: Document = {
    id: `doc-${Date.now()}`,
    title: document.title,
    description: document.description,
    departmentId: document.departmentId,
    dept: getDepartmentLabel(document.departmentId),
    tag: document.tag,
    allowedRoleIds: document.allowedRoleIds,
    allowedUserTypes: normalizedUserTypes,
    assignedUserIds: document.assignedUserIds,
    readTime: estimateReadTime(document.description),
    authorId: document.authorId,
    author: author?.name ?? "Unknown",
    createdById: document.authorId,
    updatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    updatedById: document.authorId,
    version: "v1.0",
    pinned: false,
    globalPinned: document.globalPinned ?? false,
    mandatoryRead: document.mandatoryRead ?? false,
    broadcastAudience: document.broadcastAudience ?? "none",
    broadcastRoleIds: document.broadcastRoleIds,
    broadcastDepartmentIds: document.broadcastDepartmentIds,
    source: "uploaded",
    sourceProvider: "localUpload",
    lifecycleState: document.lifecycleState ?? "uploaded",
    visibilityScope: document.visibilityScope ?? "department",
    allowedDepartments: document.allowedDepartments ?? [document.departmentId],
    allowedTeamIds: document.allowedTeamIds,
    toc: document.toc ?? [{ id: "overview", label: "Overview", level: 1 }],
    blocks:
      document.blocks ?? [
        { type: "heading", id: "overview", content: document.title, anchorId: "overview" },
        { type: "paragraph", content: document.description },
      ],
    parsedBlocks: document.parsedBlocks,
    parserStatus: document.parserStatus,
    parserVersion: document.parserVersion,
    ingestionStatus: document.ingestionStatus,
    ingestionJobId: document.ingestionJobId,
    parserConfidence: document.parserConfidence,
    parserWarnings: document.parserWarnings,
  };

  api.saveDocument(newDocument);
  recordActivity({
    userId: document.authorId,
    action: "DOCUMENT_CREATED",
    targetType: "document",
    targetId: newDocument.id,
    metadata: { title: newDocument.title },
  });
  return newDocument;
}

export function publishDocument(user: User, documentId: string) {
  requireAuthenticatedUser(user);
  requirePublishingPermission(user);

  const document = getDocumentById(documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  document.lifecycleState = "published";
  document.updatedAt = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  document.updatedById = user.id;

  api.saveDocument(document);
  recordActivity({
    userId: user.id,
    action: "DOCUMENT_PUBLISHED",
    targetType: "document",
    targetId: document.id,
    metadata: { title: document.title },
  });
  return document;
}

export function archiveDocument(user: User, documentId: string) {
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  const document = getDocumentById(documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  document.lifecycleState = "archived";
  document.updatedAt = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  document.updatedById = user.id;

  api.saveDocument(document);
  recordActivity({
    userId: user.id,
    action: "DOCUMENT_ARCHIVED",
    targetType: "document",
    targetId: document.id,
    metadata: { title: document.title },
  });
  return document;
}

export function updateDocumentMetadata(user: User, documentId: string, updates: Partial<Pick<Document, "title" | "description" | "tag" | "visibilityScope" | "allowedRoleIds" | "allowedUserTypes" | "allowedDepartments" | "allowedTeamIds" | "pinned">>) {
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  const document = getDocumentById(documentId);
  if (!document) {
    throw new Error("Document not found.");
  }

  Object.assign(document, updates, {
    updatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    updatedById: user.id,
  });

  api.saveDocument(document);
  recordActivity({
    userId: user.id,
    action: "DOCUMENT_UPDATED",
    targetType: "document",
    targetId: document.id,
    metadata: { title: document.title },
  });
  return document;
}

export function createDocumentVersionSnapshot(documentId: string, userId: string) {
  const document = getDocumentById(documentId);
  const user = getUserById(userId);
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  if (!document) {
    throw new Error("Document not found.");
  }

  const versionId = `snapshot-${document.id}-${Date.now()}`;
  const snapshot = {
    ...document,
    versionId,
    snapshotAt: new Date().toISOString(),
    snapshotBy: user.id,
  };

  recordActivity({
    userId: user.id,
    action: "DOCUMENT_VERSIONED",
    targetType: "document",
    targetId: document.id,
    metadata: { snapshotId: versionId, title: document.title },
  });

  return snapshot;
}

export function createDriveDocumentReference(input: {
  title: string;
  description: string;
  departmentId: DeptId;
  authorId: string;
  tag: DocTag;
  driveFileId: string;
  googleDocId: string;
  webViewLink: string;
  fileMimeType: string;
  ownerEmail: string;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  allowedDepartments?: DeptId[];
  allowedDepartmentIds?: DeptId[];
  allowedTeamIds?: string[];
  visibilityScope?: VisibilityScope;
  source?: DocumentSource;
  sourceProvider?: "googleDrive" | "localDrive";
  driveProvider?: "googleDrive" | "localDrive";
  globalPinned?: boolean;
  mandatoryRead?: boolean;
  broadcastAudience?: BroadcastAudience;
  broadcastRoleIds?: RoleId[];
  broadcastDepartmentIds?: DeptId[];
  folderId?: string;
  folderName?: string;
  linkedDocumentId?: string;
  uploadedBy?: string;
  permissionSummary?: DriveDocumentPermission[];
}) {
  const author = getUserById(input.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  if (!input.allowedRoleIds || input.allowedRoleIds.length === 0) {
    throw new Error("Drive document requires at least one allowed role.");
  }

  const normalizedUserTypes = input.allowedUserTypes && input.allowedUserTypes.length > 0
    ? input.allowedUserTypes
    : [...new Set(input.allowedRoleIds.map((roleId) => getRoleById(roleId)?.userType).filter(Boolean) as UserType[])];

  if (normalizedUserTypes.length === 0) {
    throw new Error("Drive document requires at least one user type.");
  }

  const document: DriveDocumentReference = {
    id: `drive-${Date.now()}`,
    title: input.title,
    description: input.description,
    departmentId: input.departmentId,
    dept: getDepartmentLabel(input.departmentId),
    tag: input.tag,
    allowedRoleIds: input.allowedRoleIds,
    allowedUserTypes: normalizedUserTypes,
    allowedDepartments: input.allowedDepartments,
    allowedTeamIds: input.allowedTeamIds,
    visibilityScope: input.visibilityScope ?? "department",
    globalPinned: input.globalPinned ?? false,
    mandatoryRead: input.mandatoryRead ?? false,
    broadcastAudience: input.broadcastAudience ?? "none",
    broadcastRoleIds: input.broadcastRoleIds,
    broadcastDepartmentIds: input.broadcastDepartmentIds,
    readTime: estimateReadTime(input.description),
    authorId: input.authorId,
    author: getUserById(input.authorId)?.name ?? "Unknown",
    createdById: input.authorId,
    updatedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    updatedById: input.authorId,
    version: "v1.0",
    pinned: false,
    source: input.source === "uploaded" ? "local_drive" : input.source ?? "google_drive",
    sourceProvider: input.sourceProvider ?? (input.source === "uploaded" ? "localDrive" : "googleDrive"),
    driveProvider: input.driveProvider ?? input.sourceProvider ?? "googleDrive",
    lifecycleState: "uploaded",
    driveFileId: input.driveFileId,
    googleDocId: input.googleDocId,
    webViewLink: input.webViewLink,
    fileMimeType: input.fileMimeType,
    ownerEmail: input.ownerEmail,
    folderId: input.folderId,
    folderName: input.folderName,
    linkedDocumentId: input.linkedDocumentId,
    uploadedBy: input.uploadedBy ?? input.authorId,
    driveUrl: input.webViewLink,
    permissionSummary: input.permissionSummary ?? [],
    syncStatus: "pending",
    lastSyncedAt: new Date().toISOString(),
    lastDriveModifiedAt: new Date().toISOString(),
    extractedText: undefined,
    parsedBlocks: [],
    parserStatus: "pending",
    parserVersion: "1.0",
  };

  api.saveDriveDocumentReference(document);
  recordActivity({
    userId: input.authorId,
    action: "DOCUMENT_CREATED",
    targetType: "document",
    targetId: document.id,
    metadata: { title: document.title, source: "google_drive" },
  });
  return document;
}

export function createVideoBlock(input: {
  title: string;
  description: string;
  provider: VideoProvider;
  embedUrl: string;
  thumbnail?: string;
  timestamps?: VideoTimestamp[];
  transcript?: string;
  relatedResourceIds?: string[];
  id?: string;
}) {
  return {
    id: input.id ?? `video-${Date.now()}`,
    type: "video" as const,
    title: input.title,
    description: input.description,
    provider: input.provider,
    embedUrl: input.embedUrl,
    thumbnail: input.thumbnail,
    timestamps: input.timestamps ?? [],
    transcript: input.transcript,
    relatedResourceIds: input.relatedResourceIds,
  };
}

function estimateReadTime(text: string) {
  const words = text.trim().split(/\s+/).length;
  return `${Math.max(1, Math.ceil(words / 180))} min`;
}

