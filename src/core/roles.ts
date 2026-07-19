// ─────────────────────────────────────────────────────────────────────────────
// Role identifiers
// Mirrors the live public.user_role Postgres enum exactly (5 values) — the
// app previously had its own 16-role catalog, remapped down to this set so
// identity can live directly on the Finance Dashboard's public.users table
// instead of a parallel one. Separation-of-duties is lost as a result
// (HR and Cofounder both become "admin").
// Never change these values — they are persisted in Supabase and localStorage.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_IDS = {
  ADMIN:     "admin",
  TEAM_LEAD: "team_lead",
  FINANCE:   "finance",
  EMPLOYEE:  "employee",
  DEVELOPER: "developer",
} as const;

export type RoleConstantKey   = keyof typeof ROLE_IDS;
export type RoleConstantValue = (typeof ROLE_IDS)[RoleConstantKey];

/** Fallback role used when a user's roleId cannot be resolved from the store. */
export const DEFAULT_ROLE_ID: RoleConstantValue = "employee";

// ─────────────────────────────────────────────────────────────────────────────
// Role selector options
// Shown on the MVP login screen for development / role-switching.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_SELECTION_OPTIONS = [
  { id: ROLE_IDS.ADMIN,     title: "Admin",     description: "Full platform access" },
  { id: ROLE_IDS.TEAM_LEAD, title: "Team Lead",  description: "Team and leave management" },
  { id: ROLE_IDS.FINANCE,   title: "Finance",    description: "SOPs, reporting and approvals" },
  { id: ROLE_IDS.EMPLOYEE,  title: "Employee",   description: "Standard team member access" },
  { id: ROLE_IDS.DEVELOPER, title: "Developer",  description: "Engineering tooling access" },
] as const;

export type RoleSelectionOption = (typeof ROLE_SELECTION_OPTIONS)[number];
export type RoleSelectionId     = RoleSelectionOption["id"];
