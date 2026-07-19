import type { User } from "@/core/types";
import {
  canEditDocument,
  canManageResources,
  canUploadDocument,
  canManageHrCalendar,
  canSubmitProbationReview,
  canDecideProbationReview,
  canApproveDeboardingEmployeeTrack,
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

