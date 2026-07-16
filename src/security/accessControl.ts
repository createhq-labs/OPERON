import type { User } from "@/core/types";
import {
  canDeleteDocument,
  canEditDocument,
  canManageResources,
  canManageUsers,
  canManageRoles,
  canUploadDocument,
  canPublishGlobally,
  canApproveLeaveAsTl,
  canApproveLeaveAsHr,
  canManageHrCalendar,
  canSubmitProbationReview,
  canDecideProbationReview,
  canAcknowledgeDeboarding,
  canApproveDeboardingEmployeeTrack,
  canFlagDeboardingAny,
  canManagePeople,
  canManageOnboarding,
} from "@/security/permissions";

// ─── Require Guards ───────────────────────────────────────────────────────────
// These are TypeScript assertion functions — they throw on failure and
// narrow the type to `User` on success. Use them at service boundaries
// before performing operations that require a specific capability.
//
// Each function checks the relevant capability directly. The caller does not
// need to pre-check authentication — a null/unauthenticated user fails all
// capability checks and produces a clear error message.

export function requireAuthenticatedUser(
  user: User | null | undefined
): asserts user is User {
  if (!user) {
    throw new Error("Authentication required.");
  }
}

export function requireUploadPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canUploadDocument(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to upload documents."
        : "Authentication required."
    );
  }
}

export function requirePublishingPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canPublishGlobally(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to publish content globally."
        : "Authentication required."
    );
  }
}

export function requireEditingPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canEditDocument(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to edit documents."
        : "Authentication required."
    );
  }
}

export function requireDeletePermission(
  user: User | null | undefined
): asserts user is User {
  if (!canDeleteDocument(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to delete documents."
        : "Authentication required."
    );
  }
}

export function requireResourceManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageResources(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage resources."
        : "Authentication required."
    );
  }
}

export function requireUserManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageUsers(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage users."
        : "Authentication required."
    );
  }
}

/**
 * Guards role registry operations (creating/modifying roles).
 * Distinct from requireUserManagementPermission — role management is
 * narrower and limited to platform owners.
 */
export function requireRoleManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageRoles(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage the role registry."
        : "Authentication required."
    );
  }
}

/**
 * Guards HR actions scoped to "your own direct reports" (e.g. TL leave
 * approval, deboarding flags). Walks one level of the supervisorId chain —
 * org structure has multiple team leads per department, so this cannot be
 * resolved by role or department alone.
 */
export function requireSupervisorOf(actor: User, subject: User): void {
  if (subject.supervisorId !== actor.id) {
    throw new Error("You are not this person's direct manager.");
  }
}

export function requireLeaveTlApprovalPermission(
  user: User | null | undefined,
  subject: User
): asserts user is User {
  if (!canApproveLeaveAsTl(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to approve leave at the team-lead step."
        : "Authentication required."
    );
  }
  requireSupervisorOf(user, subject);
}

export function requireLeaveHrApprovalPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canApproveLeaveAsHr(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to approve leave at the HR step."
        : "Authentication required."
    );
  }
}

export function requireHrCalendarManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageHrCalendar(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage the holiday calendar."
        : "Authentication required."
    );
  }
}

export function requireProbationSubmissionPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canSubmitProbationReview(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to submit probation reviews."
        : "Authentication required."
    );
  }
}

export function requireProbationDecisionPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canDecideProbationReview(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to decide probation outcomes."
        : "Authentication required."
    );
  }
}

export function requireDeboardingAcknowledgementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canAcknowledgeDeboarding(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to acknowledge or complete deboarding."
        : "Authentication required."
    );
  }
}

export function requireDeboardingEmployeeApprovalPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canApproveDeboardingEmployeeTrack(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to approve employee-track deboarding."
        : "Authentication required."
    );
  }
}

/**
 * Guards "flag deboarding" — either the actor is the subject's direct
 * supervisor, or they hold HR/founder-tier authority to flag anyone.
 */
export function requireDeboardingFlagPermission(user: User | null | undefined, subject: User): asserts user is User {
  if (!user) {
    throw new Error("Authentication required.");
  }
  if (subject.supervisorId === user.id) return;
  if (canFlagDeboardingAny(user)) return;
  throw new Error("You do not have permission to flag this person for deboarding.");
}

export function requireManagePeoplePermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManagePeople(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage roster members."
        : "Authentication required."
    );
  }
}

export function requireOnboardingManagementPermission(
  user: User | null | undefined
): asserts user is User {
  if (!canManageOnboarding(user)) {
    throw new Error(
      user
        ? "Your role does not have permission to manage onboarding submissions."
        : "Authentication required."
    );
  }
}

/**
 * Guards self-service HR records (own leave history, own onboarding, etc.):
 * the acting user must either own the record or hold an override permission
 * the caller has already evaluated (e.g. canViewAllHrRecords(actor)).
 */
export function requireOwnRecordOrPermission(
  actor: User,
  ownerUserId: string,
  hasOverridePermission: boolean,
): void {
  if (actor.id !== ownerUserId && !hasOverridePermission) {
    throw new Error("You do not have permission to access this record.");
  }
}

// ─── Assert Helpers ───────────────────────────────────────────────────────────
// Composed guards for common operation patterns.
// Prefer these at call sites over calling require* functions individually.

export function assertCanUpload(
  user: User | null
): asserts user is User {
  requireUploadPermission(user);
}

export function assertCanPublish(
  user: User | null
): asserts user is User {
  requirePublishingPermission(user);
}

export function assertCanEdit(
  user: User | null
): asserts user is User {
  requireEditingPermission(user);
}

export function assertCanDelete(
  user: User | null
): asserts user is User {
  requireDeletePermission(user);
}

export function assertCanManageResources(
  user: User | null
): asserts user is User {
  requireResourceManagementPermission(user);
}

export function assertCanManageUsers(
  user: User | null
): asserts user is User {
  requireUserManagementPermission(user);
}

export function assertCanManageRoles(
  user: User | null
): asserts user is User {
  requireRoleManagementPermission(user);
}