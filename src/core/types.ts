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
// public.users.business_line is free text on the live schema (not a fixed
// catalog), so this stays a plain string rather than a closed union.
export type DeptId     = string;

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
  | "view_operations"
  | "approve_leave_tl"
  | "approve_leave_hr"
  | "manage_hr_calendar"
  | "view_hr_records_all"
  | "submit_probation_review"
  | "decide_probation_review"
  | "acknowledge_deboarding"
  | "approve_deboarding_employee_track"
  | "flag_deboarding_any"
  | "view_team_leave_history"
  | "manage_people"
  | "manage_onboarding";

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
    approveLeaveTl:                 boolean;
    approveLeaveHr:                 boolean;
    manageHrCalendar:               boolean;
    viewHrRecordsAll:               boolean;
    submitProbationReview:          boolean;
    decideProbationReview:          boolean;
    acknowledgeDeboarding:          boolean;
    approveDeboardingEmployeeTrack: boolean;
    flagDeboardingAny:              boolean;
    viewTeamLeaveHistory:           boolean;
    managePeople:                   boolean;
    manageOnboarding:               boolean;
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
  /** Normalized authorization source from global.roles.name. */
  roleName?:      string;
  departmentId?:  DeptId;
  teamId?:        string;
  supervisorId?:  string;
  designationId?: string;
  permissionIds:  PermissionId[];
  createdById:    string;
  status:         UserStatus;
  // ISO date the employee joined. Required going forward for every user
  // created via createUser(); optional here because rows predating this
  // field have no reliable value — never fabricate one for those.
  dateJoined?:    string;
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
  documentVersionId?: string;
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
  | "video"
  | "code"
  | "image"
  | "list_item";

export interface BaseBlock {
  type: BlockType;
  id?:  string;
  content?: string;
}

export interface CodeBlock extends BaseBlock {
  type:    "code";
  content: string;
}

export interface ImageBlock extends Omit<BaseBlock, "content"> {
  type:    "image";
  content: { src: string; alt?: string };
}

export interface ListItemBlock extends BaseBlock {
  type:    "list_item";
  content: string;
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
  | CodeBlock
  | ImageBlock
  | ListItemBlock
  | BaseBlock;

// ─── Document (full) ─────────────────────────────────────────────────────────

export interface TocItem {
  id:    string;
  label: string;
  level: 1 | 2 | 3;
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
  | "SYSTEM_EVENT"
  | "LEAVE_SUBMITTED"
  | "LEAVE_TL_APPROVED"
  | "LEAVE_HR_APPROVED"
  | "LEAVE_REJECTED"
  | "LEAVE_CANCELLED"
  | "ONBOARDING_SUBMITTED"
  | "ONBOARDING_ACKNOWLEDGED"
  | "ONBOARDING_REJECTED"
  | "ONBOARDING_COMPLETED"
  | "PROBATION_SUBMITTED"
  | "PROBATION_UNDER_REVIEW"
  | "PROBATION_DECIDED"
  | "PROBATION_NOTE_ADDED"
  | "DEBOARDING_FLAGGED"
  | "DEBOARDING_ACKNOWLEDGED"
  | "DEBOARDING_APPROVED"
  | "DEBOARDING_FOUNDER_APPROVED"
  | "DEBOARDING_COMPLETED"
  | "ATTENDANCE_UPDATED"
  | "DATE_JOINED_CHANGED";

export interface ActivityEvent {
  id:          string;
  userId:      string;
  action:      ActivityAction;
  targetId?:   string;
  targetType:  "document" | "resource" | "user" | "system" | "hr_record";
  timestamp:   string;
  metadata?:   Record<string, string>;
}

// ─── HR ──────────────────────────────────────────────────────────────────────

export type OnboardingStatus = "pending" | "submitted" | "acknowledged" | "completed";

export interface OnboardingRecord {
  id:               string;
  userId:           string;
  status:           OnboardingStatus;
  onboardingData:   Record<string, string>;
  complianceData:   Record<string, string>;
  form11SentAt?:    string;
  submittedAt?:     string;
  acknowledgedById?: string;
  acknowledgedAt?:  string;
  completedById?:    string;
  completedAt?:      string;
  rejectedById?:    string;
  rejectedAt?:      string;
  rejectionReason?: string;
  createdAt:        string;
}

export type LeaveRequestType = "leave" | "wfh";

export type LeaveStatus =
  | "pending"
  | "cancelled"
  | "tl_approved"
  | "cofounder_pending"
  | "hr_approved"
  | "rejected";

export interface LeaveRequest {
  id:               string;
  userId:           string;
  requestType:      LeaveRequestType;
  dateFrom:         string;
  dateTo:           string;
  reason:           string;
  additionalInfo?:  string;
  status:           LeaveStatus;
  rejectionReason?: string;
  cancelledAt?:     string;
  tlApprovedById?:  string;
  tlApprovedAt?:    string;
  hrApprovedById?:  string;
  hrApprovedAt?:    string;
  founderNotified:  boolean;
  createdAt:        string;
  updatedAt:        string;
}

// Leave balance tracks total / used / remaining per user per year per type.
export interface LeaveBalance {
  id:             string;
  userId:         string;
  year:           number;
  leaveType:      string;
  totalAllocated: number;
  used:           number;
  updatedAt:      string;
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  leave: "Leave",
  wfh:   "WFH",
  // backward-compat display for records created before the simplification
  annual_leave:    "Leave",
  sick_leave:      "Leave",
  casual_leave:    "Leave",
  emergency_leave: "Leave",
  comp_off:        "Leave",
  maternity_leave: "Leave",
  paternity_leave: "Leave",
};

export const LEAVE_TYPES_WITH_BALANCE: ReadonlySet<string> = new Set(["leave"]);

// Day-level attendance register: one record per employee per month, with a
// status per calendar day. Totals are derived (see computeAttendanceTotals
// in core/operon.ts) rather than stored, so they can never drift from the
// underlying day marks.
export type AttendanceDayStatus = "present" | "leave" | "wfh" | "absent" | "half_day";

export interface AttendanceRecord {
  id:        string;
  userId:    string;
  month:     string; // "YYYY-MM"
  days:      Record<string, AttendanceDayStatus>; // key = day-of-month, e.g. "1".."31"
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceAuditEntry {
  id:                 string;
  attendanceRecordId: string;
  userId:             string; // whose attendance changed
  changedById:        string; // who made the change
  date:               string; // ISO date "YYYY-MM-DD"
  previousStatus:     AttendanceDayStatus | null;
  newStatus:          AttendanceDayStatus | null;
  reason?:            string; // required when changedById !== userId
  createdAt:          string;
}

export type HolidayType = "public" | "optional" | "company";

export interface Holiday {
  id:           string;
  date:         string;
  name:         string;
  type:         HolidayType;
  createdById:  string;
  createdAt:    string;
  updatedAt:    string;
}

export type ProbationStatus =
  | "pending"
  | "under_review"
  | "confirmed"
  | "extended"
  | "terminated";

export const PROBATION_ACTIVE_STATUSES: ReadonlySet<ProbationStatus> = new Set<ProbationStatus>([
  "pending",
  "under_review",
  "extended",
]);

export const PROBATION_TERMINAL_STATUSES: ReadonlySet<ProbationStatus> = new Set<ProbationStatus>([
  "confirmed",
  "terminated",
]);

export interface ProbationRecord {
  id:                      string;
  userId:                  string;
  dateJoined:              string;
  probationDurationDays:   number;       // normalized/stored value, default 90
  probationDurationUnit:   "days" | "months"; // unit the duration was entered in
  expectedReviewDate:      string;       // ISO date = dateJoined + probationDurationDays
  status:                  ProbationStatus;
  reviewedById?:           string;
  reviewedAt?:             string;
  parentRecordId?:         string;       // set on extension children
  submittedById:           string;
  createdAt:               string;
}

// Append-only note log — replaces single mutable notes field.
export interface ProbationNote {
  id:               string;
  probationRecordId: string;
  authorId:         string;
  note:             string;
  noteType:         "assessment" | "decision" | "general";
  createdAt:        string;
}

export type DeboardingTrack  = "creator" | "employee";
export type DeboardingStatus =
  | "pending_lead_approval"     // creator track: CA submitted, awaiting TL/Senior TM
  | "pending_founder_approval"  // employee track: HR submitted, awaiting Co-Founder sign-off
  | "data_recovery_pending"     // both tracks: access/data checklist in progress
  | "offboarded";               // complete — user.status set to "disabled"

export interface DeboardingRecord {
  id:                 string;
  userId:             string;
  initiatedById:      string;
  track:              DeboardingTrack;
  status:             DeboardingStatus;
  reason?:            string;
  initiatedAt:        string;
  approvedById?:      string;   // TL who approved the creator deboarding
  approvedAt?:        string;
  founderApprovedById?: string; // Co-Founder who approved the employee deboarding
  founderApprovedAt?: string;
  checklist:          Record<string, boolean>;
  completedById?:     string;
  completedAt?:       string;
  createdAt:          string;
}

// One row per reporting-manager change, so past attendance/leave history can
// resolve "who was the manager on date X" instead of overwriting it. The
// current manager is whichever entry has the latest effectiveFrom for that user.
export interface ManagerHistoryEntry {
  id:            string;
  userId:        string;
  supervisorId?: string;
  changedById:   string;
  effectiveFrom: string; // ISO date
  createdAt:     string;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationEntityType = "leave" | "onboarding" | "probation" | "deboarding" | "document" | "user";

export interface Notification {
  id:               string;
  title:            string;
  body:             string;
  notificationType: "system" | "document" | "resource" | "user";
  audience:         "all" | "department" | "role" | "user";
  departmentIds?:   DeptId[];
  roleIds?:         RoleId[];
  userIds?:         string[];
  actorId?:         string;
  entityType?:      NotificationEntityType;
  entityId?:        string;
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
