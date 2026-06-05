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
import { getSupabaseDiagnostics, supabase, isSupabaseConfigured as isSupabaseConfiguredLib } from "@/lib/supabase";
import { withTimeout } from "@/lib/async";
import { uploadFileToStorage } from "@/services/storage";
import { invalidateSearchIndex } from "@/services/search";
import { logDiagnostic } from "./observability/diagnostics";
import { safeReadFallbackCache, safeWriteFallbackCache, type CachedSessionPayload, type PendingUploadCacheItem } from "@/services/cache";
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
const DATA_HYDRATION_TIMEOUT_MS = 4000;
let dataProviderMode: DataProviderMode = configuredForSupabase ? "supabase" : "local";
let supabaseAvailable = false;
let cacheLoaded = false;
let cacheAvailable = false;
let cacheLastUpdatedAt = "";
const pendingUploadStore: PendingUploadCacheItem[] = [];

if (!configuredForSupabase) {
  console.warn(
    "Supabase environment variables are missing or invalid. Falling back to local provider mode. This is a non-blocking fallback."
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
  return isSupabaseAvailable() ? "supabase" : "local";
}

export function setDataProviderMode(mode: DataProviderMode) {
  if (mode === "supabase" && !isSupabaseConfigured()) {
    console.warn(
      "Supabase provider mode requested but Supabase is not configured. Staying in local provider mode."
    );
    dataProviderMode = "local";
    return;
  }

  dataProviderMode = mode;
  if (mode === "supabase" && isSupabaseConfigured()) {
    ensureSupabaseHydration();
  }
}

function mapSupabaseRow<T>(row: Record<string, any>): T {
  const mapped: Record<string, any> = {};

  for (const [key, value] of Object.entries(row)) {
    let normalizedKey: string;

    if (key === "legacy_id") {
      normalizedKey = "id";
    } else if (key.endsWith("_legacy_id")) {
      normalizedKey = key
        .slice(0, -"_legacy_id".length)
        .replace(/_([a-z])/g, (_, char) => char.toUpperCase()) + "Id";
    } else {
      normalizedKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    }

    mapped[normalizedKey] = value;
  }

  return mapped as T;
}

function mapSupabaseRows<T>(rows: Record<string, any>[]) {
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

function safeSupabaseWrite(operation: () => any) {
  const result = operation();
  void Promise.resolve(result)
    .then((resultValue: any) => {
      if (resultValue?.error) {
        handleSupabaseError(resultValue.error);
      }
    })
    .catch(handleSupabaseError);
}

async function safeFetchSupabaseTable<T>(table: string) {
  try {
    const result = await withTimeout(
      supabase.from(table).select("*").limit(1000),
      DATA_HYDRATION_TIMEOUT_MS,
      { data: [], error: { message: "Supabase table fetch timed out." } } as any
    );

    if (result.error || !Array.isArray(result.data)) {
      if (result.error) {
        console.warn(`Supabase optional table fetch failed for '${table}'`, result.error);
      }
      return null;
    }
    return result.data as Record<string, any>[];
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
    const result = await withTimeout(
      supabase.from("roles").select("id").limit(1),
      DATA_HYDRATION_TIMEOUT_MS,
      { data: [], error: { message: "Supabase connectivity check timed out." } } as any
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

function loadCachedFallbackData() {
  if (cacheLoaded) {
    return;
  }

  cacheLoaded = true;
  const cache = safeReadFallbackCache();
  if (!cache) {
    return;
  }

  cacheAvailable = true;
  cacheLastUpdatedAt = cache.timestamp;

  if (cache.roles?.length) {
    roleStore.splice(0, roleStore.length, ...mergeEntitiesById(roleStore, cache.roles));
  }

  if (cache.users?.length) {
    userStore.splice(0, userStore.length, ...mergeEntitiesById(userStore, cache.users));
  }

  if (cache.departments?.length) {
    departmentStore.splice(0, departmentStore.length, ...mergeEntitiesById(departmentStore, cache.departments));
  }

  if (cache.teams?.length) {
    teamStore.splice(0, teamStore.length, ...mergeEntitiesById(teamStore, cache.teams));
  }

  if (cache.documents?.length) {
    documentStore.splice(0, documentStore.length, ...mergeEntitiesById(documentStore, cache.documents));
  }

  if (cache.resources?.length) {
    resourceStore.splice(0, resourceStore.length, ...mergeEntitiesById(resourceStore, cache.resources));
  }

  if (cache.driveDocuments?.length) {
    driveDocumentStore.splice(0, driveDocumentStore.length, ...mergeEntitiesById(driveDocumentStore, cache.driveDocuments));
  }

  if (cache.videos?.length) {
    videoStore.splice(0, videoStore.length, ...mergeEntitiesById(videoStore, cache.videos));
  }

  if (cache.quickActions?.length) {
    quickActionStore.splice(0, quickActionStore.length, ...mergeEntitiesById(quickActionStore, cache.quickActions));
  }

  if (cache.activityEvents?.length) {
    activityStore.splice(0, activityStore.length, ...mergeEntitiesById(activityStore, cache.activityEvents));
  }

  if (cache.ingestionJobs?.length) {
    ingestionJobStore.splice(0, ingestionJobStore.length, ...mergeEntitiesById(ingestionJobStore, cache.ingestionJobs));
  }

  if (cache.ingestionResults?.length) {
    ingestionResultStore.splice(0, ingestionResultStore.length, ...mergeEntitiesById(ingestionResultStore, cache.ingestionResults));
  }

  if (cache.ingestionFailures?.length) {
    ingestionFailureStore.splice(0, ingestionFailureStore.length, ...mergeEntitiesById(ingestionFailureStore, cache.ingestionFailures));
  }

  if (cache.pendingUploads?.length) {
    pendingUploadStore.splice(0, pendingUploadStore.length, ...mergeEntitiesById(pendingUploadStore, cache.pendingUploads));
  }
}

function persistFallbackCache() {
  cacheLastUpdatedAt = new Date().toISOString();

  safeWriteFallbackCache({
    version: 1,
    timestamp: cacheLastUpdatedAt,
    roles: roleStore.slice(),
    users: userStore.slice(),
    departments: departmentStore.slice(),
    teams: teamStore.slice(),
    documents: documentStore.slice(),
    resources: resourceStore.slice(),
    driveDocuments: driveDocumentStore.slice(),
    videos: videoStore.slice(),
    quickActions: quickActionStore.slice(),
    activityEvents: activityStore.slice(),
    ingestionJobs: ingestionJobStore.slice(),
    ingestionResults: ingestionResultStore.slice(),
    ingestionFailures: ingestionFailureStore.slice(),
    pinnedDocumentIds: documentStore.filter((document) => document.pinned).map((document) => document.id),
    pendingUploads: pendingUploadStore.slice(),
  });
}

function getProviderHealthState(): ProviderHealth {
  const lastCheckedAt = new Date().toISOString();
  const diagnostics = getSupabaseDiagnostics();

  const providerMode = getDataProviderMode();
  const effectiveProviderMode = getEffectiveDataProviderMode();
  const fallbackMode = !isSupabaseAvailable();

  if (!isSupabaseConfigured()) {
    return {
      status: "fallback",
      message: diagnostics.message,
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
    message: diagnostics.message || "Supabase is unavailable. Serving cached or local fallback data.",
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
    description: "Full system administrator",
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
    id: "role_admin",
    name: "Admin",
    description: "Administrative operations and system coordination.",
    group: "team_lead",
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
    description: "Leads influencer marketing operations and custom role creation.",
    group: "team_lead",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: true, view: true, edit: true, delete: true, upload: true },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: true },
      features: {
        viewCreatorOps: true,
        viewOperations: true,
        viewResources: true,
        sendToAll: true,
      },
    },
  },
  {
    id: "role_tm_team_lead",
    name: "TM Team Lead",
    description: "Leads talent management operations and custom role creation.",
    group: "team_lead",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: true, view: true, edit: true, delete: true, upload: true },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: true },
      features: {
        viewBrand: true,
        viewOperations: true,
        viewResources: true,
        sendToAll: true,
      },
    },
  },
  {
    id: "role_im_member",
    name: "IM Team Member",
    description: "Influencer marketing team member.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewCreatorOps: true,
        viewResources: true,
      },
    },
  },
  {
    id: "role_tm_member",
    name: "TM Team Member",
    description: "Talent management team member.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewBrand: true,
        viewResources: true,
      },
    },
  },
  {
    id: "role_hr",
    name: "HR Specialist",
    description: "HR access for people operations and compliance resources.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: true },
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
    name: "Finance Specialist",
    description: "Finance access for compliance, payroll, and resource management.",
    group: "team_member",
    userType: "employee",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: true },
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
    description: "Entry-level access for trainee staff.",
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
    description: "Creator access for content workflows and creator operations.",
    group: "creator",
    userType: "creator",
    createdById: "system",
    permissions: {
      documents: { create: false, view: true, edit: false, delete: false, upload: false },
      users: { create: false, edit: false, delete: false, assignRole: false },
      system: { adminPanelAccess: false, roleManagement: false },
      features: {
        viewCreatorOps: true,
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
    roleId: "role_im_member",
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
    roleId: "role_tm_member",
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
const userStore: User[] = [...USERS];
const departmentStore: Department[] = [...DEPARTMENTS];
const teamStore: Team[] = [...TEAMS];
const documentStore: Document[] = [...DOCUMENTS];

const DRIVE_DOCUMENT_REFS: DriveDocumentReference[] = [];

const driveDocumentStore: DriveDocumentReference[] = [...DRIVE_DOCUMENT_REFS];
const videoStore: VideoItem[] = [];
const quickActionStore: QuickActionItem[] = [];
const resourceStore: ResourceItem[] = [...RESOURCES];
const activityStore: ActivityEvent[] = [...ACTIVITY_LOG];
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
  loadCachedFallbackData();

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

  try {
    const [rolesRes, usersRes, docsRes, resourcesRes, driveDocsRes, activityRes, departmentsRes, teamsRes, videosRes, quickActionsRes, ingestionJobsRes, ingestionResultsRes, ingestionFailuresRes] = await Promise.all([
      withTimeout(supabase.from("roles").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase roles fetch timed out." } } as any),
      withTimeout(supabase.from("users").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase users fetch timed out." } } as any),
      withTimeout(supabase.from("documents").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase documents fetch timed out." } } as any),
      withTimeout(supabase.from("resources").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase resources fetch timed out." } } as any),
      withTimeout(supabase.from("drive_documents").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase drive documents fetch timed out." } } as any),
      withTimeout(supabase.from("activity_logs").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase activity logs fetch timed out." } } as any),
      withTimeout(supabase.from("departments").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase departments fetch timed out." } } as any),
      withTimeout(supabase.from("teams").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase teams fetch timed out." } } as any),
      safeFetchSupabaseTable("videos"),
      safeFetchSupabaseTable("quick_actions"),
      withTimeout(supabase.from("ingestion_jobs").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase ingestion jobs fetch timed out." } } as any),
      withTimeout(supabase.from("ingestion_results").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase ingestion results fetch timed out." } } as any),
      withTimeout(supabase.from("ingestion_failures").select("*").limit(1000), DATA_HYDRATION_TIMEOUT_MS, { data: [], error: { message: "Supabase ingestion failures fetch timed out." } } as any),
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
      roleStore.splice(0, roleStore.length, ...mergeEntitiesById(roleStore, safeReadFallbackCache()?.roles ?? [], mapSupabaseRows<Role>(rolesRes.data)));
    }

    if (Array.isArray(usersRes.data)) {
      userStore.splice(0, userStore.length, ...mergeEntitiesById(userStore, safeReadFallbackCache()?.users ?? [], mapSupabaseRows<User>(usersRes.data)));
    }

    if (Array.isArray(docsRes.data)) {
      documentStore.splice(0, documentStore.length, ...mergeEntitiesById(documentStore, safeReadFallbackCache()?.documents ?? [], mapSupabaseRows<Document>(docsRes.data)));
    }

    if (Array.isArray(resourcesRes.data)) {
      resourceStore.splice(0, resourceStore.length, ...mergeEntitiesById(resourceStore, safeReadFallbackCache()?.resources ?? [], mapSupabaseRows<ResourceItem>(resourcesRes.data)));
    }

    if (Array.isArray(driveDocsRes.data)) {
      driveDocumentStore.splice(0, driveDocumentStore.length, ...mergeEntitiesById(driveDocumentStore, safeReadFallbackCache()?.driveDocuments ?? [], mapSupabaseRows<DriveDocumentReference>(driveDocsRes.data)));
    }

    if (Array.isArray(videosRes)) {
      videoStore.splice(0, videoStore.length, ...mergeEntitiesById(videoStore, safeReadFallbackCache()?.videos ?? [], mapSupabaseRows<VideoItem>(videosRes)));
    }

    if (Array.isArray(quickActionsRes)) {
      quickActionStore.splice(0, quickActionStore.length, ...mergeEntitiesById(quickActionStore, safeReadFallbackCache()?.quickActions ?? [], mapSupabaseRows<QuickActionItem>(quickActionsRes)));
    }

    if (Array.isArray(activityRes.data)) {
      activityStore.splice(0, activityStore.length, ...mergeEntitiesById(activityStore, safeReadFallbackCache()?.activityEvents ?? [], mapSupabaseRows<ActivityEvent>(activityRes.data)));
    }

    if (Array.isArray(ingestionJobsRes.data)) {
      ingestionJobStore.splice(0, ingestionJobStore.length, ...mergeEntitiesById(ingestionJobStore, safeReadFallbackCache()?.ingestionJobs ?? [], mapSupabaseRows<IngestionJob>(ingestionJobsRes.data)));
    }

    if (Array.isArray(ingestionResultsRes.data)) {
      ingestionResultStore.splice(0, ingestionResultStore.length, ...mergeEntitiesById(ingestionResultStore, safeReadFallbackCache()?.ingestionResults ?? [], mapSupabaseRows<IngestionResult>(ingestionResultsRes.data)));
    }

    if (Array.isArray(ingestionFailuresRes.data)) {
      ingestionFailureStore.splice(0, ingestionFailureStore.length, ...mergeEntitiesById(ingestionFailureStore, safeReadFallbackCache()?.ingestionFailures ?? [], mapSupabaseRows<IngestionFailure>(ingestionFailuresRes.data)));
    }

    if (Array.isArray(departmentsRes.data)) {
      departmentStore.splice(0, departmentStore.length, ...mergeEntitiesById(departmentStore, safeReadFallbackCache()?.departments ?? [], mapSupabaseRows<Department>(departmentsRes.data)));
    }

    if (Array.isArray(teamsRes.data)) {
      teamStore.splice(0, teamStore.length, ...mergeEntitiesById(teamStore, safeReadFallbackCache()?.teams ?? [], mapSupabaseRows<Team>(teamsRes.data)));
    }

    persistFallbackCache();
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
  return roleStore.find((role) => role.id === id);
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

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
  notifyDataChange();
  return existing || document;
}

export function updateDriveDocumentSyncMetadata(
  id: string,
  updates: Partial<Pick<DriveDocumentReference, "lastSyncedAt" | "lastDriveModifiedAt" | "syncStatus" | "version" | "updatedAt" | "updatedById">>
) {
  const document = getDriveDocumentById(id);
  if (!document) return undefined;
  Object.assign(document, updates);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("drive_documents").update(updates).eq("legacy_id", id));
  }

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
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
  persistFallbackCache();
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
  persistFallbackCache();
  notifyDataChange();
  return existing || resource;
}

export function saveActivity(event: ActivityEvent) {
  activityStore.unshift(event);

  if (isSupabaseAvailable()) {
    void safeSupabaseWrite(() => supabase.from("activity_logs").insert(createUpsertPayload(event)));
  }

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
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
    persistFallbackCache();

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
    persistFallbackCache();

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

  persistFallbackCache();

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
  persistFallbackCache();
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

  persistFallbackCache();
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

  persistFallbackCache();
  notifyDataChange();
  return true;
}

