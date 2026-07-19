import type { User, VisibilityScope } from "@/core/types";
import { hasPermission, isAdmin } from "@/core/operon";
import {
  DRIVE_MANAGER_ROLES,
  USER_MANAGER_ROLES,
  TL_ROLES,
  HR_ONLY_ROLES,
  FOUNDER_TIER_ROLES,
  WORKFORCE_ADMIN_ROLES,
} from "@/security/rolePolicies";
import { capabilitiesFor } from "@/lib/workforce/capabilities";

function workforceCapabilities(user: User) {
  return capabilitiesFor({ id: user.id, roleName: user.roleName ?? user.roleId, managerUserId: user.supervisorId });
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
  return workforceCapabilities(user).canManageContent;
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
  return (
    hasPermission(user, "manage_users") ||
    USER_MANAGER_ROLES.has(user.roleId as never)
  );
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
 * Uses DRIVE_MANAGER_ROLES as the canonical policy set — not a hardcoded list.
 */
export function canManageDrive(user: User | null | undefined): boolean {
  if (!user) return false;
  return DRIVE_MANAGER_ROLES.has(user.roleId as never);
}

// ─── HR ────────────────────────────────────────────────────────────────────────

/**
 * Whether the user can act as the TL-step approver for leave requests.
 * Permission alone is not sufficient — callers must also confirm the user
 * is the requester's direct supervisor via requireSupervisorOf().
 */
export function canApproveLeaveAsTl(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "approve_leave_tl") ||
    TL_ROLES.has(user.roleId as never) ||
    // Founders act as direct managers for HR/Finance direct reports and
    // are their final approver (bypass the standard TL→HR step).
    FOUNDER_TIER_ROLES.has(user.roleId as never)
  );
}

/**
 * HR-step leave approval. Deliberately HR-only — Cofounder/Admin do not
 * action this step (separation of duties), unlike most other HR module grants.
 */
export function canApproveLeaveAsHr(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "approve_leave_hr") || HR_ONLY_ROLES.has(user.roleId as never);
}

export function canApproveLeaveAsFounder(user: User | null | undefined): boolean {
  if (!user) return false;
  return FOUNDER_TIER_ROLES.has(user.roleId as never);
}

export function canManageHrCalendar(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageAttendance;
}

/** Whether the user can view HR records (onboarding/leave/attendance) for everyone, not just themselves. */
export function canViewAllHrRecords(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "view_hr_records_all") ||
    HR_ONLY_ROLES.has(user.roleId as never) ||
    FOUNDER_TIER_ROLES.has(user.roleId as never)
  );
}

/** HR submits a probation review for Co-Founder/Admin to decide — submission only, no outcome authority. */
export function canSubmitProbationReview(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageProbation;
}

/** Only Co-Founder/Admin decide probation outcomes — deliberately excludes HR. */
export function canDecideProbationReview(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canFinalizeProbation;
}

/** Employee-track deboarding requires Co-Founder/Admin approval before HR can complete it. */
export function canApproveDeboardingEmployeeTrack(user: User | null | undefined): boolean {
  if (!user) return false;
  return hasPermission(user, "approve_deboarding_employee_track") || FOUNDER_TIER_ROLES.has(user.roleId as never);
}


/** Whether the user can view their direct reports' full leave/WFH history, not just the live approval queue. */
export function canViewTeamLeaveHistory(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "view_team_leave_history") ||
    TL_ROLES.has(user.roleId as never) ||
    FOUNDER_TIER_ROLES.has(user.roleId as never)
  );
}

/**
 * Whether the user may edit a roster member's department/supervisor/status.
 * Distinct from canManageUsers — that's Co-Founder-only platform user CRUD;
 * this is the narrower workforce-tier "people" capability.
 */
export function canManagePeople(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "manage_people") ||
    WORKFORCE_ADMIN_ROLES.has(user.roleId as never)
  );
}

/** Whether the user can reject/send back an onboarding submission for revision. */
export function canManageOnboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, "manage_onboarding") ||
    HR_ONLY_ROLES.has(user.roleId as never) ||
    FOUNDER_TIER_ROLES.has(user.roleId as never)
  );
}

// ─── People Module (Lifecycle) ────────────────────────────────────────────────

/**
 * People module access: all workforce admins.
 * Previously also granted to the literal Creator Acquisition role, which no
 * longer exists post role-collapse (see rolePolicies.ts) — there's no
 * department/team signal reliable enough to stand in for it, so that
 * special-case is dropped rather than guessed at.
 */
export function canAccessPeopleModule(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canManageEmployment;
}

/**
 * Founders may submit a creator deboarding request.
 * Previously also granted to the literal Creator Acquisition role — dropped
 * for the same reason as canAccessPeopleModule above.
 */
export function canSubmitCreatorDeboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canInitiateCreatorDeboarding;
}

/**
 * Team Lead tier (and Founders) approve and complete creator deboarding.
 * TM Team Lead and Senior TM both collapsed into the single `team_lead`
 * role — this now also includes IM Team Lead, which didn't have this
 * authority before the collapse.
 */
export function canApproveCreatorDeboarding(user: User | null | undefined): boolean {
  if (!user) return false;
  return workforceCapabilities(user).canApproveCreatorDeboarding;
}

/** HR (and Founders) initiate and complete employee deboarding. */
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
