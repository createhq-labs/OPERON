import type { User, VisibilityScope } from "@/core/types";
import { hasPermission, isAdmin } from "@/core/operon";
import { capabilitiesFor, normalizeRoleName } from "@/lib/workforce/capabilities";

function workforceCapabilities(user: User) {
  return capabilitiesFor({
    id: user.id,
    roleName: user.roleName ?? user.roleId,
    managerUserId: user.supervisorId,
    permissionIds: user.permissionIds,
  });
}

/**
 * The handful of actions with no corresponding row in the real permission
 * catalog (probation decisions, Drive config, founder-tier leave approval)
 * stay tied to the real Co-Founder identity rather than any permission —
 * by explicit decision, not a stand-in for a missing permission to add.
 */
function isCoFounder(user: User): boolean {
  return normalizeRoleName(user.roleName ?? user.roleId) === "co founder";
}

// ─── Document Permissions ─────────────────────────────────────────────────────

export function canEditDocument(user: User | null | undefined): boolean {
  return Boolean(user && workforceCapabilities(user).canManageContent);
}

export function canDeleteDocument(_user: User | null | undefined): boolean {
  return false;
}

export function canUploadDocument(user: User | null | undefined): boolean {
  return Boolean(user && workforceCapabilities(user).canManageContent);
}

// ─── Resource Permissions ─────────────────────────────────────────────────────

/**
 * Whether the user may create, edit, or delete resource entries.
 * Does not conflate with role management permissions.
 */
export function canManageResources(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageResources;
}

export function canViewResources(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "view_resources"));
}

// ─── User & Role Permissions ──────────────────────────────────────────────────

/**
 * Whether the user may create, edit, or deactivate other users.
 */
export function canManageUsers(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "manage_users") || isCoFounder(user);
}

// ─── Publishing ───────────────────────────────────────────────────────────────

export function canPublishGlobally(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "send_to_all"));
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export function canViewActivity(user: User | null | undefined): boolean {
  return Boolean(user && hasPermission(user, "view_activity"));
}

// ─── Drive ────────────────────────────────────────────────────────────────────

/**
 * Whether the user may configure the Google Drive integration.
 * No permission row exists for this in the real catalog — Co-Founder only,
 * by explicit decision (see isCoFounder above).
 */
export function canManageDrive(user: User | null | undefined): boolean {
  if (!user) return false;
  return isCoFounder(user);
}

// ─── HR ────────────────────────────────────────────────────────────────────────

/**
 * Whether the user can act as the TL-step approver for leave requests.
 * Permission alone is not sufficient — callers must also confirm the user
 * is the requester's direct supervisor via requireSupervisorOf().
 */
export function canApproveLeaveAsTl(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "approve_leave_team_lead") || isCoFounder(user);
}

/**
 * HR-step leave approval, driven by the real approve_leave_hr permission.
 */
export function canApproveLeaveAsHr(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "approve_leave_hr") || isCoFounder(user);
}

/**
 * Founder-tier final approver — bypasses the standard TL→HR chain. No
 * permission row exists for this; Co-Founder only, by explicit decision.
 */
export function canApproveLeaveAsFounder(user: User | null | undefined): boolean {
  if (!user) return false;
  return isCoFounder(user);
}

export function canManageHrCalendar(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageAttendance;
}

/** Whether the user can view HR records (onboarding/leave/attendance) for everyone, not just themselves. */
export function canViewAllHrRecords(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "view_all_hr_records") || isCoFounder(user);
}

/** HR submits a probation review for Co-Founder to decide — submission only, no outcome authority. */
export function canSubmitProbationReview(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageProbation;
}

/**
 * Only Co-Founder decides probation outcomes — deliberately excludes HR.
 * HR's real workflow is: get notified a probation is due, flag the person,
 * and send the request to the Co-Founder to approve or reject. The real
 * decide_probation_review permission row on HR Manager does not grant
 * decision authority here, by explicit decision.
 */
export function canDecideProbationReview(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canFinalizeProbation;
}

/** Employee-track deboarding requires Co-Founder approval before HR can complete it. */
export function canApproveDeboardingEmployeeTrack(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "approve_employee_track_deboarding") || isCoFounder(user);
}


/** Whether the user can view their direct reports' full leave/WFH history, not just the live approval queue. */
export function canViewTeamLeaveHistory(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "view_team_leave_history") || isCoFounder(user);
}

/**
 * Whether the user may edit a roster member's department/supervisor/status.
 * Distinct from canManageUsers — that's Co-Founder-only platform user CRUD;
 * this is the narrower workforce-tier "people" capability.
 */
export function canManagePeople(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "manage_people") || isCoFounder(user);
}

/** Whether the user can reject/send back an onboarding submission for revision. */
export function canManageOnboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "manage_onboarding") || isCoFounder(user);
}

// ─── People Module (Lifecycle) ────────────────────────────────────────────────

/**
 * People module access: everyone with the real manage_people permission
 * (or Co-Founder).
 */
export function canAccessPeopleModule(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageEmployment;
}

/**
 * Whether the user may submit a creator deboarding request.
 */
export function canSubmitCreatorDeboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canInitiateCreatorDeboarding;
}

/**
 * Whether the user may approve and complete creator deboarding. The real
 * permission catalog doesn't separate creator-track from employee-track
 * deboarding approval — this shares the one generic permission with
 * canApproveDeboardingEmployeeTrack.
 */
export function canApproveCreatorDeboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canApproveCreatorDeboarding;
}

/** HR (and Co-Founder) initiate and complete employee deboarding. */
export function canInitiateEmployeeDeboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canInitiateEmployeeDeboarding;
}

// ─── Workforce Access ─────────────────────────────────────────────────────────

/**
 * Creators appear in workforce data but cannot access Workforce pages.
 * Everyone else gets at least Calendar access. Gated on userType, not role —
 * "creator" isn't a role value on the live public.user_role enum.
 */
export function canAccessWorkforce(user: User | null | undefined): boolean {
  if (!user) return false;
  return !workforceCapabilities(user).isCreator;
}

// ─── Visibility Access ────────────────────────────────────────────────────────

/**
 * Low-level visibility check against a single document's scope.
 *
 * - "global"     → always visible
 * - "department" → visible to same department or admin
 * - "private"    → visible to users listed in assignedUserIds, or admin
 *
 * assignedUserIds corresponds to the `assigned_user_ids` column in the
 * documents table. `authorId` is not the correct field for private visibility
 * per the Supabase schema.
 */
export function hasVisibilityAccess(
  user: User | null,
  itemVisibility: VisibilityScope,
  itemDepartmentId?: string,
  itemUserTypes?: string[],
  assignedUserIds?: string[],
): boolean {
  if (!user) return itemVisibility === "global";

  if (isAdmin(user)) return true;

  switch (itemVisibility) {
    case "global":
      return true;

    case "department":
      return user.departmentId === itemDepartmentId;

    case "private":
      return assignedUserIds?.includes(user.id) ?? false;

    default:
      return itemUserTypes?.includes(user.userType) ?? false;
  }
}
