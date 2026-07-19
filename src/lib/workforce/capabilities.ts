export interface WorkforceIdentity {
  id: string;
  roleName: string;
  managerUserId?: string | null;
}

export interface WorkforceCapabilities {
  isCreator: boolean; isCoFounder: boolean; isHrManager: boolean; isHrExecutive: boolean;
  isContentLead: boolean; canManageContent: boolean; canManageEmployment: boolean;
  canManageOnboarding: boolean; canManageAttendance: boolean; canSubmitLeave: boolean;
  canApproveManagerLeave: boolean; canApproveHrLeave: boolean; canManageProbation: boolean;
  canFinalizeProbation: boolean; canInitiateEmployeeDeboarding: boolean;
  canInitiateCreatorDeboarding: boolean; canApproveCreatorDeboarding: boolean;
  canViewInternalUsers: boolean; canAccessHr: boolean;
}

function normalizeRoleName(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
}

export function capabilitiesFor(identity: WorkforceIdentity): WorkforceCapabilities {
  const role = normalizeRoleName(identity.roleName);
  const isCreator = role === "creator";
  // "admin" is the current global.roles catalog entry documented as the
  // full-access successor to Co-Founder/HR/HR Executive (see the ROLES seed
  // in services/api.ts) — without this alias, any admin-role identity
  // (including the local dev bootstrap user) falls through every capability
  // check to false, since none of the specific role-name comparisons below
  // ever match "admin".
  const isCoFounder = role === "co founder" || role === "admin";
  const isHrManager = role === "hr manager";
  const isHrExecutive = role === "hr executive";
  const isContentLead = role === "category lead" || role === "im team lead";
  const isCreatorAcquisition = role === "creator acquisition";
  const isManager = isContentLead || role === "finance manager";
  const hr = isCoFounder || isHrManager || isHrExecutive;

  return {
    isCreator, isCoFounder, isHrManager, isHrExecutive, isContentLead,
    canManageContent: isCoFounder || hr || isContentLead,
    canManageEmployment: hr,
    canManageOnboarding: hr,
    canManageAttendance: hr,
    canSubmitLeave: !isCreator,
    canApproveManagerLeave: !isCreator && (isManager || hr),
    canApproveHrLeave: isCoFounder || isHrManager,
    canManageProbation: hr,
    canFinalizeProbation: isCoFounder,
    canInitiateEmployeeDeboarding: hr,
    canInitiateCreatorDeboarding: isCreatorAcquisition || isCoFounder,
    canApproveCreatorDeboarding: isContentLead || isCoFounder,
    canViewInternalUsers: !isCreator,
    canAccessHr: !isCreator,
  };
}
