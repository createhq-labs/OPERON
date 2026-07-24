export interface WorkforceIdentity {
  id: string;
  roleName: string;
  managerUserId?: string | null;
  /** Real permission names from global.role_permissions/global.permissions — see workforcePermissionLookup.ts. */
  permissionIds: string[];
}

export interface WorkforceCapabilities {
  isCreator: boolean; isCoFounder: boolean;
  canManageContent: boolean; canManageResources: boolean; canManageEmployment: boolean;
  canManageOnboarding: boolean; canManageAttendance: boolean; canSubmitLeave: boolean;
  canApproveManagerLeave: boolean; canApproveHrLeave: boolean; canManageProbation: boolean;
  canFinalizeProbation: boolean; canInitiateEmployeeDeboarding: boolean;
  canInitiateCreatorDeboarding: boolean; canApproveCreatorDeboarding: boolean;
  canViewInternalUsers: boolean; canAccessHr: boolean;
}

export function normalizeRoleName(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
}

export function capabilitiesFor(identity: WorkforceIdentity): WorkforceCapabilities {
  const role = normalizeRoleName(identity.roleName);
  const isCreator = role === "creator";
  // The real permission catalog has no admin-only permission rows of its
  // own for a handful of actions (probation decisions, Drive config,
  // founder-tier leave approval) — those stay hardcoded to the real
  // Co-Founder identity rather than any permission, by explicit decision.
  const isCoFounder = role === "co founder";
  const has = (permission: string) => identity.permissionIds.includes(permission);

  return {
    isCreator, isCoFounder,
    canManageContent: has("add_documents") || has("edit_documents") || has("manage_uploads") || has("manage_team_documents") || isCoFounder,
    canManageResources: has("manage_resources") || isCoFounder,
    canManageEmployment: has("manage_people") || isCoFounder,
    canManageOnboarding: has("manage_onboarding") || isCoFounder,
    canManageAttendance: has("manage_hr_calendar") || isCoFounder,
    canSubmitLeave: !isCreator,
    canApproveManagerLeave: has("approve_leave_team_lead") || isCoFounder,
    canApproveHrLeave: has("approve_leave_hr") || isCoFounder,
    canManageProbation: has("submit_probation_review") || isCoFounder,
    canFinalizeProbation: isCoFounder,
    // The real permission catalog doesn't separate employee-track from
    // creator-track deboarding — one generic flag/approve pair covers both,
    // so whoever holds it can act on either track.
    canInitiateEmployeeDeboarding: has("flag_deboarding") || isCoFounder,
    canInitiateCreatorDeboarding: has("flag_deboarding") || isCoFounder,
    canApproveCreatorDeboarding: has("approve_employee_track_deboarding") || isCoFounder,
    canViewInternalUsers: !isCreator,
    canAccessHr: !isCreator,
  };
}
