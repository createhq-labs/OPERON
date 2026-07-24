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
  OnboardingStatus,
  OnboardingRecord,
  LeaveRequestType,
  LeaveStatus,
  LeaveRequest,
  LeaveBalance,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES_WITH_BALANCE,
  AttendanceDayStatus,
  AttendanceRecord,
  AttendanceAuditEntry,
  HolidayType,
  Holiday,
  ProbationStatus,
  PROBATION_ACTIVE_STATUSES,
  PROBATION_TERMINAL_STATUSES,
  ProbationRecord,
  ProbationNote,
  DeboardingTrack,
  DeboardingStatus,
  DeboardingRecord,
  ManagerHistoryEntry,
} from "@/core/types";

export {
  formatDocumentDate,
  formatRelativeTime,
} from "@/core/helpers";

// Pull in types we use internally in this file
import { ROLE_IDS } from "@/core/roles";
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
  VisibilityScope,
  BroadcastAudience,
  ResourceItem,
  ResourceCategory,
  ActivityEvent,
  UserType,
  DriveParsedDocument,
  Notification,
  OnboardingRecord,
  AttendanceDayStatus,
  AttendanceRecord,
  Holiday,
  DeboardingRecord,
} from "@/core/types";

import {
  EMPTY_ROLE_PERMISSIONS,
  getRoleEffectivePermissions as computeRoleEffectivePermissions,
  getRolePermissionIds as computeRolePermissionIds,
  userMatchesAccessRestrictions,
  normalizeTocItems,
  formatDocumentDate,
  deriveQuickActions,
  generateActivityId,
  generateResourceId,
  generateDeboardingId,
  generateNotificationId,
  generateManagerHistoryId,
} from "@/core/helpers";

import * as api from "@/services/api";
import { parseGoogleDriveDocument } from "@/services/parser";
import { uploadDocumentFile, uploadDocumentNewVersion, updateDocument } from "@/services/documentUpload";
import { filterActivityForUser } from "@/services/activity";
import { isVisibleToUser } from "@/security/visibility";
import { getCurrentDocumentVersionId } from "@/services/documentPlatform";
import {
  requireAuthenticatedUser,
  requireResourceManagementPermission,
  requireUploadPermission,
  requireEditingPermission,
  requireManagePeoplePermission,
  requireOnboardingManagementPermission,
  requireDeboardingEmployeeApprovalPermission,
} from "@/security/accessControl";
import {
  canViewAllHrRecords,
  canSubmitCreatorDeboarding,
  canApproveCreatorDeboarding,
  canInitiateEmployeeDeboarding,
  canManagePeople,
} from "@/security/permissions";
import {
  searchDocuments as searchDocumentsService,
  searchResources as searchResourcesService,
} from "@/services/search";

// ─── Role & Permission Queries ────────────────────────────────────────────────

export function getRoles() {
  return api.getRoles();
}

export function getRoleById(id: RoleId) {
  return api.getRoleById(id);
}

function getUserRole(user: User) {
  return getRoleById(user.roleId);
}

function getRoleEffectivePermissions(role: Role): RolePermissions {
  return computeRoleEffectivePermissions(role, getRoleById);
}

export function getRolePermissionIds(role: Role): PermissionId[] {
  return computeRolePermissionIds(getRoleEffectivePermissions(role));
}

function getUserEffectivePermissions(user: User): RolePermissions {
  const role = getUserRole(user);
  return role ? getRoleEffectivePermissions(role) : EMPTY_ROLE_PERMISSIONS;
}

/**
 * Real capability check — reads the permission names actually resolved
 * for this user from global.role_permissions/global.permissions (attached
 * at identity resolution, see src/lib/workforcePermissionLookup.ts), not a
 * hardcoded per-legacy-role mock bag. Legacy mock users (services/api.ts's
 * USERS, used when Supabase isn't configured) hand-author permissionIds
 * directly, so this works unchanged for both real and mock identities.
 */
export function hasPermission(user: User, permission: PermissionId): boolean {
  return user.permissionIds.includes(permission);
}

export function isAdmin(user: User): boolean {
  return getUserEffectivePermissions(user).system.adminPanelAccess;
}

function isLeadRole(user: User): boolean {
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

function getDepartmentById(id: DeptId) {
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

export function registerLocalUser(user: User) {
  return api.registerLocalUser(user);
}


/** Alias for getUsers() — prefer getUsers() in new code. */
export function getAllUsers() {
  return getUsers();
}

// ─── Document Queries ─────────────────────────────────────────────────────────

function getDocuments() {
  return api.getDocuments();
}

function getDocumentById(id: string) {
  return api.getDocumentById(id);
}

function getDriveDocumentById(id: string) {
  return api.getDriveDocumentById(id);
}

// ─── Resource & Video Queries ─────────────────────────────────────────────────

function getResources() {
  return api.getResources();
}

export function getResourceById(id: string) {
  return api.getResourceById(id);
}


function getActivityEvents() {
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

export function canPublishGlobally(user: User): boolean {
  return hasPermission(user, "send_to_all");
}

export function canEditDocuments(user: User): boolean {
  return hasPermission(user, "edit_documents");
}

export function canDeleteDocuments(user: User): boolean {
  return hasPermission(user, "delete_documents");
}

// ─── Document Visibility ─────────────────────────────────────────────────────

export function canViewDocument(user: User, document: Document): boolean {
  // Archived documents are hidden from every user, admins included — there is
  // no restore UI yet, so an archived doc should behave like it's gone.
  if (document.lifecycleState === "archived") return false;
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

function canViewDriveDocument(user: User, document: DriveDocumentReference): boolean {
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


export function getPinnedDocuments(user: User, limit = 3) {
  return getAccessibleDocuments(user)
    .filter((doc) => doc.pinned)
    .slice(0, limit);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export function searchDocuments(user: User, query = "", departmentId?: DeptId | "all") {
  return searchDocumentsService(user, getDocuments(), query, departmentId);
}

export function searchResources(user: User, query = "", category?: ResourceCategory) {
  return searchResourcesService(user, getResources(), query, category);
}

// ─── Drive Document Parsing ───────────────────────────────────────────────────

async function getParsedDriveDocument(id: string): Promise<DriveParsedDocument | undefined> {
  const reference = getDriveDocumentById(id);
  if (!reference) return undefined;

  const documentVersionId =
    reference.documentVersionId ??
    (reference.linkedDocumentId
      ? await getCurrentDocumentVersionId(reference.linkedDocumentId)
      : undefined);

  const rawDoc = await api.fetchGoogleDocsApiDocument(reference.googleDocId);
  const parsed = parseGoogleDriveDocument(rawDoc as never);

  return {
    ...reference,
    documentVersionId,
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

function recordActivity(event: Omit<ActivityEvent, "id" | "timestamp">) {
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


// ─── User Management ─────────────────────────────────────────────────────────

export function getCreatableRoles(user: User) {
  if (isAdmin(user)) return getRoles();
  // Workforce-admin tier (finance/team_lead too, not just admin) onboards
  // employees into any existing non-admin role — this is people management,
  // not role management, so it isn't gated by canManageRoles. The previous
  // per-role-scoped creation menus (IM Team Lead vs TM Team Lead creating
  // into different sub-catalogs) no longer apply — there's a single flat
  // 5-role catalog post role-collapse, so that branch is gone.
  if (canManagePeople(user)) {
    return getRoles().filter((role) => role.id !== ROLE_IDS.ADMIN);
  }
  return [];
}

/** roleId no longer signals creator-vs-employee (that's userType now) — kept for call-site compatibility. */
export function getAssignableDepartments(user: User, _roleId: RoleId): DeptId[] {
  if (isAdmin(user)) return getDepartments().map((dept) => dept.id);

  if (isLeadRole(user)) {
    return [user.departmentId ?? "operations"];
  }

  return [];
}

export function getSupervisors(user: User) {
  return getUsers().filter((candidate) => {
    const role = getRoleById(candidate.roleId);
    if (!role) return false;
    if (candidate.id === user.id) return true;
    if (isAdmin(user)) return role.group === "team_lead" || role.id === ROLE_IDS.ADMIN;
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

// ─── HR: Shared ───────────────────────────────────────────────────────────────

/**
 * Direct reports only — org structure has multiple team leads per
 * department, and creators report to a TM employee rather than the TM
 * team lead directly, so this cannot be resolved by role or department.
 */
export function getMyDirectReports(user: User): User[] {
  return getUsers().filter((candidate) => candidate.supervisorId === user.id);
}

const ROSTER_EXCLUDED_ROLES = new Set<RoleId>([
  ROLE_IDS.ADMIN,
  ROLE_IDS.FINANCE,
]);

/**
 * The onboarding/deboarding roster: creators, employees, interns, and team
 * members — not leadership/ops roles, who aren't subject to these workflows.
 */
export function getRosterUsers(): User[] {
  return getUsers().filter((candidate) => !ROSTER_EXCLUDED_ROLES.has(candidate.roleId));
}

/**
 * The roster scoped to what `actor` is allowed to act on: HR tier sees
 * everyone, a team lead sees their own reports plus themselves (if they're
 * roster-eligible), everyone else sees just themselves.
 */
function getRosterUsersFor(actor: User): User[] {
  if (canViewAllHrRecords(actor)) return getRosterUsers();
  const reports = getMyDirectReports(actor);
  const own = ROSTER_EXCLUDED_ROLES.has(actor.roleId) ? [] : [actor];
  return [...own, ...reports];
}

// ─── HR: Onboarding ─────────────────────────────────────────────────────────

export function getOnboardingRecords(actor: User): OnboardingRecord[] {
  requireAuthenticatedUser(actor);
  const scopeIds = new Set(getRosterUsersFor(actor).map((u) => u.id));
  return api.getOnboardingRecords().filter((record) => scopeIds.has(record.userId));
}


export function acknowledgeOnboarding(actor: User, onboardingId: string): OnboardingRecord {
  requireAuthenticatedUser(actor);
  if (!canViewAllHrRecords(actor)) {
    throw new Error("Your role does not have permission to acknowledge onboarding submissions.");
  }

  const record = api.getOnboardingRecordById(onboardingId);
  if (!record) throw new Error("Onboarding record not found.");

  record.status = "acknowledged";
  record.acknowledgedById = actor.id;
  record.acknowledgedAt = formatDocumentDate();

  api.saveOnboardingRecord(record);
  recordActivity({
    userId:     actor.id,
    action:     "ONBOARDING_ACKNOWLEDGED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId },
  });

  return record;
}

export function completeOnboarding(actor: User, onboardingId: string): OnboardingRecord {
  requireOnboardingManagementPermission(actor);

  const record = api.getOnboardingRecordById(onboardingId);
  if (!record) throw new Error("Onboarding record not found.");
  if (record.status !== "acknowledged") throw new Error("Only acknowledged onboarding records can be completed.");

  record.status        = "completed";
  record.completedById = actor.id;
  record.completedAt   = formatDocumentDate();

  api.saveOnboardingRecord(record);
  recordActivity({
    userId:     actor.id,
    action:     "ONBOARDING_COMPLETED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId },
  });

  notifyUsers({
    title:            "Onboarding completed",
    body:             "Your onboarding record has been marked complete.",
    notificationType: "user",
    audience:         "user",
    userIds:          [record.userId],
    actorId:          actor.id,
    entityType:       "onboarding",
    entityId:         record.id,
  });

  return record;
}

/** Sends a submitted onboarding record back to the employee for revision. */
export function rejectOnboarding(actor: User, onboardingId: string, reason: string): OnboardingRecord {
  requireOnboardingManagementPermission(actor);
  if (!reason.trim()) throw new Error("A rejection reason is required.");

  const record = api.getOnboardingRecordById(onboardingId);
  if (!record) throw new Error("Onboarding record not found.");
  if (record.status !== "submitted") throw new Error("Only submitted onboarding records can be sent back.");

  record.status          = "pending";
  record.rejectedById     = actor.id;
  record.rejectedAt       = formatDocumentDate();
  record.rejectionReason  = reason.trim();

  api.saveOnboardingRecord(record);
  recordActivity({
    userId:     actor.id,
    action:     "ONBOARDING_REJECTED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId, reason: reason.trim() },
  });

  notifyUsers({
    title:            "Onboarding submission needs revision",
    body:             `Your onboarding submission was sent back for revision. Reason: ${reason.trim()}`,
    notificationType: "user",
    audience:         "user",
    userIds:          [record.userId],
    actorId:          actor.id,
    entityType:       "onboarding",
    entityId:         record.id,
  });

  return record;
}

// ─── HR: Attendance ─────────────────────────────────────────────────────────

// Local getters only — never .toISOString() here. Converting a locally-
// constructed date to UTC shifts the calendar day in positive-UTC-offset
// timezones (e.g. midnight IST becomes the previous day in UTC).
function toIsoDateLocal(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDates(fromIso: string, toIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  while (cursor <= end) {
    dates.push(toIsoDateLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export interface AttendanceSummary {
  totalWorkingDays:      number;
  present:               number;
  wfh:                   number;
  leave:                 number;
  holidayCount:          number;
  attendancePercentage:  number;
  currentStreak:         number;
  longestStreak:         number;
}

/**
 * Rolls up attendance records + the holiday calendar into the Employee
 * Profile's summary cards. Pure function — operates on already-fetched data,
 * no permission check of its own. Sundays always count as holidays even
 * when not present in the Holiday table.
 */
export function computeAttendanceSummary(
  records: AttendanceRecord[],
  holidays: Holiday[],
  from: string,
  to: string,
): AttendanceSummary {
  const dayByDate = new Map<string, AttendanceDayStatus>();
  for (const record of records) {
    for (const [day, status] of Object.entries(record.days)) {
      dayByDate.set(`${record.month}-${day.padStart(2, "0")}`, status);
    }
  }
  const holidaySet = new Set(holidays.map((h) => h.date));
  const isHolidayDate = (iso: string, dayOfWeek: number) => dayOfWeek === 0 || holidaySet.has(iso);

  const dates = enumerateDates(from, to);

  let present = 0, wfh = 0, leave = 0, holidayCount = 0, totalWorkingDays = 0;
  for (const iso of dates) {
    const dayOfWeek = new Date(`${iso}T00:00:00`).getDay();
    if (isHolidayDate(iso, dayOfWeek)) {
      holidayCount += 1;
      continue;
    }
    totalWorkingDays += 1;
    const status = dayByDate.get(iso);
    if (status === "present" || status === "half_day") present += 1;
    else if (status === "wfh") wfh += 1;
    else if (status === "leave") leave += 1;
  }

  const attendancePercentage = totalWorkingDays > 0 ? Math.round(((present + wfh) / totalWorkingDays) * 100) : 0;

  // Streaks: consecutive present/wfh working days. Holidays/weekends are
  // skipped (they neither extend nor break a streak); anything else does.
  let longestStreak = 0;
  let runningStreak = 0;
  for (const iso of dates) {
    const dayOfWeek = new Date(`${iso}T00:00:00`).getDay();
    if (isHolidayDate(iso, dayOfWeek)) continue;
    const status = dayByDate.get(iso);
    if (status === "present" || status === "wfh" || status === "half_day") {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  let currentStreak = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const iso = dates[i];
    const dayOfWeek = new Date(`${iso}T00:00:00`).getDay();
    if (isHolidayDate(iso, dayOfWeek)) continue;
    const status = dayByDate.get(iso);
    if (status === "present" || status === "wfh" || status === "half_day") currentStreak += 1;
    else break;
  }

  return { totalWorkingDays, present, wfh, leave, holidayCount, attendancePercentage, currentStreak, longestStreak };
}

// ─── HR: People Management ───────────────────────────────────────────────────

/**
 * Edits a roster member's department, supervisor, or status. Narrower than
 * general user management (createUser/canManageUsers) — this is the
 * workforce-tier "people" capability, not platform-owner user CRUD.
 */
export function updateRosterMemberDetails(
  actor: User,
  userId: string,
  updates: { departmentId?: DeptId; supervisorId?: string; status?: User["status"] },
): User {
  requireManagePeoplePermission(actor);

  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");

  const supervisorChanged = updates.supervisorId !== undefined && updates.supervisorId !== user.supervisorId;

  const updated: User = {
    ...user,
    departmentId: updates.departmentId ?? user.departmentId,
    supervisorId: updates.supervisorId ?? user.supervisorId,
    status:       updates.status ?? user.status,
  };

  api.saveUser(updated);

  if (supervisorChanged) {
    api.saveManagerHistoryEntry({
      id:            generateManagerHistoryId(),
      userId,
      supervisorId:  updated.supervisorId,
      changedById:   actor.id,
      // ISO, not formatDocumentDate() — effectiveFrom is sorted/compared as a plain date string.
      effectiveFrom: new Date().toISOString().slice(0, 10),
      createdAt:     formatDocumentDate(),
    });
  }

  recordActivity({
    userId:     actor.id,
    action:     "USER_MANAGED",
    targetType: "user",
    targetId:   userId,
    metadata:   { departmentId: updated.departmentId ?? "", status: updated.status },
  });

  return updated;
}

// ─── HR: Probation ──────────────────────────────────────────────────────────
// The submit-recommendation/decide workflow, and every read the Employee
// Profile panel needs, now run against the real workforce.hr_probation table
// (see src/app/api/workforce/probation/*, src/services/workforceProbation.ts,
// src/app/api/workforce/employees/[id]/profile/route.ts).

/** Whole days between today and an ISO date (negative if the date has passed). */
export function daysUntil(iso: string, today: string = new Date().toISOString().slice(0, 10)): number {
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const targetMs = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((targetMs - todayMs) / 86_400_000);
}

// ─── HR: Deboarding ─────────────────────────────────────────────────────────

export function getDeboardingRecords(actor: User): DeboardingRecord[] {
  requireAuthenticatedUser(actor);
  if (canViewAllHrRecords(actor) || canApproveCreatorDeboarding(actor)) return api.getDeboardingRecords();
  const reportIds = new Set(getMyDirectReports(actor).map((u) => u.id));
  return api.getDeboardingRecords().filter((r) => reportIds.has(r.userId));
}

export function submitCreatorDeboarding(actor: User, creatorId: string, reason?: string): DeboardingRecord {
  requireAuthenticatedUser(actor);
  if (!canSubmitCreatorDeboarding(actor)) throw new Error("Only Creator Acquisition can request creator deboarding.");

  const creator = getUserById(creatorId);
  if (!creator) throw new Error("Creator not found.");
  if (creator.userType !== "creator") throw new Error("This person is not a content creator.");
  if (!canViewAllHrRecords(actor) && creator.supervisorId !== actor.id) {
    throw new Error("You can only request deboarding for creators you directly manage.");
  }

  const existing = api.getDeboardingRecords().find(
    (r) => r.userId === creatorId && r.status !== "offboarded",
  );
  if (existing) throw new Error("This creator already has an active deboarding request.");

  const now = formatDocumentDate();
  const record: DeboardingRecord = {
    id:            generateDeboardingId(),
    userId:        creatorId,
    initiatedById: actor.id,
    track:         "creator",
    status:        "pending_lead_approval",
    reason,
    initiatedAt:   now,
    checklist:     {},
    createdAt:     now,
  };

  api.saveDeboardingRecord(record);

  notifyUsers({
    title:            "Creator deboarding requested",
    body:             `${creator.name} has been flagged for deboarding by ${actor.name}. Your approval is required.`,
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.TEAM_LEAD],
    actorId:          actor.id,
    entityType:       "deboarding",
    entityId:         record.id,
  });

  recordActivity({
    userId:     actor.id,
    action:     "DEBOARDING_FLAGGED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: creatorId, track: "creator" },
  });

  return record;
}

export function approveCreatorDeboarding(actor: User, deboardingId: string): DeboardingRecord {
  requireAuthenticatedUser(actor);
  if (!canApproveCreatorDeboarding(actor)) throw new Error("Only TM Team Lead or Senior TM can approve creator deboarding.");

  const record = api.getDeboardingRecordById(deboardingId);
  if (!record) throw new Error("Deboarding record not found.");
  if (record.track !== "creator") throw new Error("This is not a creator deboarding record.");
  if (record.status !== "pending_lead_approval") throw new Error("This record is not awaiting lead approval.");

  record.status      = "data_recovery_pending";
  record.approvedById = actor.id;
  record.approvedAt   = formatDocumentDate();

  api.saveDeboardingRecord(record);
  recordActivity({
    userId:     actor.id,
    action:     "DEBOARDING_APPROVED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId },
  });

  return record;
}

export function completeCreatorDeboarding(
  actor:        User,
  deboardingId: string,
  checklist:    Record<string, boolean>,
): DeboardingRecord {
  requireAuthenticatedUser(actor);
  if (!canApproveCreatorDeboarding(actor)) throw new Error("Only TM Team Lead or Senior TM can complete creator deboarding.");

  const record = api.getDeboardingRecordById(deboardingId);
  if (!record) throw new Error("Deboarding record not found.");
  if (record.track !== "creator") throw new Error("This is not a creator deboarding record.");
  if (record.status !== "data_recovery_pending") throw new Error("This record is not ready for completion.");

  const subject = getUserById(record.userId);
  if (subject) api.saveUser({ ...subject, status: "disabled" });

  const now = formatDocumentDate();
  record.status        = "offboarded";
  record.checklist     = checklist;
  record.completedById = actor.id;
  record.completedAt   = now;
  api.saveDeboardingRecord(record);

  // Notify HR of completion.
  notifyUsers({
    title:            "Creator offboarded",
    body:             `${subject?.name ?? "A creator"} has been offboarded. Data recovery is complete.`,
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.ADMIN],
    actorId:          actor.id,
    entityType:       "deboarding",
    entityId:         record.id,
  });

  // Notify the CA who originally submitted the request.
  if (record.initiatedById && record.initiatedById !== actor.id) {
    notifyUsers({
      title:            "Deboarding complete",
      body:             `${subject?.name ?? "The creator"} has been offboarded. The deboarding checklist is complete.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [record.initiatedById],
      actorId:          actor.id,
      entityType:       "deboarding",
      entityId:         record.id,
    });
  }

  recordActivity({
    userId:     actor.id,
    action:     "DEBOARDING_COMPLETED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId },
  });

  return record;
}

export function submitEmployeeDeboarding(actor: User, employeeId: string, reason?: string): DeboardingRecord {
  requireAuthenticatedUser(actor);
  if (!canInitiateEmployeeDeboarding(actor)) throw new Error("Only HR can initiate employee deboarding.");

  const employee = getUserById(employeeId);
  if (!employee) throw new Error("Employee not found.");
  if (employee.userType === "creator") throw new Error("Use creator deboarding for content creators.");

  const existing = api.getDeboardingRecords().find(
    (r) => r.userId === employeeId && r.status !== "offboarded",
  );
  if (existing) throw new Error("This employee already has an active deboarding record.");

  const now = formatDocumentDate();
  const record: DeboardingRecord = {
    id:            generateDeboardingId(),
    userId:        employeeId,
    initiatedById: actor.id,
    track:         "employee",
    status:        "pending_founder_approval",
    reason,
    initiatedAt:   now,
    checklist:     {},
    createdAt:     now,
  };

  api.saveDeboardingRecord(record);

  notifyUsers({
    title:            "Employee deboarding approval needed",
    body:             `${employee.name} has been submitted for employee-track deboarding and needs approval.`,
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.ADMIN],
    actorId:          actor.id,
    entityType:       "deboarding",
    entityId:         record.id,
  });

  // Notify the employee's manager/TL that deboarding has been initiated.
  if (employee.supervisorId) {
    notifyUsers({
      title:            "Employee deboarding initiated",
      body:             `${employee.name} has been marked for deboarding by HR. You will be notified when the process is complete.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [employee.supervisorId],
      actorId:          actor.id,
      entityType:       "deboarding",
      entityId:         record.id,
    });
  }

  recordActivity({
    userId:     actor.id,
    action:     "DEBOARDING_FLAGGED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: employeeId, track: "employee" },
  });

  return record;
}

export function approveEmployeeDeboarding(actor: User, deboardingId: string): DeboardingRecord {
  requireDeboardingEmployeeApprovalPermission(actor);

  const record = api.getDeboardingRecordById(deboardingId);
  if (!record) throw new Error("Deboarding record not found.");
  if (record.track !== "employee") throw new Error("This is not an employee deboarding record.");
  if (record.status !== "pending_founder_approval") throw new Error("This record is not awaiting founder approval.");

  const now = formatDocumentDate();
  record.status              = "data_recovery_pending";
  record.founderApprovedById = actor.id;
  record.founderApprovedAt   = now;
  api.saveDeboardingRecord(record);

  notifyUsers({
    title:            "Employee deboarding approved",
    body:             "Employee-track deboarding is approved. HR can complete the access and data checklist.",
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.ADMIN],
    actorId:          actor.id,
    entityType:       "deboarding",
    entityId:         record.id,
  });

  recordActivity({
    userId:     actor.id,
    action:     "DEBOARDING_FOUNDER_APPROVED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId, track: "employee" },
  });

  return record;
}

export function completeEmployeeDeboarding(
  actor:        User,
  deboardingId: string,
  checklist:    Record<string, boolean>,
): DeboardingRecord {
  requireAuthenticatedUser(actor);
  if (!canInitiateEmployeeDeboarding(actor)) throw new Error("Only HR can complete employee deboarding.");

  const record = api.getDeboardingRecordById(deboardingId);
  if (!record) throw new Error("Deboarding record not found.");
  if (record.track !== "employee") throw new Error("This is not an employee deboarding record.");
  if (record.status !== "data_recovery_pending") throw new Error("This record is not ready for completion.");

  const subject = getUserById(record.userId);
  if (subject) api.saveUser({ ...subject, status: "disabled" });

  const now = formatDocumentDate();
  record.status        = "offboarded";
  record.checklist     = checklist;
  record.completedById = actor.id;
  record.completedAt   = now;
  api.saveDeboardingRecord(record);

  if (subject?.supervisorId) {
    notifyUsers({
      title:            "Employee offboarded",
      body:             `${subject.name} has been offboarded by HR. Data recovery and access removal are complete.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [subject.supervisorId],
      actorId:          actor.id,
      entityType:       "deboarding",
      entityId:         record.id,
    });
  }

  recordActivity({
    userId:     actor.id,
    action:     "DEBOARDING_COMPLETED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId },
  });

  return record;
}

// ─── HR: Notifications ──────────────────────────────────────────────────────

function resolveNotificationRecipients(input: {
  audience:       Notification["audience"];
  departmentIds?: DeptId[];
  roleIds?:       RoleId[];
  userIds?:       string[];
}): string[] {
  switch (input.audience) {
    case "all":
      return getUsers().map((u) => u.id);
    case "department":
      return getUsers()
        .filter((u) => u.departmentId && input.departmentIds?.includes(u.departmentId))
        .map((u) => u.id);
    case "role":
      return getUsers().filter((u) => input.roleIds?.includes(u.roleId)).map((u) => u.id);
    case "user":
      return input.userIds ?? [];
    default:
      return [];
  }
}

function notifyUsers(input: {
  title:             string;
  body:              string;
  notificationType:  Notification["notificationType"];
  audience:          Notification["audience"];
  departmentIds?:    DeptId[];
  roleIds?:          RoleId[];
  userIds?:          string[];
  actorId?:          string;
  entityType?:       Notification["entityType"];
  entityId?:         string;
  metadata?:         Record<string, string>;
  expiresAt?:        string;
}): Notification {
  const notification: Notification = {
    id:               generateNotificationId(),
    title:            input.title,
    body:             input.body,
    notificationType: input.notificationType,
    audience:         input.audience,
    departmentIds:    input.departmentIds,
    roleIds:          input.roleIds,
    userIds:          input.userIds,
    actorId:          input.actorId,
    entityType:       input.entityType,
    entityId:         input.entityId,
    metadata:         input.metadata,
    createdAt:        formatDocumentDate(),
    expiresAt:        input.expiresAt,
    unreadBy:         resolveNotificationRecipients(input),
  };

  return api.saveNotification(notification);
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



// ─── Document Mutations ───────────────────────────────────────────────────────

export async function createDocumentUploadFromFile(
  file: File,
  options: {
    title:            string;
    description?:     string;
    departmentId:     DeptId;
    authorId:         string;
    tag:              DocTag;
    /** Real global.roles.id UUIDs, from listAssignableRoles(). */
    allowedRoleIds:   RoleId[];
    visibilityScope?: VisibilityScope;
  },
): Promise<Document> {
  // Non-authoritative — fast client-side feedback only. The backend
  // re-resolves the caller's real identity/capability server-side and is
  // the actual gate; it never trusts these client-supplied checks.
  const author = getUserById(options.authorId);
  requireAuthenticatedUser(author);
  requireUploadPermission(author);

  const document = await uploadDocumentFile(file, {
    title:           options.title.trim() || file.name.replace(/\.[^/.]+$/, ""),
    description:     options.description?.trim() ?? "",
    departmentId:    options.departmentId,
    tag:             options.tag,
    allowedRoleIds:  options.allowedRoleIds,
    visibilityScope: options.visibilityScope,
  });

  api.applyDocumentFromServer(document);
  return document;
}

/**
 * Uploads a replacement file as a new version of an existing document —
 * same documentId, same metadata (title/tag/permissions untouched), new
 * Drive file. The prior version's row is never mutated; only the document's
 * current-version pointer advances.
 */
export async function replaceDocumentFile(user: User, documentId: string, file: File): Promise<Document> {
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  const document = await uploadDocumentNewVersion(documentId, file);
  api.applyDocumentFromServer(document);

  recordActivity({
    userId:     user.id,
    action:     "DOCUMENT_EDITED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { title: document.title, fileName: file.name },
  });

  return document;
}

export async function updateDocumentMetadata(
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
    >
  >,
): Promise<Document> {
  requireAuthenticatedUser(user);
  requireEditingPermission(user);

  const document = await updateDocument(documentId, updates);
  api.applyDocumentFromServer(document);

  recordActivity({
    userId:     user.id,
    action:     "DOCUMENT_UPDATED",
    targetType: "document",
    targetId:   document.id,
    metadata:   { title: document.title },
  });

  return document;
}



