// ─────────────────────────────────────────────────────────────────────────────
// Role identifiers
// Stable string constants used throughout the RBAC system.
// Never change these values — they are persisted in Supabase and localStorage.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_IDS = {
  COFOUNDER:       "role_cofounder",
  ADMIN:           "role_admin",
  HR:              "role_hr",
  FINANCE:         "role_finance",
  IM_TEAM_LEAD:    "role_im_team_lead",
  TM_TEAM_LEAD:    "role_tm_team_lead",
  /** Convenience alias for TM_TEAM_LEAD — use TM_TEAM_LEAD in new code. */
  TEAM_LEAD:       "role_tm_team_lead",
  EMPLOYEE:        "role_employee",
  INTERN:          "role_intern",
  CONTENT_CREATOR: "role_creator",
  IM_MEMBER:       "role_im_member",
  TM_MEMBER:       "role_tm_member",
  VIEWER:          "role_viewer",
} as const;

export type RoleConstantKey = keyof typeof ROLE_IDS;
export type RoleConstantValue = (typeof ROLE_IDS)[RoleConstantKey];

export const DEFAULT_ROLE_ID = ROLE_IDS.EMPLOYEE;

// ─────────────────────────────────────────────────────────────────────────────
// Role selector options
// The seven roles surfaced in the role-selection screen.
// Order is intentional: highest privilege first, read-only last.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_SELECTION_OPTIONS = [
  { id: ROLE_IDS.COFOUNDER,       title: "Co-Founder",      description: "Full platform access" },
  { id: ROLE_IDS.HR,              title: "HR",              description: "Policies and people management" },
  { id: ROLE_IDS.FINANCE,         title: "Finance",         description: "Financial SOPs and reporting" },
  { id: ROLE_IDS.TM_TEAM_LEAD,   title: "Team Lead",       description: "Team documentation and SOPs" },
  { id: ROLE_IDS.CONTENT_CREATOR, title: "Content Creator", description: "Brand assets and campaigns" },
  { id: ROLE_IDS.EMPLOYEE,        title: "Employee",        description: "View and search knowledge base" },
  { id: ROLE_IDS.INTERN,          title: "Intern",          description: "Approved training content" },
] as const;

export type RoleSelectionOption = (typeof ROLE_SELECTION_OPTIONS)[number];
export type RoleSelectionId    = RoleSelectionOption["id"];