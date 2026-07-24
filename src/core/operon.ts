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
  VisibilityScope,
  BroadcastAudience,
  ResourceItem,
  ResourceCategory,
  ActivityEvent,
  UserType,
  DriveParsedDocument,
  Notification,
  OnboardingRecord,
  LeaveRequest,
  LeaveRequestType,
  AttendanceDayStatus,
  AttendanceRecord,
  Holiday,
  HolidayType,
  ProbationRecord,
  DeboardingRecord,
  DeboardingTrack,
  ManagerHistoryEntry,
} from "@/core/types";

import { PROBATION_ACTIVE_STATUSES } from "@/core/types";

import {
  EMPTY_ROLE_PERMISSIONS,
  getRoleEffectivePermissions as computeRoleEffectivePermissions,
  getRolePermissionIds as computeRolePermissionIds,
  userMatchesAccessRestrictions,
  deriveAvatar,
  normalizeTocItems,
  formatDocumentDate,
  deriveQuickActions,
  generateActivityId,
  generateUserId,
  generateResourceId,
  generateLeaveRequestId,
  generateAttendanceId,
  generateHolidayId,
  generateProbationId,
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
  requireHrCalendarManagementPermission,
  requireProbationSubmissionPermission,
  requireProbationDecisionPermission,
  requireManagePeoplePermission,
  requireOnboardingManagementPermission,
  requireDeboardingEmployeeApprovalPermission,
} from "@/security/accessControl";
import {
  canViewAllHrRecords,
  canApproveLeaveAsTl,
  canApproveLeaveAsHr,
  canApproveLeaveAsFounder,
  canSubmitCreatorDeboarding,
  canApproveCreatorDeboarding,
  canInitiateEmployeeDeboarding,
  canViewTeamLeaveHistory,
  canManagePeople,
} from "@/security/permissions";
import { FOUNDER_TIER_ROLES } from "@/security/rolePolicies";
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

/**
 * Everything that happened *to* one employee — hires, roster edits, date-
 * joined corrections, probation decisions, attendance overrides — for the
 * Employee Profile's Activity Timeline. Distinct from getActivityFeed, which
 * scopes by the *viewer's own* actions rather than a target employee.
 */
export function getActivityForEmployee(actor: User, employeeId: string): ActivityEvent[] {
  requireAuthenticatedUser(actor);
  const scopeIds = new Set(getAttendanceScopeUsers(actor).map((u) => u.id));
  if (!scopeIds.has(employeeId)) {
    throw new Error("You do not have permission to view this person's activity.");
  }

  return api.getActivityEvents()
    .filter((event) => (event.targetType === "user" && event.targetId === employeeId) || event.metadata?.userId === employeeId)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
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

function canCreateUser(user: User, roleId: RoleId): boolean {
  if (isAdmin(user)) return true;
  if (!canManageRoles(user) && !canManagePeople(user)) return false;
  return getCreatableRoles(user).some((role) => role.id === roleId);
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

export function createUser(input: {
  creator:              User;
  name:                 string;
  email:                string;
  roleId:               RoleId;
  departmentId:         DeptId;
  teamId?:              string;
  supervisorId?:        string;
  assignedDocumentIds?: string[];
  status:               User["status"];
  dateJoined:           string;
  probationRequired?:   boolean;
  probationDuration?:   number;
  probationDurationUnit?: "days" | "months";
}): User | null {
  const { creator, name, email, roleId, departmentId, teamId, supervisorId, assignedDocumentIds, status, dateJoined } = input;

  if (!name.trim() || !email.trim() || !departmentId || !roleId || !dateJoined) return null;
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
    teamId,
    supervisorId,
    permissionIds: computeRolePermissionIds(getRoleEffectivePermissions(role)),
    createdById:   creator.id,
    status,
    dateJoined,
  };

  api.saveUser(user);

  api.saveManagerHistoryEntry({
    id:            generateManagerHistoryId(),
    userId:        user.id,
    supervisorId,
    changedById:   creator.id,
    effectiveFrom: dateJoined,
    createdAt:     formatDocumentDate(),
  });

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

  if (input.probationRequired) {
    const durationUnit = input.probationDurationUnit ?? "days";
    const durationDays = normalizeProbationDurationDays(input.probationDuration ?? DEFAULT_PROBATION_DAYS, durationUnit);
    const probationRecord = buildProbationRecord({ actor: creator, userId: user.id, dateJoined, durationDays, durationUnit });
    api.saveProbationRecord(probationRecord);
  }

  recordActivity({
    userId:     creator.id,
    action:     "USER_MANAGED",
    targetType: "user",
    targetId:   user.id,
    metadata:   { role: role.name, status },
  });

  notifyUsers({
    title:            "New employee added",
    body:             `${user.name} has joined as ${role.name}.`,
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.ADMIN],
    actorId:          creator.id,
    entityType:       "user",
    entityId:         user.id,
  });

  if (supervisorId) {
    notifyUsers({
      title:            "New team member added",
      body:             `${user.name} now reports to you.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [supervisorId],
      actorId:          creator.id,
      entityType:       "user",
      entityId:         user.id,
    });
  }

  return user;
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

// ─── HR: Leave & WFH ────────────────────────────────────────────────────────

export function getMyLeaveRequests(user: User): LeaveRequest[] {
  return api.getLeaveRequests().filter((request) => request.userId === user.id);
}

// Post role-collapse there's no longer a per-associate-role fallback table —
// TM Associate, IM Associate, Finance Associate, etc. were distinct roles
// before and routed to distinct team leads; they're all just "employee" now,
// so a role-keyed fallback can no longer distinguish between them. Department
// is the only remaining signal for who a person without a recorded supervisor
// escalates to.
const DEPARTMENT_MANAGER_FALLBACKS: Record<string, RoleId> = {
  tm:      ROLE_IDS.TEAM_LEAD,
  im:      ROLE_IDS.TEAM_LEAD,
  sales:   ROLE_IDS.TEAM_LEAD,
  finance: ROLE_IDS.FINANCE,
  hr:      ROLE_IDS.ADMIN,
};

function findUserByRole(roleId: RoleId): User | undefined {
  return getUsers().find((candidate) => candidate.roleId === roleId);
}

function getFirstLeaveApprover(subject: User): User | undefined {
  if (subject.supervisorId) {
    const supervisor = getUserById(subject.supervisorId);
    if (supervisor) return supervisor;
  }

  const departmentFallbackRole = subject.departmentId ? DEPARTMENT_MANAGER_FALLBACKS[subject.departmentId] : undefined;
  return departmentFallbackRole ? findUserByRole(departmentFallbackRole) : undefined;
}

/**
 * Previously distinguished HR (submits, needs Founder sign-off on their own
 * leave) from Cofounder (final approver) — both collapsed into "admin", so
 * that distinction can no longer be made. An admin's own leave request has
 * no one above it to escalate to.
 */
function requiresFounderFinalApproval(_subject: User): boolean {
  return false;
}

function isFounderSelfRequest(user: User): boolean {
  return FOUNDER_TIER_ROLES.has(user.roleId);
}

function leaveTypeLabel(request: LeaveRequest): string {
  return request.requestType === "wfh" ? "WFH" : "leave";
}

function leaveDateRange(request: LeaveRequest): string {
  return `${request.dateFrom} - ${request.dateTo}`;
}

function syncApprovedLeaveToAttendance(actor: User, request: LeaveRequest): void {
  const dayStatus: AttendanceDayStatus = request.requestType === "wfh" ? "wfh" : "leave";
  const holidaySet = new Set(api.getHolidays().map((h) => h.date));
  for (const isoDate of enumerateDates(request.dateFrom, request.dateTo)) {
    const d = new Date(`${isoDate}T00:00:00`);
    if (d.getDay() === 0 || holidaySet.has(isoDate)) continue;
    setAttendanceDay(actor, request.userId, isoDate, dayStatus);
  }
}

export function canApproveLeaveRequestAsTl(actor: User, request: LeaveRequest): boolean {
  const subject = getUserById(request.userId);
  if (!subject || request.status !== "pending") return false;
  return getFirstLeaveApprover(subject)?.id === actor.id && canApproveLeaveAsTl(actor);
}

export function canApproveLeaveRequestAsHr(actor: User, request: LeaveRequest): boolean {
  const subject = getUserById(request.userId);
  if (!subject || !canApproveLeaveAsHr(actor)) return false;
  if (request.status === "tl_approved") return !requiresFounderFinalApproval(subject);
  // No team lead/manager could be resolved for this person (no supervisor
  // on file and no department fallback) — there is no one to perform the
  // TL step, so HR is the only approver and acts directly on "pending".
  if (request.status === "pending" && !getFirstLeaveApprover(subject)) {
    return !requiresFounderFinalApproval(subject);
  }
  return false;
}

export function canApproveLeaveRequestAsFounder(actor: User, request: LeaveRequest): boolean {
  const subject = getUserById(request.userId);
  if (!subject || !canApproveLeaveAsFounder(actor)) return false;
  if (request.status === "cofounder_pending") return true;
  return request.status === "pending" && getFirstLeaveApprover(subject)?.id === actor.id;
}


/**
 * Full leave/WFH history (any status, not just pending) for a TL's direct
 * reports.
 */
export function getTeamLeaveHistoryForTl(actor: User): LeaveRequest[] {
  requireAuthenticatedUser(actor);
  if (!canViewTeamLeaveHistory(actor)) {
    throw new Error("Your role does not have permission to view your team's leave history.");
  }
  const reportIds = new Set(getMyDirectReports(actor).map((u) => u.id));
  return api.getLeaveRequests().filter((request) => reportIds.has(request.userId));
}

export function getLeaveRequestsForHr(actor: User): LeaveRequest[] {
  requireAuthenticatedUser(actor);
  if (!canViewAllHrRecords(actor) && !canApproveLeaveAsHr(actor)) {
    throw new Error("Your role does not have permission to view all leave requests.");
  }
  return api.getLeaveRequests();
}

export function submitLeaveRequest(
  user: User,
  input: {
    requestType:     LeaveRequestType;
    dateFrom:        string;
    dateTo:          string;
    reason:          string;
    additionalInfo?: string;
  }
): LeaveRequest {
  requireAuthenticatedUser(user);

  // Overlap detection: block if dates clash with an active request.
  const ACTIVE_STATUSES = new Set<string>(["pending", "tl_approved", "cofounder_pending", "hr_approved"]);
  const newFrom = new Date(`${input.dateFrom}T00:00:00`);
  const newTo   = new Date(`${input.dateTo}T00:00:00`);
  const clash = api.getLeaveRequests().find((r) => {
    if (r.userId !== user.id) return false;
    if (!ACTIVE_STATUSES.has(r.status)) return false;
    const rFrom = new Date(`${r.dateFrom}T00:00:00`);
    const rTo   = new Date(`${r.dateTo}T00:00:00`);
    return newFrom <= rTo && newTo >= rFrom;
  });
  if (clash) {
    throw new Error(`You already have an active ${clash.requestType.replace(/_/g, " ")} request overlapping those dates (${clash.dateFrom} – ${clash.dateTo}).`);
  }

  const now = formatDocumentDate();
  const request: LeaveRequest = {
    id:              generateLeaveRequestId(),
    userId:          user.id,
    requestType:     input.requestType,
    dateFrom:        input.dateFrom,
    dateTo:          input.dateTo,
    reason:          input.reason,
    additionalInfo:  input.additionalInfo,
    status:          "pending",
    founderNotified: false,
    createdAt:       now,
    updatedAt:       now,
  };

  if (isFounderSelfRequest(user)) {
    request.status = "hr_approved";
    request.hrApprovedById = user.id;
    request.hrApprovedAt = now;
  }

  api.saveLeaveRequest(request);
  if (request.status === "hr_approved") {
    syncApprovedLeaveToAttendance(user, request);
  }
  recordActivity({
    userId:     user.id,
    action:     "LEAVE_SUBMITTED",
    targetType: "hr_record",
    targetId:   request.id,
    metadata:   { requestType: request.requestType },
  });

  const typeLabel = leaveTypeLabel(request);
  const dateRange = leaveDateRange(request);

  if (request.status === "hr_approved") {
    notifyUsers({
      title:            "Leave request auto approved",
      body:             `Your ${typeLabel} from ${dateRange} has been auto approved and added to the calendar.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [user.id],
      actorId:          user.id,
      entityType:       "leave",
      entityId:         request.id,
    });
    notifyUsers({
      title:            "Co-Founder leave approved",
      body:             `${user.name}'s ${typeLabel} from ${dateRange} was auto approved.`,
      notificationType: "user",
      audience:         "role",
      roleIds:          [ROLE_IDS.ADMIN],
      actorId:          user.id,
      entityType:       "leave",
      entityId:         request.id,
    });
    return request;
  }

  // Notify the employee's direct approver.
  const subject = getUserById(user.id);
  const firstApprover = subject ? getFirstLeaveApprover(subject) : undefined;
  if (firstApprover) {
    notifyUsers({
      title:            "Leave request pending approval",
      body:             `${user.name} has submitted a ${typeLabel} request from ${dateRange}.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [firstApprover.id],
      actorId:          user.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  }

  // Confirm receipt to the employee.
  notifyUsers({
    title:            "Leave request submitted",
    body:             `Your ${typeLabel} from ${dateRange} has been submitted and is pending approval.`,
    notificationType: "user",
    audience:         "user",
    userIds:          [user.id],
    actorId:          user.id,
    entityType:       "leave",
    entityId:         request.id,
  });

  return request;
}


export function approveLeaveAsTl(actor: User, requestId: string): LeaveRequest {
  const request = api.getLeaveRequestById(requestId);
  if (!request) throw new Error("Leave request not found.");

  const subject = getUserById(request.userId);
  if (!subject) throw new Error("Requesting user not found.");

  if (!canApproveLeaveRequestAsTl(actor, request)) {
    throw new Error("You do not have permission to approve this request at its current stage.");
  }
  if (request.status !== "pending") throw new Error("This request is not awaiting team-lead approval.");

  const now = formatDocumentDate();
  request.tlApprovedById = actor.id;
  request.tlApprovedAt   = now;
  request.updatedAt      = now;

  const typeLabel = leaveTypeLabel(request);
  const dateRange = leaveDateRange(request);

  if (FOUNDER_TIER_ROLES.has(actor.roleId)) {
    // Founder acting as direct manager for HR/Finance direct reports —
    // they are the final approver, skip the HR step.
    syncApprovedLeaveToAttendance(actor, request);
    request.status         = "hr_approved";
    request.hrApprovedById = actor.id;
    request.hrApprovedAt   = now;
    api.saveLeaveRequest(request);
    notifyUsers({
      title:            "Leave request approved",
      body:             `Your ${typeLabel} from ${dateRange} has been approved.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [request.userId],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  } else if (requiresFounderFinalApproval(subject)) {
    request.status = "cofounder_pending";
    api.saveLeaveRequest(request);
    notifyUsers({
      title:            "Leave request awaiting Co-Founder approval",
      body:             `${subject.name}'s ${typeLabel} (${dateRange}) was approved by HR and needs Co-Founder sign-off.`,
      notificationType: "user",
      audience:         "role",
      roleIds:          [ROLE_IDS.ADMIN],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
    notifyUsers({
      title:            "Leave approved by HR",
      body:             `Your ${typeLabel} (${dateRange}) was approved by HR and is awaiting Co-Founder approval.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [request.userId],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  } else {
    request.status = "tl_approved";
    api.saveLeaveRequest(request);
    // Notify HR that a request is ready for their approval.
    notifyUsers({
      title:            "Leave request awaiting HR approval",
      body:             `${subject.name}'s ${typeLabel} (${dateRange}) was approved by the team lead and needs HR sign-off.`,
      notificationType: "user",
      audience:         "role",
      roleIds:          [ROLE_IDS.ADMIN],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
    // Notify the employee their TL approved and it's now with HR.
    notifyUsers({
      title:            "Leave approved by team lead",
      body:             `Your ${typeLabel} (${dateRange}) was approved by your team lead and is awaiting HR.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [request.userId],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  }

  recordActivity({
    userId:     actor.id,
    action:     "LEAVE_TL_APPROVED",
    targetType: "hr_record",
    targetId:   request.id,
    metadata:   { userId: request.userId },
  });

  return request;
}

export function approveLeaveAsHr(actor: User, requestId: string): LeaveRequest {
  const request = api.getLeaveRequestById(requestId);
  if (!request) throw new Error("Leave request not found.");
  if (!canApproveLeaveRequestAsHr(actor, request)) {
    throw new Error("You do not have permission to approve this request at its current stage.");
  }

  const now = formatDocumentDate();
  request.status         = "hr_approved";
  request.hrApprovedById = actor.id;
  request.hrApprovedAt   = now;
  request.updatedAt      = now;

  // Auto-sync approved dates into the attendance grid — skip Sundays and HR holidays.
  syncApprovedLeaveToAttendance(actor, request);

  const hrSubject = getUserById(request.userId);
  const hrTypeLabel = leaveTypeLabel(request);
  const hrDateRange = leaveDateRange(request);

  // Notify the employee.
  notifyUsers({
    title:            "Leave request approved",
    body:             `Your ${hrTypeLabel} from ${hrDateRange} has been approved by HR.`,
    notificationType: "user",
    audience:         "user",
    userIds:          [request.userId],
    actorId:          actor.id,
    entityType:       "leave",
    entityId:         request.id,
  });

  // Notify the direct team lead so they know the final decision.
  if (hrSubject?.supervisorId) {
    notifyUsers({
      title:            "Leave approved by HR",
      body:             `${hrSubject.name}'s ${hrTypeLabel} (${hrDateRange}) has been approved by HR.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [hrSubject.supervisorId],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  }

  api.saveLeaveRequest(request);
  recordActivity({
    userId:     actor.id,
    action:     "LEAVE_HR_APPROVED",
    targetType: "hr_record",
    targetId:   request.id,
    metadata:   { userId: request.userId },
  });

  return request;
}

export function approveLeaveAsFounder(actor: User, requestId: string): LeaveRequest {
  const request = api.getLeaveRequestById(requestId);
  if (!request) throw new Error("Leave request not found.");
  if (!canApproveLeaveRequestAsFounder(actor, request)) {
    throw new Error("You do not have permission to approve this request at its current stage.");
  }

  const now = formatDocumentDate();
  request.status = "hr_approved";
  request.hrApprovedById = actor.id;
  request.hrApprovedAt = now;
  request.updatedAt = now;
  request.founderNotified = true;

  syncApprovedLeaveToAttendance(actor, request);
  api.saveLeaveRequest(request);

  const subject = getUserById(request.userId);
  const typeLabel = leaveTypeLabel(request);
  const dateRange = leaveDateRange(request);

  notifyUsers({
    title:            "Leave request approved",
    body:             `Your ${typeLabel} from ${dateRange} has been approved by the Co-Founder.`,
    notificationType: "user",
    audience:         "user",
    userIds:          [request.userId],
    actorId:          actor.id,
    entityType:       "leave",
    entityId:         request.id,
  });

  const firstApprover = subject ? getFirstLeaveApprover(subject) : undefined;
  if (firstApprover && firstApprover.id !== actor.id) {
    notifyUsers({
      title:            "Leave approved by Co-Founder",
      body:             `${subject?.name ?? "An employee"}'s ${typeLabel} (${dateRange}) has been approved.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [firstApprover.id],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  }

  recordActivity({
    userId:     actor.id,
    action:     "LEAVE_HR_APPROVED",
    targetType: "hr_record",
    targetId:   request.id,
    metadata:   { userId: request.userId, approver: "cofounder" },
  });

  return request;
}

export function rejectLeave(actor: User, requestId: string, reason: string): LeaveRequest {
  if (!reason.trim()) throw new Error("A rejection reason is required.");

  const request = api.getLeaveRequestById(requestId);
  if (!request) throw new Error("Leave request not found.");

  const subject = getUserById(request.userId);
  if (!subject) throw new Error("Requesting user not found.");

  const actingAsTl = canApproveLeaveRequestAsTl(actor, request);
  const actingAsHr = request.status === "tl_approved" && canApproveLeaveAsHr(actor);
  const actingAsFounder = canApproveLeaveRequestAsFounder(actor, request);
  if (!actingAsTl && !actingAsHr && !actingAsFounder) {
    throw new Error("You do not have permission to reject this request at its current stage.");
  }

  const now = formatDocumentDate();
  request.status          = "rejected";
  request.rejectionReason = reason.trim();
  request.updatedAt       = now;

  api.saveLeaveRequest(request);
  recordActivity({
    userId:     actor.id,
    action:     "LEAVE_REJECTED",
    targetType: "hr_record",
    targetId:   request.id,
    metadata:   { userId: request.userId, reason },
  });

  const rejectTypeLabel = leaveTypeLabel(request);
  const rejectDateRange = leaveDateRange(request);

  // Notify the employee of the rejection and the reason (always).
  notifyUsers({
    title:            "Leave request rejected",
    body:             `Your ${rejectTypeLabel} (${rejectDateRange}) was rejected. Reason: ${reason.trim()}`,
    notificationType: "user",
    audience:         "user",
    userIds:          [request.userId],
    actorId:          actor.id,
    entityType:       "leave",
    entityId:         request.id,
  });

  // HR rejection: also notify the team lead. TL rejection: TL is the actor — no self-notification.
  if (actingAsHr && subject.supervisorId) {
    notifyUsers({
      title:            "Leave request rejected by HR",
      body:             `${subject.name}'s ${rejectTypeLabel} (${rejectDateRange}) was rejected by HR. Reason: ${reason.trim()}`,
      notificationType: "user",
      audience:         "user",
      userIds:          [subject.supervisorId],
      actorId:          actor.id,
      entityType:       "leave",
      entityId:         request.id,
    });
  }

  return request;
}

// recordLeaveOutcome removed — attendance is now synced automatically inside
// approveLeaveAsHr. The separate "Record" step was eliminated per P2 of the
// refactor brief. Any existing call sites should be removed.

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

/**
 * One shared tracker, not three separate views: a plain employee sees only
 * themselves, a team lead sees themselves plus direct reports, and HR tier
 * sees everyone. The calendar UI renders whatever this returns.
 */
function getAttendanceScopeUsers(actor: User): User[] {
  if (canViewAllHrRecords(actor)) {
    const users = getUsers();
    return users.some((user) => user.id === actor.id) ? users : [actor, ...users];
  }
  const reports = getMyDirectReports(actor);
  return [actor, ...reports];
}

export function getAttendanceForMonth(actor: User, month: string): AttendanceRecord[] {
  const scopeIds = new Set(getAttendanceScopeUsers(actor).map((u) => u.id));
  return api.getAttendanceRecords().filter((record) => record.month === month && scopeIds.has(record.userId));
}

/**
 * Marks a single day. Employees mark their own days; HR/Admin/Cofounder can
 * mark or override anyone's. `status: null` clears the day.
 */
export function setAttendanceDay(
  actor: User,
  targetUserId: string,
  date: string,
  status: AttendanceDayStatus | null
): AttendanceRecord {
  requireAuthenticatedUser(actor);
  if (actor.id !== targetUserId && !canViewAllHrRecords(actor)) {
    throw new Error("You do not have permission to edit this person's attendance.");
  }

  const month = date.slice(0, 7);
  const day   = String(Number(date.slice(8, 10)));
  const existing = api.getAttendanceRecords().find((record) => record.userId === targetUserId && record.month === month);
  const now = formatDocumentDate();

  const days = { ...(existing?.days ?? {}) };
  if (status === null) {
    delete days[day];
  } else {
    days[day] = status;
  }

  const record: AttendanceRecord = {
    id:        existing?.id ?? generateAttendanceId(),
    userId:    targetUserId,
    month,
    days,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  api.saveAttendanceRecord(record);
  return record;
}


/**
 * Attendance records for one employee spanning a date range (inclusive),
 * scoped by the same visibility rule as getAttendanceForMonth — self, direct
 * reports, or everyone for HR/Founder tier.
 */
export function getAttendanceHistoryForUser(actor: User, userId: string, from: string, to: string): AttendanceRecord[] {
  requireAuthenticatedUser(actor);
  const scopeIds = new Set(getAttendanceScopeUsers(actor).map((u) => u.id));
  if (!scopeIds.has(userId)) {
    throw new Error("You do not have permission to view this person's attendance.");
  }

  const months = new Set<string>();
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00`);
  const end    = new Date(`${to.slice(0, 7)}-01T00:00:00`);
  while (cursor <= end) {
    months.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return api.getAttendanceRecords().filter((record) => record.userId === userId && months.has(record.month));
}

/** Same visibility scope as getAttendanceHistoryForUser, for one employee's leave requests. */
export function getLeaveHistoryForUser(actor: User, userId: string): LeaveRequest[] {
  requireAuthenticatedUser(actor);
  const scopeIds = new Set(getAttendanceScopeUsers(actor).map((u) => u.id));
  if (!scopeIds.has(userId)) {
    throw new Error("You do not have permission to view this person's leave history.");
  }
  return api.getLeaveRequests().filter((request) => request.userId === userId);
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

// ─── HR: Holiday Calendar ───────────────────────────────────────────────────

export function getHolidays(): Holiday[] {
  return api.getHolidays();
}

export function saveHolidayEntry(
  actor: User,
  input: { id?: string; date: string; name: string; type: HolidayType }
): Holiday {
  requireHrCalendarManagementPermission(actor);

  const now = formatDocumentDate();
  const existing = input.id ? api.getHolidays().find((h) => h.id === input.id) : undefined;

  const holiday: Holiday = {
    id:          existing?.id ?? generateHolidayId(),
    date:        input.date,
    name:        input.name,
    type:        input.type,
    createdById: existing?.createdById ?? actor.id,
    createdAt:   existing?.createdAt ?? now,
    updatedAt:   now,
  };

  api.saveHoliday(holiday);
  return holiday;
}

export function deleteHolidayEntry(actor: User, holidayId: string): boolean {
  requireHrCalendarManagementPermission(actor);
  return api.deleteHoliday(holidayId);
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

/**
 * Edits an employee's join date. Narrower than updateRosterMemberDetails —
 * dateJoined drives probation math and attendance-history defaults, so only
 * HR/workforce-admin tier may change it, and every change is audited.
 */

export function getManagerHistoryForUser(userId: string): ManagerHistoryEntry[] {
  return api.getManagerHistory()
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

// ─── HR: Probation ──────────────────────────────────────────────────────────

export function getProbationRecordsForReview(actor: User): ProbationRecord[] {
  requireAuthenticatedUser(actor);
  if (!canViewAllHrRecords(actor)) {
    throw new Error("Your role does not have permission to view probation records.");
  }
  return api.getProbationRecords();
}

/** Whole days between today and an ISO date (negative if the date has passed). */
export function daysUntil(iso: string, today: string = new Date().toISOString().slice(0, 10)): number {
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const targetMs = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((targetMs - todayMs) / 86_400_000);
}

type ProbationReminderType = "30_days" | "7_days" | "on_date" | "overdue";

function probationReminderBucket(daysUntilReview: number): ProbationReminderType | null {
  if (daysUntilReview < 0) return "overdue";
  if (daysUntilReview === 0) return "on_date";
  if (daysUntilReview <= 7) return "7_days";
  if (daysUntilReview <= 30) return "30_days";
  return null;
}

/**
 * Notifies HR + Co-Founder as a probation review date approaches (30/7 days
 * out, on the date, and once overdue). notifyUsers has no built-in dedupe,
 * so this checks existing notifications for the same record+bucket first —
 * safe to call on every Probation page load without spamming duplicates.
 */
export function checkProbationReviewReminders(actor: User): void {
  if (!canViewAllHrRecords(actor)) return;

  const sentReminders = new Set(
    api.getNotifications()
      .filter((n) => n.entityType === "probation" && n.metadata?.reminderType)
      .map((n) => `${n.entityId}:${n.metadata!.reminderType}`),
  );

  for (const record of api.getProbationRecords()) {
    if (!PROBATION_ACTIVE_STATUSES.has(record.status)) continue;

    const daysUntilReview = daysUntil(record.expectedReviewDate);
    const bucket = probationReminderBucket(daysUntilReview);
    if (!bucket || sentReminders.has(`${record.id}:${bucket}`)) continue;

    const subject = getUserById(record.userId);
    const bodyByBucket: Record<ProbationReminderType, string> = {
      "30_days": `${subject?.name ?? "An employee"}'s probation review is due in 30 days.`,
      "7_days":  `${subject?.name ?? "An employee"}'s probation review is due in 7 days.`,
      "on_date": `${subject?.name ?? "An employee"}'s probation review is due today.`,
      "overdue": `${subject?.name ?? "An employee"}'s probation review is overdue.`,
    };

    notifyUsers({
      title:            "Probation review reminder",
      body:             bodyByBucket[bucket],
      notificationType: "user",
      audience:         "role",
      roleIds:          [ROLE_IDS.ADMIN],
      entityType:       "probation",
      entityId:         record.id,
      metadata:         { reminderType: bucket },
    });
  }
}

/**
 * Returns the full probation chain for a user, oldest first — the original
 * record plus every extension created via decideProbationReview's "extended"
 * outcome, linked by parentRecordId.
 */
export function getProbationHistoryForUser(userId: string): ProbationRecord[] {
  const records = api.getProbationRecords().filter((r) => r.userId === userId);
  const byParent = new Map<string | undefined, ProbationRecord[]>();
  for (const record of records) {
    const key = record.parentRecordId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(record);
  }

  const chain: ProbationRecord[] = [];
  let current = byParent.get(undefined)?.[0];
  while (current) {
    chain.push(current);
    current = byParent.get(current.id)?.[0];
  }
  return chain;
}




const DEFAULT_PROBATION_DAYS = 90;

/** Normalizes a probation duration entered in days or months to a day count. */
function normalizeProbationDurationDays(duration: number, unit: "days" | "months"): number {
  return unit === "months" ? Math.round(duration * 30) : duration;
}

/**
 * Builds (but does not save) a probation record. Shared by the manual
 * "submit for review" flow and automatic creation at employee hire —
 * callers are responsible for their own permission checks and persistence.
 */
function buildProbationRecord(input: {
  actor:          User;
  userId:         string;
  dateJoined:     string;
  durationDays:   number;
  durationUnit:   "days" | "months";
  parentRecordId?: string;
}): ProbationRecord {
  const joinDate = new Date(`${input.dateJoined}T00:00:00`);
  joinDate.setDate(joinDate.getDate() + input.durationDays);
  const expectedReviewDate = toIsoDateLocal(joinDate);

  return {
    id:                    generateProbationId(),
    userId:                input.userId,
    dateJoined:            input.dateJoined,
    probationDurationDays: input.durationDays,
    probationDurationUnit: input.durationUnit,
    expectedReviewDate,
    status:                "pending",
    parentRecordId:        input.parentRecordId,
    submittedById:         input.actor.id,
    createdAt:             formatDocumentDate(),
  };
}

export function submitProbationReview(
  actor: User,
  userId: string,
  input: { dateJoined?: string; notes?: string; durationDays?: number; durationUnit?: "days" | "months" }
): ProbationRecord {
  requireProbationSubmissionPermission(actor);

  const subject = getUserById(userId);
  if (!subject) throw new Error("Employee not found.");

  // Block duplicate active records (pending / under_review / extended).
  const existing = api.getProbationRecords().find(
    (r) => r.userId === userId && PROBATION_ACTIVE_STATUSES.has(r.status),
  );
  if (existing) throw new Error("An active probation record already exists for this employee.");

  // Users have no native "joined" date on legacy accounts — fall back to
  // the onboarding submission date, then explicit input for employees
  // onboarded before this system existed.
  const onboarding  = api.getOnboardingRecords().find((record) => record.userId === userId);
  const dateJoined  = input.dateJoined ?? subject.dateJoined ?? onboarding?.submittedAt ?? formatDocumentDate();
  const durationUnit = input.durationUnit ?? "days";
  const durationDays = normalizeProbationDurationDays(input.durationDays ?? DEFAULT_PROBATION_DAYS, durationUnit);

  const record = buildProbationRecord({ actor, userId, dateJoined, durationDays, durationUnit });
  api.saveProbationRecord(record);

  if (input.notes) {
    api.saveProbationNote({
      id:                generateProbationId(),
      probationRecordId: record.id,
      authorId:          actor.id,
      note:              input.notes,
      noteType:          "assessment",
      createdAt:         formatDocumentDate(),
    });
  }

  // Notify Co-Founder that a probation review awaits their decision.
  notifyUsers({
    title:            "Probation review submitted",
    body:             `HR has submitted a probation review for ${subject.name}. Your decision is required.`,
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.ADMIN],
    actorId:          actor.id,
    entityType:       "probation",
    entityId:         record.id,
  });

  recordActivity({
    userId:     actor.id,
    action:     "PROBATION_SUBMITTED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId },
  });

  return record;
}

export function decideProbationReview(
  actor: User,
  probationId: string,
  outcome: "confirmed" | "extended" | "terminated",
  note?: string,
  extension?: { extensionDurationDays: number; newReviewDate: string },
): ProbationRecord {
  requireProbationDecisionPermission(actor);

  const record = api.getProbationRecordById(probationId);
  if (!record) throw new Error("Probation record not found.");

  if (outcome === "extended" && (!note || !extension)) {
    throw new Error("Extending probation requires a reason and a new review date.");
  }

  const now = formatDocumentDate();
  record.status       = outcome;
  record.reviewedById = actor.id;
  record.reviewedAt   = now;

  if (note) {
    api.saveProbationNote({
      id:                generateProbationId(),
      probationRecordId: record.id,
      authorId:          actor.id,
      note,
      noteType:          "decision",
      createdAt:         now,
    });
  }

  api.saveProbationRecord(record);

  // Extending doesn't overwrite the original record's history — it opens a
  // new active review cycle as a linked child record via parentRecordId.
  if (outcome === "extended" && extension) {
    const dateJoinedMs = new Date(`${record.dateJoined}T00:00:00`).getTime();
    const newReviewMs  = new Date(`${extension.newReviewDate}T00:00:00`).getTime();
    const durationDays = Math.round((newReviewMs - dateJoinedMs) / 86_400_000);

    const childRecord: ProbationRecord = {
      id:                    generateProbationId(),
      userId:                record.userId,
      dateJoined:            record.dateJoined,
      probationDurationDays: durationDays,
      probationDurationUnit: record.probationDurationUnit,
      expectedReviewDate:    extension.newReviewDate,
      status:                "pending",
      parentRecordId:        record.id,
      submittedById:         actor.id,
      createdAt:             now,
    };
    api.saveProbationRecord(childRecord);
  }

  const decidedSubject = getUserById(record.userId);
  const outcomeLabel   = outcome === "confirmed" ? "confirmed" : outcome === "extended" ? "extended" : "terminated";

  // Notify HR and the employee's reporting manager of the Co-Founder's decision.
  notifyUsers({
    title:            "Probation decision made",
    body:             `${decidedSubject?.name ?? "An employee"}'s probation has been ${outcomeLabel}.`,
    notificationType: "user",
    audience:         "role",
    roleIds:          [ROLE_IDS.ADMIN],
    actorId:          actor.id,
    entityType:       "probation",
    entityId:         record.id,
  });

  if (decidedSubject?.supervisorId) {
    notifyUsers({
      title:            "Probation decision made",
      body:             `${decidedSubject.name}'s probation has been ${outcomeLabel}.`,
      notificationType: "user",
      audience:         "user",
      userIds:          [decidedSubject.supervisorId],
      actorId:          actor.id,
      entityType:       "probation",
      entityId:         record.id,
    });
  }

  if (outcome === "terminated") {
    const existingDeboarding = api.getDeboardingRecords().find(
      (deboarding) => deboarding.userId === record.userId && deboarding.status !== "offboarded",
    );
    if (!existingDeboarding) {
      const track: DeboardingTrack = decidedSubject?.userType === "creator" ? "creator" : "employee";
      const deboardId = generateDeboardingId();
      api.saveDeboardingRecord({
        id:            deboardId,
        userId:        record.userId,
        initiatedById: actor.id,
        track,
        status:        track === "creator" ? "pending_lead_approval" : "data_recovery_pending",
        reason:        "Probation terminated",
        initiatedAt:   now,
        checklist:     {},
        createdAt:     now,
      });

      // Notify appropriate party to action the auto-created deboarding record.
      if (track === "creator") {
        notifyUsers({
          title:            "Creator deboarding initiated",
          body:             `${decidedSubject?.name ?? "A creator"}'s probation was terminated. Your approval is required to proceed with deboarding.`,
          notificationType: "user",
          audience:         "role",
          roleIds:          [ROLE_IDS.TEAM_LEAD],
          actorId:          actor.id,
          entityType:       "deboarding",
          entityId:         deboardId,
        });
      } else {
        notifyUsers({
          title:            "Employee deboarding initiated",
          body:             `${decidedSubject?.name ?? "An employee"}'s probation was terminated. Please complete the deboarding checklist.`,
          notificationType: "user",
          audience:         "role",
          roleIds:          [ROLE_IDS.ADMIN],
          actorId:          actor.id,
          entityType:       "deboarding",
          entityId:         deboardId,
        });
      }
    }
  }

  recordActivity({
    userId:     actor.id,
    action:     "PROBATION_DECIDED",
    targetType: "hr_record",
    targetId:   record.id,
    metadata:   { userId: record.userId, outcome },
  });

  return record;
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



