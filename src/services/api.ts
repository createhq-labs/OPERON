import type {
  ActivityEvent,
  Department,
  DeptId,
  Document,
  DocTag,
  DriveDocumentReference,
  DriveDocumentPermission,
  GoogleDocsApiDocument,
  PermissionId,
  QuickActionItem,
  ResourceCategory,
  ResourceItem,
  Role,
  RoleId,
  Team,
  User,
  UserType,
  VideoItem,
} from "@/core/operon";
import { ROLE_IDS } from "@/core/roles";
import { getSupabaseDiagnostics, supabase, isSupabaseConfigured as isSupabaseConfiguredLib } from "@/lib/supabase";
import { withTimeout } from "@/lib/async";
import { uploadFileToStorage } from "@/services/storage";
import { invalidateSearchIndex } from "@/services/search";
import { logDiagnostic } from "./observability/diagnostics";
import { type PendingUploadCacheItem } from "@/services/cache";
import { enqueueRetryUpload } from "@/services/sync/retryQueue";
import type { IngestionJob, IngestionResult, IngestionFailure } from "@/services/ingestion/types";

export type DataProviderMode = "local" | "supabase";
export type ProviderHealthStatus = "connected" | "degraded" | "offline" | "fallback";

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

export function isSupabaseConfigured() {
  return isSupabaseConfiguredLib();
}

function shouldUseSupabase() {
  return dataProviderMode === "supabase" && isSupabaseConfigured();
}

function isSupabaseAvailable() {
  return shouldUseSupabase() && supabaseAvailable;
}

export function getDataProviderMode() {
  return dataProviderMode;
}

export function getEffectiveDataProviderMode() {
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
  supabaseAvailable = false;
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

async function safeFetchSupabaseTable(table: string) {
  type FetchResult = { data: Record<string, unknown>[] | null; error: { message: string } | null };
  const fallback: FetchResult = { data: [], error: { message: "Supabase table fetch timed out." } };
  try {
    const result = await withTimeout(
      supabase.from(table).select("*").limit(1000) as unknown as Promise<FetchResult>,
      DATA_HYDRATION_TIMEOUT_MS,
      fallback
    );

    if (result.error || !Array.isArray(result.data)) {
      if (result.error) {
        console.warn(`Supabase optional table fetch failed for '${table}'`, result.error);
      }
      return null;
    }
    return result.data;
  } catch (error) {
    console.warn(`Supabase optional table fetch failed for '${table}'`, error);
    return null;
  }
}

function createUpsertPayload<T extends { id: string }>(payload: T) {
  return { ...payload, legacy_id: payload.id };
}

async function checkSupabaseConnectivity() {
  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    type ConnResult = { data: { id: string }[] | null; error: { message: string } | null };
    const connFallback: ConnResult = { data: [], error: { message: "Supabase connectivity check timed out." } };
    const result = await withTimeout(
      supabase.from("roles").select("id").limit(1) as unknown as Promise<ConnResult>,
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
      supabase.from("roles").upsert(roleStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("users").upsert(userStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("departments").upsert(departmentStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("teams").upsert(teamStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("documents").upsert(documentStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("drive_documents").upsert(driveDocumentStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("resources").upsert(resourceStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("activity_logs").upsert(activityStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("ingestion_jobs").upsert(ingestionJobStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("ingestion_results").upsert(ingestionResultStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("ingestion_failures").upsert(ingestionFailureStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
    ]);
  } catch (error) {
    console.warn("Supabase reconciliation failed", error);
  }

  try {
    await Promise.allSettled([
      supabase.from("videos").upsert(videoStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
      supabase.from("quick_actions").upsert(quickActionStore.map(createUpsertPayload), { onConflict: "legacy_id" }),
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

export function isSyncAvailable() {
  return supabaseAvailable;
}

const ROLES: Role[] = [
  {
    id: "role_cofounder",
    name: "Co-Founder / Admin",
    description: "Full platform owner with unrestricted access.",
    group: "co_founders",
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
      },
    },
  },
  {
    id: "role_im_team_lead",
    name: "IM Team Lead",
    description: "Manages IM team, SOPs, and documentation. No access to TM content.",
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
        viewCreatorOps: true,
        viewOperations: true,
        viewBrand: false,
        sendToAll: true,
      },
    },
  },
  {
    id: "role_tm_team_lead",
    name: "TM Team Lead",
    description: "Manages TM team, SOPs, and documentation. No access to IM content.",
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
        viewCreatorOps: false,
        sendToAll: true,
      },
    },
  },
  {
    id: "role_hr",
    name: "HR Manager",
    description: "Independent management of onboarding, policies, and compliance.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { 
        create: true, 
        view: true, 
        edit: true, 
        delete: false, 
        upload: true 
      },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewHr: true,
        viewOnboarding: true,
        viewResources: true,
        manageResources: true,
        sendToAll: true,
      },
    },
  },
  {
    id: "role_finance",
    name: "Finance Manager",
    description: "Independent management of finance SOPs and reporting workflows.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { 
        create: true, 
        view: true, 
        edit: true, 
        delete: false, 
        upload: true 
      },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewOperations: true,
        viewResources: true,
        manageResources: true,
        sendToAll: true,
      },
    },
  },
  {
    id: "role_intern",
    name: "Intern",
    description: "Restricted access to onboarding and training materials.",
    group: "intern",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewOnboarding: true,
        viewResources: true,
      },
    },
  },
  {
    id: "role_creator",
    name: "Creator",
    description: "Independent role managing marketing assets and brand resources.",
    group: "creator",
    userType: "creator",
    createdById: "system",
    permissions: {
      documents: { 
        create: true, 
        view: true, 
        edit: true, 
        delete: false, 
        upload: true 
      },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewCreatorOps: true,
        viewResources: true,
      },
    },
  },
  {
    id: "role_employee",
    name: "Employee",
    description: "Team-based member (IM/TM). Read-only access to team content.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: true },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewResources: true,
        viewOnboarding: true,
        viewOperations: true,
      },
    },
  },
];

const DEPARTMENTS: Department[] = [
  { id: "im", name: "Influencer Marketing" },
  { id: "tm", name: "Talent Management" },
  { id: "hr", name: "HR" },
  { id: "finance", name: "Finance" },
  { id: "onboarding", name: "Onboarding" },
  { id: "creator", name: "Creator Ops" },
  { id: "brand", name: "Brand Management" },
  { id: "operations", name: "Operations" },
];

const TEAMS: Team[] = [
  { id: "team_im", name: "Influencer Marketing", departmentId: "im" },
  { id: "team_tm", name: "Talent Management", departmentId: "tm" },
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
    roleId: "role_cofounder",
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
  },
  {
    id: "u2",
    name: "Maya Patel",
    email: "maya@example.com",
    avatar: "MP",
    userType: "employee",
    roleId: "role_im_team_lead",
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
  },
  {
    id: "u3",
    name: "Lucas Kim",
    email: "lucas@example.com",
    avatar: "LK",
    userType: "employee",
    roleId: "role_tm_team_lead",
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
  },
  {
    id: "u4",
    name: "James Chen",
    email: "james@example.com",
    avatar: "JC",
    userType: "employee",
    roleId: "role_employee",
    departmentId: "im",
    teamId: "team_im",
    permissionIds: ["view_library", "view_documents", "view_creator_ops", "view_resources"],
    createdById: "u2",
    status: "active",
  },
  {
    id: "u5",
    name: "Ava Liu",
    email: "ava@example.com",
    avatar: "AL",
    userType: "employee",
    roleId: "role_employee",
    departmentId: "tm",
    teamId: "team_tm",
    permissionIds: ["view_library", "view_documents", "view_brand", "view_resources"],
    createdById: "u3",
    status: "active",
  },
  {
    id: "u6",
    name: "Noah Reed",
    email: "noah@example.com",
    avatar: "NR",
    userType: "employee",
    roleId: "role_hr",
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
  },
  {
    id: "u8",
    name: "Evelyn Brooks",
    email: "evelyn@example.com",
    avatar: "EB",
    userType: "employee",
    roleId: "role_finance",
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
  },
  {
    id: "u7",
    name: "Jade Rivera",
    email: "jade@example.com",
    avatar: "JR",
    userType: "creator",
    roleId: "role_creator",
    permissionIds: ["view_library", "view_documents", "view_creator_ops", "view_resources"],
    createdById: "u1",
    status: "active",
  },
];

const DOCUMENTS: Document[] = [];

const RESOURCES: ResourceItem[] = [];

const ACTIVITY_LOG: ActivityEvent[] = [];

const roleStore: Role[] = [...ROLES];
const userStore: User[] = configuredForSupabase ? [] : [...USERS];
const departmentStore: Department[] = configuredForSupabase ? [] : [...DEPARTMENTS];
const teamStore: Team[] = configuredForSupabase ? [] : [...TEAMS];
const documentStore: Document[] = configuredForSupabase ? [] : [...DOCUMENTS];

const DRIVE_DOCUMENT_REFS: DriveDocumentReference[] = [];

const driveDocumentStore: DriveDocumentReference[] = configuredForSupabase ? [] : [...DRIVE_DOCUMENT_REFS];
const videoStore: VideoItem[] = [];
const quickActionStore: QuickActionItem[] = [];
const resourceStore: ResourceItem[] = configuredForSupabase ? [] : [...RESOURCES];
const activityStore: ActivityEvent[] = configuredForSupabase ? [] : [...ACTIVITY_LOG];
const ingestionJobStore: IngestionJob[] = [];
const ingestionResultStore: IngestionResult[] = [];
const ingestionFailureStore: IngestionFailure[] = [];

let supabaseHydrationStarted = false;
let supabaseHydrationComplete = false;
let dataChangeVersion = 0;
const dataChangeListeners: Array<() => void> = [];
const hydrationListeners: Array<() => void> = [];

function notifyDataChange() {
  dataChangeVersion += 1;
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
      supabase.from(table).select("*").limit(1000) as unknown as Promise<RowResult>,
      DATA_HYDRATION_TIMEOUT_MS,
      fallback
    );
  }

  try {
    const [rolesRes, usersRes, docsRes, resourcesRes, driveDocsRes, activityRes, departmentsRes, teamsRes, videosRes, quickActionsRes, ingestionJobsRes, ingestionResultsRes, ingestionFailuresRes] = await Promise.all([
      timedFetch("roles",             "Supabase roles fetch timed out."),
      timedFetch("users",             "Supabase users fetch timed out."),
      timedFetch("documents",         "Supabase documents fetch timed out."),
      timedFetch("resources",         "Supabase resources fetch timed out."),
      timedFetch("drive_documents",   "Supabase drive documents fetch timed out."),
      timedFetch("activity_logs",     "Supabase activity logs fetch timed out."),
      timedFetch("departments",       "Supabase departments fetch timed out."),
      timedFetch("teams",             "Supabase teams fetch timed out."),
      safeFetchSupabaseTable("videos"),
      safeFetchSupabaseTable("quick_actions"),
      timedFetch("ingestion_jobs",     "Supabase ingestion jobs fetch timed out."),
      timedFetch("ingestion_results",  "Supabase ingestion results fetch timed out."),
      timedFetch("ingestion_failures", "Supabase ingestion failures fetch timed out."),
    ]);

    const requiredHydrationErrors = [
      { name: "roles", result: rolesRes },
      { name: "users", result: usersRes },
      { name: "documents", result: docsRes },
      { name: "resources", result: resourcesRes },
      { name: "drive_documents", result: driveDocsRes },
      { name: "activity_logs", result: activityRes },
      { name: "departments", result: departmentsRes },
      { name: "teams", result: teamsRes },
    ].filter((entry) => entry.result.error !== null);

    if (requiredHydrationErrors.length > 0) {
      console.warn("Supabase hydration encountered errors", {
        rolesError: rolesRes.error,
        usersError: usersRes.error,
        docsError: docsRes.error,
        resourcesError: resourcesRes.error,
        driveDocsError: driveDocsRes.error,
        activityError: activityRes.error,
        departmentsError: departmentsRes.error,
        teamsError: teamsRes.error,
      });
      supabaseAvailable = false;
      return;
    }

    const optionalHydrationIssues = [
      { name: "videos", success: Array.isArray(videosRes) },
      { name: "quick_actions", success: Array.isArray(quickActionsRes) },
      { name: "ingestion_jobs", success: Array.isArray(ingestionJobsRes.data) },
      { name: "ingestion_results", success: Array.isArray(ingestionResultsRes.data) },
      { name: "ingestion_failures", success: Array.isArray(ingestionFailuresRes.data) },
    ].filter((entry) => !entry.success);

    if (optionalHydrationIssues.length > 0) {
      console.warn("Supabase hydration completed with optional table issues", {
        issues: optionalHydrationIssues.map((issue) => issue.name),
        quickActionsPresent: Array.isArray(quickActionsRes),
        videosPresent: Array.isArray(videosRes),
        ingestionJobsError: ingestionJobsRes.error,
        ingestionResultsError: ingestionResultsRes.error,
        ingestionFailuresError: ingestionFailuresRes.error,
      });
    }

    supabaseAvailable = true;

    if (Array.isArray(rolesRes.data)) {
      roleStore.splice(0, roleStore.length, ...mergeEntitiesById(roleStore, mapSupabaseRows<Role>(rolesRes.data)));
    }

    if (Array.isArray(usersRes.data)) {
      userStore.splice(0, userStore.length, ...mergeEntitiesById(userStore, mapSupabaseRows<User>(usersRes.data)));
    }

    if (Array.isArray(docsRes.data)) {
      documentStore.splice(0, documentStore.length, ...mergeEntitiesById(documentStore, mapSupabaseRows<Document>(docsRes.data)));
    }

    if (Array.isArray(resourcesRes.data)) {
      resourceStore.splice(0, resourceStore.length, ...mergeEntitiesById(resourceStore, mapSupabaseRows<ResourceItem>(resourcesRes.data)));
    }

    if (Array.isArray(driveDocsRes.data)) {
      driveDocumentStore.splice(0, driveDocumentStore.length, ...mergeEntitiesById(driveDocumentStore, mapSupabaseRows<DriveDocumentReference>(driveDocsRes.data)));
    }

    if (Array.isArray(videosRes)) {
      videoStore.splice(0, videoStore.length, ...mergeEntitiesById(videoStore, mapSupabaseRows<VideoItem>(videosRes)));
    }

    if (Array.isArray(quickActionsRes)) {
      quickActionStore.splice(0, quickActionStore.length, ...mergeEntitiesById(quickActionStore, mapSupabaseRows<QuickActionItem>(quickActionsRes)));
    }

    if (Array.isArray(activityRes.data)) {
      activityStore.splice(0, activityStore.length, ...mergeEntitiesById(activityStore, mapSupabaseRows<ActivityEvent>(activityRes.data)));
    }

    if (Array.isArray(ingestionJobsRes.data)) {
      ingestionJobStore.splice(0, ingestionJobStore.length, ...mergeEntitiesById(ingestionJobStore, mapSupabaseRows<IngestionJob>(ingestionJobsRes.data)));
    }

    if (Array.isArray(ingestionResultsRes.data)) {
      ingestionResultStore.splice(0, ingestionResultStore.length, ...mergeEntitiesById(ingestionResultStore, mapSupabaseRows<IngestionResult>(ingestionResultsRes.data)));
    }

    if (Array.isArray(ingestionFailuresRes.data)) {
      ingestionFailureStore.splice(0, ingestionFailureStore.length, ...mergeEntitiesById(ingestionFailureStore, mapSupabaseRows<IngestionFailure>(ingestionFailuresRes.data)));
    }

    if (Array.isArray(departmentsRes.data)) {
      departmentStore.splice(0, departmentStore.length, ...mergeEntitiesById(departmentStore, mapSupabaseRows<Department>(departmentsRes.data)));
    }

    if (Array.isArray(teamsRes.data)) {
      teamStore.splice(0, teamStore.length, ...mergeEntitiesById(teamStore, mapSupabaseRows<Team>(teamsRes.data)));
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

export function getSupabaseHydrationState() {
  ensureSupabaseHydration();
  return {
    ready: supabaseHydrationComplete,
    available: supabaseAvailable,
    version: dataChangeVersion,
  };
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
    console.warn(`Role lookup failed for '${id}', falling back to '${ROLE_IDS.EMPLOYEE}'.`);
  }

  return roleStore.find((role) => role.id === ROLE_IDS.EMPLOYEE) ?? roleStore[0] ?? null;
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

export function getUserByRoleId(roleId: RoleId) {
  ensureSupabaseHydration();
  return userStore.find((user) => user.roleId === roleId);
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
    void safeSupabaseWrite(() => supabase.from("drive_documents").upsert(createUpsertPayload(document), { onConflict: "legacy_id" }));
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

export function updateDriveDocumentPermissions(id: string, permissionSummary: DriveDocumentPermission[]) {
  const document = getDriveDocumentById(id);
  if (!document) return undefined;
  document.permissionSummary = permissionSummary;

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("drive_documents").update({ permission_summary: permissionSummary }).eq("legacy_id", id));
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

export function getIngestionJobs() {
  ensureSupabaseHydration();
  return ingestionJobStore;
}

export function getIngestionJobById(id: string) {
  ensureSupabaseHydration();
  return ingestionJobStore.find((job) => job.id === id);
}

export function getIngestionResults() {
  ensureSupabaseHydration();
  return ingestionResultStore;
}

export function getIngestionFailures() {
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

export function getVideos() {
  ensureSupabaseHydration();
  return videoStore;
}

export function getQuickActions() {
  ensureSupabaseHydration();
  return quickActionStore;
}

export function saveVideo(video: VideoItem) {
  const existing = getVideos().find((item) => item.id === video.id);
  if (existing) {
    Object.assign(existing, video);
  } else {
    videoStore.unshift(video);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("videos").upsert(createUpsertPayload(video), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || video;
}

export function saveQuickAction(action: QuickActionItem) {
  const existing = getQuickActions().find((item) => item.id === action.id);
  if (existing) {
    Object.assign(existing, action);
  } else {
    quickActionStore.unshift(action);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("quick_actions").upsert(createUpsertPayload(action), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || action;
}

export function deleteVideo(videoId: string) {
  const index = videoStore.findIndex((item) => item.id === videoId);
  if (index === -1) return false;
  videoStore.splice(index, 1);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("videos").delete().eq("legacy_id", videoId));
  }
  notifyDataChange();
  return true;
}

export function deleteQuickAction(actionId: string) {
  const index = quickActionStore.findIndex((item) => item.id === actionId);
  if (index === -1) return false;
  quickActionStore.splice(index, 1);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("quick_actions").delete().eq("legacy_id", actionId));
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

export function getPendingUploads() {
  return pendingUploadStore;
}

export async function syncPendingLocalChanges() {
  const connected = await checkSupabaseConnectivity();
  if (!connected) {
    supabaseAvailable = false;
    return false;
  }

  supabaseAvailable = true;
  await reconcileSupabaseData();
  notifyDataChange();
  return true;
}

export function saveUser(user: User) {
  const existing = getUserById(user.id);
  if (existing) {
    Object.assign(existing, user);
  } else {
    userStore.unshift(user);
  }

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("users").upsert(createUpsertPayload(user), { onConflict: "legacy_id" }));
  }
  notifyDataChange();
  return existing || user;
}

export function deleteResource(resourceId: string) {
  const index = resourceStore.findIndex((resource) => resource.id === resourceId);
  if (index === -1) return false;
  resourceStore.splice(index, 1);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("resources").delete().eq("legacy_id", resourceId));
  }
  notifyDataChange();
  return true;
}
