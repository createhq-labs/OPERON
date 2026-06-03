import type {
  ActivityEvent,
  Department,
  Department as Dept,
  DeptId,
  Document,
  DriveDocumentReference,
  ResourceItem,
  Role,
  Team,
  User,
} from "@/core/operon";

export type PendingUploadCacheItem = {
  id: string;
  fileName: string;
  tag?: string;
  departmentId?: DeptId;
  authorId: string;
  createdAt: string;
  syncPending: boolean;
  error?: string;
};

export type CachedSessionPayload = {
  version: number;
  timestamp: string;
  roles?: Role[];
  users?: User[];
  departments?: Department[];
  teams?: Team[];
  documents?: Document[];
  resources?: ResourceItem[];
  driveDocuments?: DriveDocumentReference[];
  videos?: Array<import("@/core/operon").VideoItem>;
  quickActions?: Array<import("@/core/operon").QuickActionItem>;
  activityEvents?: ActivityEvent[];
  ingestionJobs?: Array<import("@/services/ingestion/types").IngestionJob>;
  ingestionResults?: Array<import("@/services/ingestion/types").IngestionResult>;
  ingestionFailures?: Array<import("@/services/ingestion/types").IngestionFailure>;
  pinnedDocumentIds?: string[];
  pendingUploads?: PendingUploadCacheItem[];
};

const CACHE_KEY = "operon-fallback-cache-v1";
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours

const isBrowser = typeof window !== "undefined";

export function safeReadFallbackCache(): CachedSessionPayload | undefined {
  if (!isBrowser) {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as CachedSessionPayload;
    if (!parsed || parsed.version !== CACHE_VERSION) {
      return undefined;
    }

    const age = Date.now() - new Date(parsed.timestamp).getTime();
    if (age > CACHE_TTL_MS) {
      window.localStorage.removeItem(CACHE_KEY);
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

export function safeWriteFallbackCache(payload: CachedSessionPayload) {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage write failures
  }
}

export function safeClearFallbackCache() {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore storage failures
  }
}
