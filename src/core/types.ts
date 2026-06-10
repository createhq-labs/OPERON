// ─────────────────────────────────────────────────────────────────────────────
// Operon — Domain Types
//
// Single source of truth for every interface, type alias, and enum used across
// the platform. Import from here directly; operon.ts re-exports everything.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Primitive Aliases ───────────────────────────────────────────────────────

export type UserType   = "employee" | "creator";
export type UserStatus = "active" | "invited" | "disabled";
export type RoleId     = string;
export type DeptId     = "im" | "tm" | "hr" | "finance" | "onboarding" | "creator" | "brand" | "operations";

// ─── Permissions ─────────────────────────────────────────────────────────────

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
    view:   boolean;
    edit:   boolean;
    delete: boolean;
    upload: boolean;
  };
  users: {
    create:     boolean;
    edit:       boolean;
    delete:     boolean;
    assignRole: boolean;
  };
  system: {
    adminPanelAccess: boolean;
    roleManagement:   boolean;
  };
  features?: Partial<{
    viewActivity:   boolean;
    viewResources:  boolean;
    manageResources: boolean;
    sendToAll:      boolean;
    viewHr:         boolean;
    viewOnboarding: boolean;
    viewCreatorOps: boolean;
    viewBrand:      boolean;
    viewOperations: boolean;
  }>;
}

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface Role {
  id:           string;
  name:         string;
  description?: string;
  userType:     UserType;
  permissions:  RolePermissions;
  inheritsFrom?: string;
  createdById?:  string;
  group?:        string;
  permissionIds?: PermissionId[];
}

export interface Department {
  id:   DeptId;
  name: string;
}

export interface Team {
  id:           string;
  name:         string;
  departmentId: DeptId;
}

export interface User {
  id:             string;
  name:           string;
  email:          string;
  avatar:         string;
  userType:       UserType;
  roleId:         RoleId;
  departmentId?:  DeptId;
  teamId?:        string;
  supervisorId?:  string;
  permissionIds:  PermissionId[];
  createdById:    string;
  status:         UserStatus;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export type DocTag =
  | "sop"
  | "onboarding"
  | "brand"
  | "creator"
  | "ops"
  | "hr"
  | "internal";

export type ParserStatus   = "pending" | "parsed" | "failed";
export type SyncStatus     = "pending" | "syncing" | "synced" | "stale" | "failed";
export type DocumentSource = "uploaded" | "google_drive" | "local_drive";
export type DocumentState  =
  | "draft"
  | "uploaded"
  | "processing"
  | "parsed"
  | "review"
  | "approved"
  | "published"
  | "archived"
  | "failed";
export type VisibilityScope    = "global" | "department" | "private";
export type BroadcastAudience  = "none" | "department" | "all";

export type IngestionStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "parsed"
  | "indexed"
  | "completed"
  | "failed"
  | "retrying";

export interface DocMeta {
  id:            string;
  title:         string;
  description:   string;
  departmentId:  DeptId;
  dept:          string;
  tag:           DocTag;
  allowedRoleIds:      RoleId[];
  allowedUserTypes:    UserType[];
  assignedUserIds?:    string[];
  readTime:      string;
  authorId:      string;
  author:        string;
  createdById?:  string;
  updatedAt:     string;
  updatedById?:  string;
  version:       string;
  pinned?:       boolean;
  globalPinned?: boolean;
  mandatoryRead?: boolean;
  source?:           DocumentSource;
  sourceProvider?:   "localUpload" | "googleDrive" | "localDrive";
  rawSourceUrl?:     string;
  mimeType?:         string;
  storageBucket?:    string;
  storagePath?:      string;
  storageSize?:      number;
  previewUrl?:       string;
  uploadedBy?:       string;
  extractedText?:    string;
  parsedBlocks?:     Block[];
  parserStatus?:     ParserStatus;
  parserVersion?:    string;
  parserConfidence?: number;
  parserWarnings?:   string[];
  lifecycleState:    DocumentState;
  visibilityScope:   VisibilityScope;
  allowedDepartments?:   DeptId[];
  allowedDepartmentIds?: DeptId[];
  allowedTeamIds?:       string[];
  ingestionStatus?:  IngestionStatus;
  ingestionJobId?:   string;
  broadcastAudience?:     BroadcastAudience;
  broadcastRoleIds?:      RoleId[];
  broadcastDepartmentIds?: DeptId[];
}

// ─── Drive ───────────────────────────────────────────────────────────────────

export interface DriveDocumentPermission {
  role:          "reader" | "commenter" | "writer" | "owner";
  emailAddress?: string;
  domain?:       string;
}

export interface DriveDocumentReference extends DocMeta {
  source:         "google_drive" | "local_drive";
  sourceProvider: "googleDrive" | "localDrive";
  driveProvider?: "googleDrive" | "localDrive";
  driveFileId:            string;
  googleDocId:            string;
  driveUrl?:              string;
  folderId?:              string;
  folderName?:            string;
  linkedDocumentId?:      string;
  webViewLink:            string;
  fileMimeType:           string;
  ownerEmail:             string;
  permissionSummary:      DriveDocumentPermission[];
  syncStatus:             SyncStatus;
  lastSyncedAt:           string;
  lastDriveModifiedAt:    string;
  lastDriveCreatedAt?:    string;
}

export type GoogleDocsApiStructuralElement =
  | {
      type: "paragraph";
      paragraph: {
        elements?: Array<{ textRun?: { content?: string } }>;
        paragraphStyle?: { namedStyleType?: string };
        bullet?: { listId?: string; glyphType?: string };
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

export interface GoogleDocsApiDocument {
  documentId: string;
  title:      string;
  body: {
    content: GoogleDocsApiStructuralElement[];
  };
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

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
  id?:  string;
}

export interface HeadingBlock extends BaseBlock {
  type:     "heading";
  content:  string;
  anchorId: string;
}

export interface SubheadingBlock extends BaseBlock {
  type:    "subheading";
  content: string;
}

export interface ParagraphBlock extends BaseBlock {
  type:    "paragraph";
  content: string;
}

export interface AlertBlock extends BaseBlock {
  type:     "warning" | "note" | "callout" | "success";
  title?:   string;
  content:  string;
}

export interface ChecklistItem {
  id:       string;
  label:    string;
  required?: boolean;
}

export interface ChecklistBlock extends BaseBlock {
  type:  "checklist";
  title: string;
  items: ChecklistItem[];
}

export interface StepItem {
  title:       string;
  description: string;
}

export interface StepsBlock extends BaseBlock {
  type:  "steps";
  items: StepItem[];
}

export interface FaqItem {
  question: string;
  answer:   string;
}

export interface FaqBlock extends BaseBlock {
  type:  "faq";
  items: FaqItem[];
}

export interface TableBlock extends BaseBlock {
  type:    "table";
  headers: string[];
  rows:    string[][];
}

export interface TimelineItem {
  period:      string;
  title:       string;
  description: string;
}

export interface TimelineBlock extends BaseBlock {
  type:  "timeline";
  items: TimelineItem[];
}

export interface ResourceBlock extends BaseBlock {
  type:        "resource";
  title:       string;
  description: string;
  href:        string;
  external?:   boolean;
}

export type VideoProvider = "loom" | "google_drive" | "vimeo" | "youtube";

export interface VideoTimestamp {
  label:   string;
  seconds: number;
}

export interface VideoBlock extends BaseBlock {
  type:               "video";
  title:              string;
  description:        string;
  provider:           VideoProvider;
  embedUrl:           string;
  thumbnail?:         string;
  timestamps?:        VideoTimestamp[];
  transcript?:        string;
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

// ─── Document (full) ─────────────────────────────────────────────────────────

export interface TocItem {
  id:    string;
  label: string;
  level: 1 | 2;
}

export interface Document extends DocMeta {
  toc:    TocItem[];
  blocks: Block[];
}

export interface DriveParsedDocument extends DriveDocumentReference {
  toc:    TocItem[];
  blocks: Block[];
}

export interface ParsedDocument {
  title:       string;
  description: string;
  blocks:      Block[];
  toc:         TocItem[];
  content:     string;
}

export interface DocumentVersion {
  id:            string;
  documentId:    string;
  versionNumber: number;
  createdById:   string;
  createdAt:     string;
  summary:       string;
  snapshot:      Document;
}

// ─── Resources & Videos ──────────────────────────────────────────────────────

export type ResourceCategory = "forms" | "policies" | "training" | "team" | "external";

export interface ResourceItem {
  id:               string;
  title:            string;
  description:      string;
  category:         ResourceCategory;
  href:             string;
  external?:        boolean;
  icon:             string;
  allowedRoleIds:       RoleId[];
  allowedUserTypes:     UserType[];
  allowedDepartments?:  DeptId[];
  allowedTeamIds?:      string[];
  visibilityScope:  VisibilityScope;
  createdById:      string;
  updatedAt:        string;
  pinned?:          boolean;
  globalPinned?:    boolean;
  mandatoryRead?:   boolean;
  broadcastAudience?:     BroadcastAudience;
  broadcastRoleIds?:      RoleId[];
  broadcastDepartmentIds?: DeptId[];
}

export interface VideoItem {
  id:               string;
  title:            string;
  description:      string;
  provider:         VideoProvider;
  embedUrl:         string;
  thumbnail?:       string;
  visibilityScope:  VisibilityScope;
  allowedRoleIds:       RoleId[];
  allowedUserTypes:     UserType[];
  allowedDepartments?:  DeptId[];
  allowedTeamIds?:      string[];
  createdById:      string;
  updatedAt:        string;
  pinned?:          boolean;
}

// ─── Activity ────────────────────────────────────────────────────────────────

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
  id:          string;
  userId:      string;
  action:      ActivityAction;
  targetId?:   string;
  targetType:  "document" | "resource" | "user" | "system";
  timestamp:   string;
  metadata?:   Record<string, string>;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface Notification {
  id:               string;
  title:            string;
  body:             string;
  notificationType: "system" | "document" | "resource" | "user";
  audience:         "all" | "department" | "role" | "user";
  departmentIds?:   DeptId[];
  roleIds?:         RoleId[];
  userIds?:         string[];
  metadata?:        Record<string, string>;
  createdAt:        string;
  expiresAt?:       string;
  unreadBy?:        string[];
}

// ─── Quick Actions ───────────────────────────────────────────────────────────

export interface QuickActionItem {
  id:           string;
  label:        string;
  description:  string;
  category?:    string;
  visible:      boolean;
  createdById?: string;
  updatedAt?:   string;
}