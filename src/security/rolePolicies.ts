import type { RoleId } from "@/core/types";
import { ROLE_IDS } from "@/core/roles";

// ─────────────────────────────────────────────────────────────────────────────
// These sets used to distinguish 16 legacy roles. They now run against the
// live public.user_role enum (5 values: employee/team_lead/finance/admin/
// developer). Several sets below are now IDENTICAL as a direct result
// (HR_ONLY_ROLES == FOUNDER_TIER_ROLES == USER_MANAGER_ROLES
// == DRIVE_MANAGER_ROLES == {admin}) — kept as separate named exports rather
// than consolidated, since callers in permissions.ts/operon.ts reference them
// by name for their semantic meaning, not their current membership.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Resource Management
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Workforce Access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roles with full Workforce access: Lifecycle, Calendar, and Probation.
 * Employees get Calendar-only access (Lifecycle tab is hidden). Creators
 * (userType === "creator") are blocked from Workforce entirely — that check
 * no longer runs through role at all, see canAccessWorkforce in permissions.ts.
 */
export const WORKFORCE_ADMIN_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.ADMIN,
  ROLE_IDS.FINANCE,
  ROLE_IDS.TEAM_LEAD,
]);

// ─────────────────────────────────────────────────────────────────────────────
// HR / Leave Approval
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roles that act as TL-step approvers in the leave approval flow.
 * Admin acts as final approver via FOUNDER_TIER_ROLES bypass in operon.ts.
 */
export const TL_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.TEAM_LEAD,
  ROLE_IDS.FINANCE,
  ROLE_IDS.ADMIN,
]);

/**
 * HR-step leave approval. Was deliberately HR-only (separation of duties from
 * Cofounder); HR and Cofounder both collapsed to "admin", so this is now
 * identical to FOUNDER_TIER_ROLES — any admin can act at either step.
 */
export const HR_ONLY_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.ADMIN,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Platform Administration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide probation outcomes, approve employee-track deboarding, full admin
 * panel access. Identical to HR_ONLY_ROLES now (see note above).
 */
export const FOUNDER_TIER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.ADMIN,
]);

/**
 * Roles that may manage users (create, edit, assign roles).
 */
export const USER_MANAGER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.ADMIN,
]);

/**
 * Roles that may connect and configure the Google Drive integration.
 */
export const DRIVE_MANAGER_ROLES: ReadonlySet<RoleId> = new Set<RoleId>([
  ROLE_IDS.ADMIN,
]);

