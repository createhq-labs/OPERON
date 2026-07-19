import type {
  ActivityEvent,
  Department,
  DeptId,
  Document,
  DocTag,
  DriveDocumentReference,
  GoogleDocsApiDocument,
  ResourceItem,
  Role,
  RoleId,
  Team,
  User,
  UserStatus,
  OnboardingRecord,
  LeaveRequest,
  AttendanceRecord,
  Holiday,
  ProbationRecord,
  ProbationNote,
  DeboardingRecord,
  ManagerHistoryEntry,
  Notification,
} from "@/core/operon";
import { DEFAULT_ROLE_ID } from "@/core/roles";
import { getSupabaseDiagnostics, supabase, isSupabaseConfigured as isSupabaseConfiguredLib } from "@/lib/supabase";
import { withTimeout } from "@/lib/async";
import { uploadFileToStorage } from "@/services/storage";
import { invalidateSearchIndex } from "@/services/search";
import { logDiagnostic } from "./observability/diagnostics";
import { type PendingUploadCacheItem } from "@/services/cache";
import { enqueueRetryUpload } from "@/services/sync/retryQueue";
import type { IngestionJob, IngestionResult, IngestionFailure } from "@/services/ingestion/types";

export type DataProviderMode = "local" | "supabase";
type ProviderHealthStatus = "connected" | "degraded" | "offline" | "fallback";

export interface ProviderHealth {
  status: ProviderHealthStatus;
  message: string;
  available: boolean;
  cacheApplied: boolean;
  lastCheckedAt: string;
  providerMode: DataProviderMode;
  effectiveProviderMode: DataProviderMode;
  isSupabaseConfigured: boolean;
  fallbackMode: boolean;
  diagnostics?: ReturnType<typeof getSupabaseDiagnostics>;
}

/**
 * This file manages the HR/roster domain (users, hr_*, hr_notifications,
 * hr_activity_log) plus a separate, unrelated set of entities that have no
 * live backing at all (documents, resources, drive_*, roles/departments/teams
 * catalogs, ingestion_*, videos, quick_actions) and stay on local mock data
 * permanently — there is no live schema for those and none is planned; see
 * the per-store comments near reconcileSupabaseData()/hydrateSupabaseCache().
 *
 * Identity lives directly on the Finance Dashboard's real public.users table
 * (not a parallel one). This is the SAME table src/services/documentPlatform.ts's
 * `workforce` schema already resolves identity against, just a different set
 * of columns/tables layered on top of it.
 */
const configuredForSupabase = isSupabaseConfiguredLib();
const productionEnforceSupabase = process.env.NODE_ENV === "production";
const DATA_HYDRATION_TIMEOUT_MS = 4000;
let dataProviderMode: DataProviderMode = configuredForSupabase ? "supabase" : productionEnforceSupabase ? "supabase" : "local";
let supabaseAvailable = false;
const cacheAvailable = false;
const pendingUploadStore: PendingUploadCacheItem[] = [];

if (!configuredForSupabase) {
  console.warn(
    "Supabase environment variables are missing or invalid. Local provider fallback is disabled in production; the app will remain offline until Supabase is configured."
  );
}

function isSupabaseConfigured() {
  return isSupabaseConfiguredLib();
}

function shouldUseSupabase() {
  return dataProviderMode === "supabase" && isSupabaseConfigured();
}

function isSupabaseAvailable() {
  return shouldUseSupabase() && supabaseAvailable;
}

function getDataProviderMode() {
  return dataProviderMode;
}

function getEffectiveDataProviderMode() {
  return dataProviderMode;
}

export function setDataProviderMode(mode: DataProviderMode) {
  if (mode === "local" && productionEnforceSupabase) {
    console.warn("Local provider mode is disabled in production. Supabase mode remains active.");
    return;
  }

  if (mode === "supabase" && !isSupabaseConfigured()) {
    if (!productionEnforceSupabase) {
      console.warn(
        "Supabase provider mode requested but Supabase is not configured. Staying in local provider mode."
      );
      dataProviderMode = "local";
    } else {
      console.warn(
        "Supabase provider mode requested but Supabase is not configured. Running in supabase offline mode with no local fallback."
      );
      dataProviderMode = "supabase";
    }
    return;
  }

  dataProviderMode = mode;
  if (mode === "supabase" && isSupabaseConfigured()) {
    ensureSupabaseHydration();
  }
}

function mapSupabaseRow<T>(row: Record<string, unknown>): T {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    let normalizedKey: string;

    if (key === "legacy_id") {
      normalizedKey = "id";
    } else if (key.endsWith("_legacy_id")) {
      normalizedKey = key
        .slice(0, -"_legacy_id".length)
        .replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()) + "Id";
    } else {
      normalizedKey = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    }

    mapped[normalizedKey] = value;
  }

  return mapped as T;
}

function mapSupabaseRows<T>(rows: Record<string, unknown>[]) {
  return rows.map(mapSupabaseRow) as T[];
}

function handleSupabaseError(error: unknown) {
  logDiagnostic({
    level: "warn",
    category: "supabase",
    message: "Supabase request failed",
    metadata: { error: String(error) },
  });
  console.warn("Supabase request failed", error);
  // Deliberately does NOT flip supabaseAvailable — several entity types in
  // this file (roles/departments/teams/documents/drive_*/resources/
  // ingestion_*/videos/quick_actions/uploads) have no live table at all and
  // never will (out of scope of the HR/users live-data work); one of their
  // writes failing must not cascade into disabling sync for the tables that
  // DO exist (users, hr_*). checkSupabaseConnectivity()/hydration already
  // independently gate supabaseAvailable at startup.
}

function safeSupabaseWrite(operation: () => unknown) {
  const result = operation();
  void Promise.resolve(result)
    .then((resultValue: unknown) => {
      if (resultValue !== null && typeof resultValue === "object" && "error" in resultValue && (resultValue as { error: unknown }).error) {
        handleSupabaseError((resultValue as { error: unknown }).error);
      }
    })
    .catch(handleSupabaseError);
}

function createUpsertPayload<T extends { id: string }>(payload: T) {
  return { ...payload, legacy_id: payload.id };
}

/**
 * public.users is a real, pre-existing Finance Dashboard table — its column
 * names (full_name, role, business_line, team_lead_id, team_name) don't match
 * the generic camelCase mapper, and its `id` is a real uuid primary key, not
 * a legacy_id. This is a dedicated mapper for that shape, separate from
 * src/auth/authAdapter.ts's own mapSupabaseUser (that one resolves "who's
 * logged in"; this one lists/writes the roster).
 */
function mapUserRow(row: Record<string, unknown>): User {
  return {
    id:            row.id as string,
    name:          (row.full_name as string | null) || (row.email as string) || "",
    email:         row.email as string,
    avatar:        "",
    userType:      "employee",
    roleId:        (row.role_id as string | null) ?? DEFAULT_ROLE_ID,
    departmentId:  (row.department_id as string | null) ?? undefined,
    teamId:        (row.department_id as string | null) ?? undefined,
    supervisorId:  (row.manager_user_id as string | null) ?? undefined,
    designationId: (row.designation_id as string | null) ?? undefined,
    permissionIds: [],
    createdById:   "",
    status:        (row.status as UserStatus | null) ?? "active",
    dateJoined:    (row.joined_at as string | null) ?? undefined,
  };
}

// HR tables use `user_id`/`*_by_id` style columns that don't match the
// generic camelCase spread createUpsertPayload relies on for other tables —
// these map explicitly so HR writes actually land on the right columns.
// IDs are real uuids now (public.hr_* tables), not legacy_id text.

function toHrOnboardingRow(record: OnboardingRecord) {
  return {
    id:                 record.id,
    user_id:            record.userId,
    status:             record.status,
    onboarding_data:    record.onboardingData,
    compliance_data:    record.complianceData,
    form11_sent_at:     record.form11SentAt ?? null,
    submitted_at:       record.submittedAt ?? null,
    acknowledged_by_id: record.acknowledgedById ?? null,
    acknowledged_at:    record.acknowledgedAt ?? null,
    completed_by_id:    record.completedById ?? null,
    completed_at:       record.completedAt ?? null,
    rejected_by_id:     record.rejectedById ?? null,
    rejected_at:        record.rejectedAt ?? null,
    rejection_reason:   record.rejectionReason ?? null,
    created_at:         record.createdAt,
  };
}

function toLeaveRequestRow(record: LeaveRequest) {
  return {
    id:                record.id,
    user_id:           record.userId,
    request_type:      record.requestType,
    date_from:         record.dateFrom,
    date_to:           record.dateTo,
    reason:            record.reason,
    additional_info:   record.additionalInfo ?? null,
    status:            record.status,
    rejection_reason:  record.rejectionReason ?? null,
    tl_approved_by_id: record.tlApprovedById ?? null,
    tl_approved_at:    record.tlApprovedAt ?? null,
    hr_approved_by_id: record.hrApprovedById ?? null,
    hr_approved_at:    record.hrApprovedAt ?? null,
    founder_notified:  record.founderNotified,
    created_at:        record.createdAt,
    updated_at:        record.updatedAt,
  };
}

function toAttendanceRow(record: AttendanceRecord) {
  return {
    id:         record.id,
    user_id:    record.userId,
    month:      record.month,
    days:       record.days,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toHolidayRow(record: Holiday) {
  return {
    id:            record.id,
    date:          record.date,
    name:          record.name,
    type:          record.type,
    created_by_id: record.createdById,
    created_at:    record.createdAt,
    updated_at:    record.updatedAt,
  };
}

function toProbationRow(record: ProbationRecord) {
  return {
    id:                        record.id,
    user_id:                   record.userId,
    date_joined:               record.dateJoined,
    probation_duration_days:   record.probationDurationDays,
    probation_duration_unit:   record.probationDurationUnit,
    expected_review_date:      record.expectedReviewDate,
    status:                    record.status,
    reviewed_by_id:            record.reviewedById ?? null,
    reviewed_at:               record.reviewedAt ?? null,
    parent_record_id:          record.parentRecordId ?? null,
    notes:                     null,
    submitted_by_id:           record.submittedById,
    created_at:                record.createdAt,
  };
}

function toManagerHistoryRow(record: ManagerHistoryEntry) {
  return {
    id:             record.id,
    user_id:        record.userId,
    supervisor_id:  record.supervisorId ?? null,
    changed_by_id:  record.changedById,
    effective_from: record.effectiveFrom,
    created_at:     record.createdAt,
  };
}

function toDeboardingRow(record: DeboardingRecord) {
  return {
    id:                     record.id,
    user_id:                record.userId,
    initiated_by_id:        record.initiatedById,
    track:                  record.track,
    status:                 record.status,
    reason:                 record.reason ?? null,
    initiated_at:           record.initiatedAt,
    approved_by_id:         record.approvedById ?? null,
    approved_at:            record.approvedAt ?? null,
    founder_approved_by_id: record.founderApprovedById ?? null,
    founder_approved_at:    record.founderApprovedAt ?? null,
    checklist:              record.checklist,
    completed_by_id:        record.completedById ?? null,
    completed_at:           record.completedAt ?? null,
    created_at:             record.createdAt,
  };
}

function toNotificationRow(notification: Notification) {
  return {
    id:                notification.id,
    title:             notification.title,
    body:              notification.body,
    notification_type: notification.notificationType,
    audience:          notification.audience,
    department_ids:    notification.departmentIds ?? null,
    role_ids:          notification.roleIds ?? null,
    user_ids:          notification.userIds ?? null,
    actor_id:          notification.actorId    ?? null,
    entity_type:       notification.entityType ?? null,
    entity_id:         notification.entityId   ?? null,
    metadata:          notification.metadata   ?? {},
    created_at:        notification.createdAt,
    expires_at:        notification.expiresAt  ?? null,
    unread_by:         notification.unreadBy   ?? [],
  };
}

async function checkSupabaseConnectivity() {
  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    type ConnResult = { data: { id: string }[] | null; error: { message: string } | null };
    const connFallback: ConnResult = { data: [], error: { message: "Supabase connectivity check timed out." } };
    const result = await withTimeout(
      supabase.schema("global").from("users").select("id").limit(1) as unknown as Promise<ConnResult>,
      DATA_HYDRATION_TIMEOUT_MS,
      connFallback
    );
    return !result.error;
  } catch (error) {
    console.warn("Supabase health check failed", error);
    return false;
  }
}

async function reconcileSupabaseData() {
  if (!isSupabaseAvailable()) {
    return;
  }

  try {
    await Promise.all([
      Promise.resolve({ data: null, error: null }),
    ]);
  } catch (error) {
    console.warn("Supabase reconciliation failed", error);
  }

  // roles/departments/teams/documents/drive_documents/resources/videos/
  // quick_actions/ingestion_* have no live table at all (out of scope —
  // stay on local mock permanently) and are deliberately NOT synced here.
  try {
    await Promise.allSettled([
      supabase.from("hr_onboarding").upsert(hrOnboardingStore.map(toHrOnboardingRow), { onConflict: "id" }),
      supabase.from("hr_leave_requests").upsert(hrLeaveRequestStore.map(toLeaveRequestRow), { onConflict: "id" }),
      supabase.from("hr_attendance").upsert(hrAttendanceStore.map(toAttendanceRow), { onConflict: "id" }),
      supabase.from("hr_holidays").upsert(hrHolidayStore.map(toHolidayRow), { onConflict: "id" }),
      supabase.from("hr_probation").upsert(hrProbationStore.map(toProbationRow), { onConflict: "id" }),
      supabase.from("hr_manager_history").upsert(hrManagerHistoryStore.map(toManagerHistoryRow), { onConflict: "id" }),
      supabase.from("hr_deboarding").upsert(hrDeboardingStore.map(toDeboardingRow), { onConflict: "id" }),
      supabase.from("hr_notifications").upsert(notificationStore.map(toNotificationRow), { onConflict: "id" }),
    ]);
  } catch (error) {
    console.warn("Optional Supabase reconciliation failed", error);
  }
}

function mergeEntitiesById<T extends { id: string }>(...collections: T[][]) {
  const merged = new Map<string, T>();
  collections.flat().forEach((item) => {
    merged.set(item.id, item);
  });
  return Array.from(merged.values());
}

function getProviderHealthState(): ProviderHealth {
  const lastCheckedAt = new Date().toISOString();
  const diagnostics = getSupabaseDiagnostics();

  const providerMode = getDataProviderMode();
  const effectiveProviderMode = getEffectiveDataProviderMode();
  const fallbackMode = productionEnforceSupabase ? false : !isSupabaseAvailable();

  if (!isSupabaseConfigured()) {
    return {
      status: productionEnforceSupabase ? "offline" : "fallback",
      message: productionEnforceSupabase
        ? "Supabase environment is not configured and local fallback is disabled in production."
        : diagnostics.message,
      available: false,
      cacheApplied: cacheAvailable,
      lastCheckedAt,
      providerMode,
      effectiveProviderMode,
      isSupabaseConfigured: diagnostics.configured,
      fallbackMode,
      diagnostics,
    };
  }

  if (supabaseAvailable) {
    return {
      status: "connected",
      message: "Connected to Supabase.",
      available: true,
      cacheApplied: cacheAvailable,
      lastCheckedAt,
      providerMode,
      effectiveProviderMode,
      isSupabaseConfigured: diagnostics.configured,
      fallbackMode,
      diagnostics,
    };
  }

  if (!supabaseHydrationComplete) {
    return {
      status: "degraded",
      message: "Checking Supabase availability.",
      available: false,
      cacheApplied: cacheAvailable,
      lastCheckedAt,
      providerMode,
      effectiveProviderMode,
      isSupabaseConfigured: diagnostics.configured,
      fallbackMode,
      diagnostics,
    };
  }

  return {
    status: "offline",
    message: productionEnforceSupabase
      ? "Supabase is unavailable and local fallback has been disabled in production."
      : diagnostics.message || "Supabase is unavailable. Serving cached or local fallback data.",
    available: false,
    cacheApplied: cacheAvailable,
    lastCheckedAt,
    providerMode,
    effectiveProviderMode,
    isSupabaseConfigured: diagnostics.configured,
    fallbackMode,
    diagnostics,
  };
}

export function getProviderHealth() {
  return getProviderHealthState();
}


// Mirrors the live 5-value public.user_role enum. The former 16-role catalog
// collapsed into these, losing separation-of-duties/granularity in the process.
// Each role's permissions are the union of every legacy role that merged
// into it (a merge never removes a capability a constituent role had).
// `userType` here is vestigial (creator-vs-employee is now User.userType,
// not a role property) — kept "employee" on every entry for shape compatibility.
const ROLES: Role[] = [
  {
    id: "admin",
    name: "Admin",
    description: "Full platform owner with unrestricted access (formerly Cofounder, HR, HR Executive).",
    group: "leadership",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: true, view: true, edit: true, delete: true, upload: true },
      users: { create: true, edit: true, delete: true, assignRole: true },
      system: { adminPanelAccess: true, roleManagement: true },
      features: {
        viewActivity: true,
        viewResources: true,
        manageResources: true,
        sendToAll: true,
        viewHr: true,
        viewOnboarding: true,
        viewCreatorOps: true,
        viewBrand: true,
        viewOperations: true,
        approveLeaveTl: true,
        approveLeaveHr: true,
        manageHrCalendar: true,
        viewHrRecordsAll: true,
        submitProbationReview: true,
        decideProbationReview: true,
        acknowledgeDeboarding: true,
        approveDeboardingEmployeeTrack: true,
        flagDeboardingAny: true,
        viewTeamLeaveHistory: true,
        managePeople: true,
        manageOnboarding: true,
      },
    },
  },
  {
    id: "team_lead",
    name: "Team Lead",
    description: "Team and leave management (formerly Senior TM, Category Lead, IM/TM Team Lead).",
    group: "team_lead",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: true, view: true, edit: true, delete: true, upload: true },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewActivity: true,
        viewResources: true,
        manageResources: true,
        viewBrand: true,
        viewOperations: true,
        viewCreatorOps: true,
        sendToAll: true,
        approveLeaveTl: true,
        viewTeamLeaveHistory: true,
        managePeople: true,
      },
    },
  },
  {
    id: "finance",
    name: "Finance",
    description: "SOPs, reporting and approvals (formerly Finance Manager, Finance Associate).",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: true, view: true, edit: true, delete: false, upload: true },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewActivity: true,
        viewOperations: true,
        viewResources: true,
        manageResources: true,
        sendToAll: true,
        approveLeaveTl: true,
        viewTeamLeaveHistory: true,
        managePeople: true,
      },
    },
  },
  {
    id: "employee",
    name: "Employee",
    description: "Standard team member access (formerly Creator Acquisition, TM/IM Associate, IM Executive, Sales Executive, Intern, Content Creator).",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewResources: true,
        viewBrand: true,
        viewCreatorOps: true,
        viewOperations: true,
        viewOnboarding: true,
      },
    },
  },
  {
    id: "developer",
    name: "Developer",
    description: "Engineering tooling access. No legacy-role equivalent — new to the live 5-role enum.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewResources: true,
      },
    },
  },
];

const DEPARTMENTS: Department[] = [
  { id: "im", name: "Influencer Marketing" },
  { id: "tm", name: "Talent Management" },
  { id: "hr", name: "HR" },
  { id: "finance", name: "Finance" },
  { id: "sales", name: "Sales" },
  { id: "onboarding", name: "Onboarding" },
  { id: "creator", name: "Creator Ops" },
  { id: "brand", name: "Brand Management" },
  { id: "operations", name: "Operations" },
];

const TEAMS: Team[] = [
  { id: "team_im", name: "Influencer Marketing", departmentId: "im" },
  { id: "team_tm", name: "Talent Management", departmentId: "tm" },
  { id: "team_sales", name: "Sales", departmentId: "sales" },
  { id: "team_hr", name: "HR Operations", departmentId: "hr" },
  { id: "team_finance", name: "Finance Operations", departmentId: "finance" },
];

const USERS: User[] = [
  {
    id: "u1",
    name: "Sarah Adams",
    email: "sarah@example.com",
    avatar: "SA",
    userType: "employee",
    roleId: "admin",
    departmentId: "operations",
    permissionIds: [
      "view_library",
      "view_documents",
      "add_documents",
      "edit_documents",
      "delete_documents",
      "manage_team_documents",
      "manage_users",
      "manage_roles",
      "manage_uploads",
      "view_activity",
      "view_resources",
      "manage_resources",
      "view_hr",
      "view_onboarding",
      "view_creator_ops",
      "view_brand",
      "view_operations",
    ],
    createdById: "u1",
    status: "active",
    dateJoined: "2021-01-04",
  },
  {
    id: "u2",
    name: "Maya Patel",
    email: "maya@example.com",
    avatar: "MP",
    userType: "employee",
    roleId: "team_lead",
    departmentId: "im",
    teamId: "team_im",
    permissionIds: [
      "view_library",
      "view_documents",
      "add_documents",
      "edit_documents",
      "delete_documents",
      "manage_team_documents",
      "manage_uploads",
      "view_creator_ops",
      "view_operations",
      "view_resources",
    ],
    createdById: "u1",
    status: "active",
    dateJoined: "2021-06-14",
  },
  {
    id: "u3",
    name: "Lucas Kim",
    email: "lucas@example.com",
    avatar: "LK",
    userType: "employee",
    roleId: "team_lead",
    departmentId: "tm",
    teamId: "team_tm",
    permissionIds: [
      "view_library",
      "view_documents",
      "add_documents",
      "edit_documents",
      "delete_documents",
      "manage_team_documents",
      "manage_uploads",
      "view_brand",
      "view_operations",
      "view_resources",
    ],
    createdById: "u1",
    status: "active",
    dateJoined: "2021-09-01",
  },
  {
    id: "u4",
    name: "James Chen",
    email: "james@example.com",
    avatar: "JC",
    userType: "employee",
    roleId: "employee",
    departmentId: "im",
    teamId: "team_im",
    permissionIds: ["view_library", "view_documents", "view_creator_ops", "view_resources"],
    createdById: "u2",
    status: "active",
    dateJoined: "2022-02-21",
  },
  {
    id: "u5",
    name: "Ava Liu",
    email: "ava@example.com",
    avatar: "AL",
    userType: "employee",
    roleId: "employee",
    departmentId: "tm",
    teamId: "team_tm",
    permissionIds: ["view_library", "view_documents", "view_brand", "view_resources"],
    createdById: "u3",
    status: "active",
    dateJoined: "2022-05-09",
  },
  {
    id: "u6",
    name: "Noah Reed",
    email: "noah@example.com",
    avatar: "NR",
    userType: "employee",
    roleId: "admin",
    departmentId: "hr",
    teamId: "team_hr",
    permissionIds: [
      "view_library",
      "view_documents",
      "view_hr",
      "view_onboarding",
      "view_resources",
      "manage_resources",
      "send_to_all",
    ],
    createdById: "u1",
    status: "active",
    dateJoined: "2021-11-15",
  },
  {
    id: "u8",
    name: "Evelyn Brooks",
    email: "evelyn@example.com",
    avatar: "EB",
    userType: "employee",
    roleId: "finance",
    departmentId: "finance",
    teamId: "team_finance",
    permissionIds: [
      "view_library",
      "view_documents",
      "add_documents",
      "send_to_all",
      "view_resources",
    ],
    createdById: "u1",
    status: "active",
    dateJoined: "2022-08-03",
  },
  {
    id: "u7",
    name: "Jade Rivera",
    email: "jade@example.com",
    avatar: "JR",
    userType: "creator",
    roleId: "employee",
    permissionIds: ["view_library", "view_documents", "view_creator_ops", "view_resources"],
    createdById: "u1",
    status: "active",
  },
];

const DOCUMENTS: Document[] = [];

const RESOURCES: ResourceItem[] = [];

const ACTIVITY_LOG: ActivityEvent[] = [];

// roles/departments/teams/documents/drive_documents/resources/activity have
// no live table at all — always local, regardless of Supabase configuration
// (only `users` and the hr_* tables actually go live; see reconcileSupabaseData).
const roleStore: Role[] = [...ROLES];
const userStore: User[] = configuredForSupabase ? [] : [...USERS];
const departmentStore: Department[] = [...DEPARTMENTS];
const teamStore: Team[] = [...TEAMS];
const documentStore: Document[] = [...DOCUMENTS];

const DRIVE_DOCUMENT_REFS: DriveDocumentReference[] = [];

const driveDocumentStore: DriveDocumentReference[] = [...DRIVE_DOCUMENT_REFS];
const resourceStore: ResourceItem[] = [...RESOURCES];
const activityStore: ActivityEvent[] = [...ACTIVITY_LOG];
const ingestionJobStore: IngestionJob[] = [];
const ingestionResultStore: IngestionResult[] = [];
const ingestionFailureStore: IngestionFailure[] = [];
const hrOnboardingStore: OnboardingRecord[] = [];
const hrLeaveRequestStore: LeaveRequest[] = [];
const hrAttendanceStore: AttendanceRecord[] = [];
const hrHolidayStore: Holiday[] = [];
const hrProbationStore: ProbationRecord[] = [];
const hrProbationNoteStore: ProbationNote[] = [];
const hrManagerHistoryStore: ManagerHistoryEntry[] = [];
const hrDeboardingStore: DeboardingRecord[] = [];
const notificationStore: Notification[] = [];

let supabaseHydrationStarted = false;
let supabaseHydrationComplete = false;
const dataChangeListeners: Array<() => void> = [];
const hydrationListeners: Array<() => void> = [];

function notifyDataChange() {
  dataChangeListeners.slice().forEach((listener) => listener());
}

function notifyHydrationComplete() {
  supabaseHydrationComplete = true;
  hydrationListeners.slice().forEach((listener) => listener());
  notifyDataChange();
}

async function hydrateSupabaseCache() {
  if (!shouldUseSupabase()) {
    supabaseAvailable = false;
    notifyHydrationComplete();
    return;
  }

  const connectionHealthy = await checkSupabaseConnectivity();
  if (!connectionHealthy) {
    supabaseAvailable = false;
    notifyHydrationComplete();
    return;
  }

  // Supabase is reachable. Keep the app in Supabase mode while cached data hydrates.
  supabaseAvailable = true;

  // Typed helper to avoid `as any` on every withTimeout call.
  // Supabase query builders don't expose a plain Promise type we can reference
  // without the full generics, so we cast via `unknown` at a single boundary.
  function timedFetch(table: string, errMessage: string) {
    type RowResult = { data: Record<string, unknown>[] | null; error: { message: string } | null };
    const fallback: RowResult = { data: [], error: { message: errMessage } };
    return withTimeout(
      supabase.schema("global").from(table).select("*").limit(1000) as unknown as Promise<RowResult>,
      DATA_HYDRATION_TIMEOUT_MS,
      fallback
    );
  }

  try {
    // Only `users` and the hr_* tables have a live backing — see the header
    // comment near legacySchemaLive. roles/departments/teams/documents/
    // drive_documents/resources/activity_logs/videos/quick_actions/
    // ingestion_* are deliberately never fetched from Supabase; their stores
    // stay on local mock data unconditionally (see the store-init block above).
    const [usersRes, hrOnboardingRes, hrLeaveRes, hrAttendanceRes, hrHolidaysRes, hrProbationRes, hrManagerHistoryRes, hrDeboardingRes, notificationsRes] = await Promise.all([
      timedFetch("users", "Supabase users fetch timed out."),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
    ]);

    if (usersRes.error) {
      console.warn("Supabase hydration encountered errors", { usersError: usersRes.error });
      supabaseAvailable = false;
      return;
    }

    const optionalHydrationIssues = [
      { name: "hr_onboarding", success: Array.isArray(hrOnboardingRes) },
      { name: "hr_leave_requests", success: Array.isArray(hrLeaveRes) },
      { name: "hr_attendance", success: Array.isArray(hrAttendanceRes) },
      { name: "hr_holidays", success: Array.isArray(hrHolidaysRes) },
      { name: "hr_probation", success: Array.isArray(hrProbationRes) },
      { name: "hr_manager_history", success: Array.isArray(hrManagerHistoryRes) },
      { name: "hr_deboarding", success: Array.isArray(hrDeboardingRes) },
      { name: "hr_notifications", success: Array.isArray(notificationsRes) },
    ].filter((entry) => !entry.success);

    if (optionalHydrationIssues.length > 0) {
      console.warn("Supabase hydration completed with optional table issues", {
        issues: optionalHydrationIssues.map((issue) => issue.name),
      });
    }

    supabaseAvailable = true;

    if (Array.isArray(usersRes.data)) {
      userStore.splice(0, userStore.length, ...mergeEntitiesById(userStore, usersRes.data.map(mapUserRow)));
    }

    if (Array.isArray(hrOnboardingRes)) {
      hrOnboardingStore.splice(0, hrOnboardingStore.length, ...mergeEntitiesById(hrOnboardingStore, mapSupabaseRows<OnboardingRecord>(hrOnboardingRes)));
    }

    if (Array.isArray(hrLeaveRes)) {
      hrLeaveRequestStore.splice(0, hrLeaveRequestStore.length, ...mergeEntitiesById(hrLeaveRequestStore, mapSupabaseRows<LeaveRequest>(hrLeaveRes)));
    }

    if (Array.isArray(hrAttendanceRes)) {
      hrAttendanceStore.splice(0, hrAttendanceStore.length, ...mergeEntitiesById(hrAttendanceStore, mapSupabaseRows<AttendanceRecord>(hrAttendanceRes)));
    }

    if (Array.isArray(hrHolidaysRes)) {
      hrHolidayStore.splice(0, hrHolidayStore.length, ...mergeEntitiesById(hrHolidayStore, mapSupabaseRows<Holiday>(hrHolidaysRes)));
    }

    if (Array.isArray(hrProbationRes)) {
      hrProbationStore.splice(0, hrProbationStore.length, ...mergeEntitiesById(hrProbationStore, mapSupabaseRows<ProbationRecord>(hrProbationRes)));
    }

    if (Array.isArray(hrManagerHistoryRes)) {
      hrManagerHistoryStore.splice(0, hrManagerHistoryStore.length, ...mergeEntitiesById(hrManagerHistoryStore, mapSupabaseRows<ManagerHistoryEntry>(hrManagerHistoryRes)));
    }

    if (Array.isArray(hrDeboardingRes)) {
      hrDeboardingStore.splice(0, hrDeboardingStore.length, ...mergeEntitiesById(hrDeboardingStore, mapSupabaseRows<DeboardingRecord>(hrDeboardingRes)));
    }

    if (Array.isArray(notificationsRes)) {
      notificationStore.splice(0, notificationStore.length, ...mergeEntitiesById(notificationStore, mapSupabaseRows<Notification>(notificationsRes)));
    }
    await reconcileSupabaseData();
  } catch (error) {
    console.warn("Supabase hydration failed", error);
    supabaseAvailable = false;
  } finally {
    notifyHydrationComplete();
  }
}

function ensureSupabaseHydration() {
  if (!shouldUseSupabase() || supabaseHydrationStarted) {
    return;
  }
  supabaseHydrationStarted = true;
  void hydrateSupabaseCache();
}


export function onSupabaseHydrated(callback: () => void) {
  ensureSupabaseHydration();
  if (!shouldUseSupabase() || supabaseHydrationComplete) {
    callback();
    return () => undefined;
  }

  hydrationListeners.push(callback);
  return () => {
    const index = hydrationListeners.indexOf(callback);
    if (index !== -1) hydrationListeners.splice(index, 1);
  };
}

export function subscribeToDataUpdates(callback: () => void) {
  dataChangeListeners.push(callback);
  return () => {
    const index = dataChangeListeners.indexOf(callback);
    if (index !== -1) dataChangeListeners.splice(index, 1);
  };
}

export function getRoles() {
  ensureSupabaseHydration();
  return roleStore;
}

export function getRoleById(id: RoleId) {
  ensureSupabaseHydration();
  const role = roleStore.find((role) => role.id === id);
  if (role) {
    return role;
  }

  if (id) {
    console.warn(`Role lookup failed for '${id}', falling back to '${DEFAULT_ROLE_ID}'.`);
  }

  return roleStore.find((role) => role.id === DEFAULT_ROLE_ID) ?? roleStore[0] ?? null;
}

export function saveRole(role: Role) {
  const existing = getRoleById(role.id);
  if (existing) {
    Object.assign(existing, role);
  } else {
    roleStore.unshift(role);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("roles").upsert(createUpsertPayload(role), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || role;
}

export function deleteRole(roleId: RoleId) {
  const index = roleStore.findIndex((role) => role.id === roleId);
  if (index === -1) return false;
  roleStore.splice(index, 1);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("roles").delete().eq("legacy_id", roleId));
  }
  notifyDataChange();
  return true;
}

export function getDepartments() {
  ensureSupabaseHydration();
  return departmentStore;
}

export function getDepartmentById(id: DeptId) {
  ensureSupabaseHydration();
  return departmentStore.find((department) => department.id === id);
}

export function getTeams() {
  ensureSupabaseHydration();
  return teamStore;
}

export function getUsers() {
  ensureSupabaseHydration();
  return userStore;
}

export function getUserById(id: string) {
  ensureSupabaseHydration();
  return userStore.find((user) => user.id === id);
}

/**
 * Registers an MVP/role-picker demo user in the in-memory user store only —
 * never synced to Supabase. Lets the rest of the write path (which re-resolves
 * the actor via getUserById) recognize a local-only identity that was never
 * persisted, without weakening the checks themselves.
 */
export function registerLocalUser(user: User) {
  const existing = userStore.find((u) => u.id === user.id);
  if (existing) {
    Object.assign(existing, user);
  } else {
    userStore.unshift(user);
  }
  return user;
}


export function getDocuments() {
  ensureSupabaseHydration();
  return documentStore;
}

export function getDocumentById(id: string) {
  ensureSupabaseHydration();
  return documentStore.find((document) => document.id === id);
}

export function getDriveDocuments() {
  ensureSupabaseHydration();
  return driveDocumentStore;
}

export function getDriveDocumentById(id: string) {
  ensureSupabaseHydration();
  return driveDocumentStore.find((document) => document.id === id);
}

export function saveDriveDocumentReference(document: DriveDocumentReference) {
  const existing = getDriveDocumentById(document.id);
  if (existing) {
    Object.assign(existing, document);
  } else {
    driveDocumentStore.unshift(document);
  }

  if (isSupabaseAvailable()) {
    const payload = createUpsertPayload(document) as unknown as Record<string, unknown>;
    const { documentVersionId, ...payloadWithoutVersion } = payload;
    void safeSupabaseWrite(() => supabase.from("drive_documents").upsert(payloadWithoutVersion, { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || document;
}

export function updateDriveDocumentSyncMetadata(
  id: string,
  updates: Partial<Pick<DriveDocumentReference, "lastSyncedAt" | "lastDriveModifiedAt" | "lastDriveCreatedAt" | "syncStatus" | "version" | "updatedAt" | "updatedById">>
) {
  const document = getDriveDocumentById(id);
  if (!document) return undefined;
  Object.assign(document, updates);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("drive_documents").update(updates).eq("legacy_id", id));
  }
  notifyDataChange();
  return document;
}


export async function fetchGoogleDocsApiDocument(googleDocId: string): Promise<GoogleDocsApiDocument> {
  const response = await fetch(`/api/drive?action=docs&docId=${encodeURIComponent(googleDocId)}`, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to fetch Google Docs document: ${body}`);
  }

  return response.json() as Promise<GoogleDocsApiDocument>;
}

export function getResources() {
  ensureSupabaseHydration();
  return resourceStore;
}

export function getResourceById(id: string) {
  ensureSupabaseHydration();
  return resourceStore.find((resource) => resource.id === id);
}

export function getActivityEvents() {
  ensureSupabaseHydration();
  return activityStore;
}

export function getOnboardingRecords() {
  ensureSupabaseHydration();
  return hrOnboardingStore;
}

export function getOnboardingRecordById(id: string) {
  ensureSupabaseHydration();
  return hrOnboardingStore.find((record) => record.id === id);
}

export function getLeaveRequests() {
  ensureSupabaseHydration();
  return hrLeaveRequestStore;
}

export function getLeaveRequestById(id: string) {
  ensureSupabaseHydration();
  return hrLeaveRequestStore.find((request) => request.id === id);
}

export function getAttendanceRecords() {
  ensureSupabaseHydration();
  return hrAttendanceStore;
}

export function getHolidays() {
  ensureSupabaseHydration();
  return hrHolidayStore;
}

export function getProbationRecords() {
  ensureSupabaseHydration();
  return hrProbationStore;
}

export function getProbationRecordById(id: string) {
  ensureSupabaseHydration();
  return hrProbationStore.find((record) => record.id === id);
}

export function getManagerHistory() {
  ensureSupabaseHydration();
  return hrManagerHistoryStore;
}

export function getDeboardingRecords() {
  ensureSupabaseHydration();
  return hrDeboardingStore;
}

export function getDeboardingRecordById(id: string) {
  ensureSupabaseHydration();
  return hrDeboardingStore.find((record) => record.id === id);
}

export function getNotifications() {
  ensureSupabaseHydration();
  return notificationStore;
}

export function getIngestionJobs() {
  ensureSupabaseHydration();
  return ingestionJobStore;
}

function getIngestionJobById(id: string) {
  ensureSupabaseHydration();
  return ingestionJobStore.find((job) => job.id === id);
}

function getIngestionResults() {
  ensureSupabaseHydration();
  return ingestionResultStore;
}

function getIngestionFailures() {
  ensureSupabaseHydration();
  return ingestionFailureStore;
}

export function saveIngestionJob(job: IngestionJob) {
  const existing = getIngestionJobById(job.id);
  const persistedJob = { ...job, file: undefined };
  if (existing) {
    Object.assign(existing, persistedJob);
  } else {
    ingestionJobStore.unshift(persistedJob);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("ingestion_jobs").upsert(createUpsertPayload(persistedJob), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || job;
}

export function saveIngestionResult(result: IngestionResult) {
  const existing = getIngestionResults().find((item) => item.id === result.id);
  if (existing) {
    Object.assign(existing, result);
  } else {
    ingestionResultStore.unshift(result);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("ingestion_results").upsert(createUpsertPayload(result), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || result;
}

export function saveIngestionFailure(failure: IngestionFailure) {
  const existing = getIngestionFailures().find((item) => item.id === failure.id);
  if (existing) {
    Object.assign(existing, failure);
  } else {
    ingestionFailureStore.unshift(failure);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("ingestion_failures").upsert(createUpsertPayload(failure), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || failure;
}

export function saveDocument(document: Document) {
  const existing = getDocumentById(document.id);
  if (existing) {
    Object.assign(existing, document);
  } else {
    documentStore.unshift(document);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("documents").upsert(createUpsertPayload(document), { onConflict: "legacy_id" }));
  }

  invalidateSearchIndex();
  notifyDataChange();
  return existing || document;
}

export function saveResource(resource: ResourceItem) {
  const existing = getResourceById(resource.id);
  if (existing) {
    Object.assign(existing, resource);
  } else {
    resourceStore.unshift(resource);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("resources").upsert(createUpsertPayload(resource), { onConflict: "legacy_id" }));
  }

  invalidateSearchIndex();
  notifyDataChange();
  return existing || resource;
}

export function saveActivity(event: ActivityEvent) {
  activityStore.unshift(event);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("activity_logs").insert(createUpsertPayload(event)));
  }
  notifyDataChange();
  return event;
}

export function saveOnboardingRecord(record: OnboardingRecord) {
  const existing = getOnboardingRecordById(record.id);
  if (existing) {
    Object.assign(existing, record);
  } else {
    hrOnboardingStore.unshift(record);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_onboarding").upsert(toHrOnboardingRow(record), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || record;
}

export function saveLeaveRequest(request: LeaveRequest) {
  const existing = getLeaveRequestById(request.id);
  if (existing) {
    Object.assign(existing, request);
  } else {
    hrLeaveRequestStore.unshift(request);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_leave_requests").upsert(toLeaveRequestRow(request), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || request;
}

export function saveAttendanceRecord(record: AttendanceRecord) {
  const existing = hrAttendanceStore.find((r) => r.id === record.id);
  if (existing) {
    Object.assign(existing, record);
  } else {
    hrAttendanceStore.unshift(record);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_attendance").upsert(toAttendanceRow(record), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || record;
}

export function saveHoliday(holiday: Holiday) {
  const existing = hrHolidayStore.find((h) => h.id === holiday.id);
  if (existing) {
    Object.assign(existing, holiday);
  } else {
    hrHolidayStore.unshift(holiday);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_holidays").upsert(toHolidayRow(holiday), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || holiday;
}

export function saveProbationRecord(record: ProbationRecord) {
  const existing = getProbationRecordById(record.id);
  if (existing) {
    Object.assign(existing, record);
  } else {
    hrProbationStore.unshift(record);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_probation").upsert(toProbationRow(record), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || record;
}

export function saveManagerHistoryEntry(entry: ManagerHistoryEntry) {
  hrManagerHistoryStore.unshift(entry);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_manager_history").upsert(toManagerHistoryRow(entry), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return entry;
}

export function saveDeboardingRecord(record: DeboardingRecord) {
  const existing = getDeboardingRecordById(record.id);
  if (existing) {
    Object.assign(existing, record);
  } else {
    hrDeboardingStore.unshift(record);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_deboarding").upsert(toDeboardingRow(record), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || record;
}

export function saveNotification(notification: Notification) {
  const existing = notificationStore.find((n) => n.id === notification.id);
  if (existing) {
    Object.assign(existing, notification);
  } else {
    notificationStore.unshift(notification);
  }

  if (isSupabaseAvailable()) {
    // Legacy notification mirroring disabled; use workforce notification RPCs.
  }
  notifyDataChange();
  return existing || notification;
}

// ─── Leave Balances ──────────────────────────────────────────────────────────





// ─── Attendance Audit ────────────────────────────────────────────────────────




// ─── Probation Notes ─────────────────────────────────────────────────────────



export function saveProbationNote(note: ProbationNote): ProbationNote {
  hrProbationNoteStore.unshift(note);
  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() =>
      supabase.from("hr_probation_notes").insert({
        legacy_id:           note.id,
        probation_record_id: note.probationRecordId,
        author_id:           note.authorId,
        note:                note.note,
        note_type:           note.noteType,
        created_at:          note.createdAt,
      }),
    );
  }
  notifyDataChange();
  return note;
}

export function deleteHoliday(holidayId: string) {
  const index = hrHolidayStore.findIndex((holiday) => holiday.id === holidayId);
  if (index === -1) return false;
  hrHolidayStore.splice(index, 1);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("hr_holidays").delete().eq("legacy_id", holidayId));
  }
  notifyDataChange();
  return true;
}






export async function saveUploadFileToStorage(
  file: File,
  authorId: string,
  options?: {
    tag?: DocTag;
    departmentId?: DeptId;
  }
) {
  if (!isSupabaseAvailable()) {
    const pendingUpload: PendingUploadCacheItem = {
      id: `upload-${Date.now()}`,
      fileName: file.name,
      tag: options?.tag,
      departmentId: options?.departmentId,
      authorId,
      createdAt: new Date().toISOString(),
      syncPending: true,
    };

    pendingUploadStore.unshift(pendingUpload);
    enqueueRetryUpload(pendingUpload);
    return {
      rawSourceUrl: undefined,
      previewUrl: undefined,
      mimeType: file.type || undefined,
      storageBucket: undefined,
      storagePath: undefined,
      storageSize: undefined,
      uploadedBy: authorId,
      syncPending: true,
      uploadQueueId: pendingUpload.id,
    };
  }

  const uploadMetadata = await uploadFileToStorage(file, authorId, {
    tag: options?.tag,
    departmentId: options?.departmentId,
  });

  if (!uploadMetadata) {
    const pendingUpload: PendingUploadCacheItem = {
      id: `upload-${Date.now()}`,
      fileName: file.name,
      tag: options?.tag,
      departmentId: options?.departmentId,
      authorId,
      createdAt: new Date().toISOString(),
      syncPending: true,
      error: "Storage upload failed. The file will retry when the connection is restored.",
    };
    pendingUploadStore.unshift(pendingUpload);
    enqueueRetryUpload(pendingUpload);
    return {
      rawSourceUrl: undefined,
      previewUrl: undefined,
      mimeType: file.type || undefined,
      storageBucket: undefined,
      storagePath: undefined,
      storageSize: undefined,
      uploadedBy: authorId,
      syncPending: true,
      uploadQueueId: pendingUpload.id,
      error: pendingUpload.error,
    };
  }

  const uploadRecord = {
    id: `upload-${Date.now()}`,
    fileName: uploadMetadata.fileName,
    storageBucket: uploadMetadata.bucket,
    storagePath: uploadMetadata.path,
    publicUrl: uploadMetadata.publicUrl,
    previewUrl: uploadMetadata.previewUrl ?? null,
    mimeType: uploadMetadata.mimeType || null,
    size: uploadMetadata.size,
    uploadedBy: uploadMetadata.uploadedBy,
    authorId,
    createdAt: new Date().toISOString(),
  };

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("uploads").upsert(createUpsertPayload(uploadRecord), { onConflict: "legacy_id" }));
  }
  return {
    rawSourceUrl: uploadMetadata.publicUrl || undefined,
    previewUrl: uploadMetadata.previewUrl ?? undefined,
    mimeType: uploadMetadata.mimeType || undefined,
    storageBucket: uploadMetadata.bucket,
    storagePath: uploadMetadata.path,
    storageSize: uploadMetadata.size,
    uploadedBy: uploadMetadata.uploadedBy,
    syncPending: false,
  };
}



export function saveUser(user: User) {
  const existing = getUserById(user.id);
  if (existing) {
    Object.assign(existing, user);
  } else {
    userStore.unshift(user);
  }

  if (isSupabaseAvailable()) {
    // Identity writes are owned by global administration, never browser clients.
  }
  notifyDataChange();
  return existing || user;
}

