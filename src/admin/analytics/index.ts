import type {
  Document,
  DriveDocumentReference,
  ActivityEvent,
  User,
} from "@/core/operon";
import type { IngestionJob } from "@/services/ingestion/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentAnalytics {
  total: number;
  byDepartment: Array<{ departmentId: string; count: number }>;
  byVisibility: { global: number; department: number; private: number };
  bySource: { google_drive: number; local_upload: number };
  pinned: number;
  recentUploads: number; // last 7 days
}

export interface ParserAnalytics {
  total: number;
  parsed: number;
  pending: number;
  failed: number;
  successRate: number; // 0–1
}

export interface IngestionAnalytics {
  total: number;
  queued: number;
  processing: number;
  retrying: number;
  failed: number;
  failedJobs: Array<{ documentId: string; error?: string; attempts: number }>;
}

export interface DriveAnalytics {
  total: number;
  synced: number;
  syncing: number;
  stale: number;
  failed: number;
  deleted: number;
  syncRate: number; // 0–1
}

export interface ActivityAnalytics {
  totalEvents: number;
  last24h: number;
  last7d: number;
  byAction: Array<{ action: string; count: number }>;
  activeUsers: number; // distinct users in last 7 days
}

export interface AdminAnalyticsSummary {
  documents: DocumentAnalytics;
  parser: ParserAnalytics;
  ingestion: IngestionAnalytics;
  drive: DriveAnalytics;
  activity: ActivityAnalytics;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Document analytics
// ---------------------------------------------------------------------------

export function getDocumentAnalytics(
  documents: Document[]
): DocumentAnalytics {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1_000;

  const byDepartmentMap = new Map<string, number>();
  for (const doc of documents) {
    const dept = doc.departmentId ?? doc.dept ?? "unassigned";
    byDepartmentMap.set(dept, (byDepartmentMap.get(dept) ?? 0) + 1);
  }

  return {
    total: documents.length,
    byDepartment: Array.from(byDepartmentMap.entries())
      .map(([departmentId, count]) => ({ departmentId, count }))
      .sort((a, b) => b.count - a.count),
    byVisibility: {
      global: documents.filter((d) => d.visibilityScope === "global").length,
      department: documents.filter(
        (d) => d.visibilityScope === "department"
      ).length,
      private: documents.filter((d) => d.visibilityScope === "private").length,
    },
    bySource: {
      google_drive: documents.filter((d) => d.source === "google_drive").length,
      local_upload: documents.filter((d) => d.source === "uploaded" || d.source === "local_drive").length,
    },
    pinned: documents.filter((d) => d.pinned).length,
    recentUploads: documents.filter((d) => {
      if (!d.updatedAt) return false;
      return new Date(d.updatedAt).getTime() > sevenDaysAgo;
    }).length,
  };
}

// ---------------------------------------------------------------------------
// Parser analytics
// ---------------------------------------------------------------------------

export function getParserAnalytics(documents: Document[]): ParserAnalytics {
  const parsed = documents.filter(
    (d) => d.parserStatus === "parsed"
  ).length;
  const pending = documents.filter(
    (d) => d.parserStatus === "pending"
  ).length;
  const failed = documents.filter(
    (d) => d.parserStatus === "failed"
  ).length;
  const total = documents.length;
  const resolved = parsed + failed;

  return {
    total,
    parsed,
    pending,
    failed,
    successRate: resolved === 0 ? 1 : parsed / resolved,
  };
}

// ---------------------------------------------------------------------------
// Ingestion analytics
// ---------------------------------------------------------------------------

export function getIngestionAnalytics(
  jobs: IngestionJob[]
): IngestionAnalytics {
  return {
    total: jobs.length,
    queued: jobs.filter(
      (j) => j.status === "queued" || j.status === "retrying"
    ).length,
    processing: jobs.filter((j) => j.status === "processing").length,
    retrying: jobs.filter((j) => j.status === "retrying").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    failedJobs: jobs
      .filter((j) => j.status === "failed")
      .map((j) => ({
        documentId: j.documentId,
        error: j.lastError,
        attempts: j.retryCount ?? 0,
      })),
  };
}

// ---------------------------------------------------------------------------
// Drive analytics
// ---------------------------------------------------------------------------

export function getDriveAnalytics(
  documents: DriveDocumentReference[]
): DriveAnalytics {
  const synced = documents.filter((d) => d.syncStatus === "synced").length;
  const syncing = documents.filter((d) => d.syncStatus === "syncing").length;
  const stale = documents.filter((d) => d.syncStatus === "stale").length;
  const failed = documents.filter((d) => d.syncStatus === "failed").length;
  const deleted = documents.filter(
    (d) => (d.syncStatus as string) === "deleted"
  ).length;
  const total = documents.length;
  const resolved = synced + failed + deleted;

  return {
    total,
    synced,
    syncing,
    stale,
    failed,
    deleted,
    syncRate: resolved === 0 ? 1 : synced / resolved,
  };
}

// ---------------------------------------------------------------------------
// Activity analytics
// ---------------------------------------------------------------------------

export function getActivityAnalytics(
  events: ActivityEvent[]
): ActivityAnalytics {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1_000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1_000;

  const recentEvents = events.filter(
    (e) => new Date(e.timestamp).getTime() > sevenDaysAgo
  );

  const actionCounts = new Map<string, number>();
  for (const event of events) {
    actionCounts.set(
      event.action,
      (actionCounts.get(event.action) ?? 0) + 1
    );
  }

  const activeUserIds = new Set(recentEvents.map((e) => e.userId));

  return {
    totalEvents: events.length,
    last24h: events.filter(
      (e) => new Date(e.timestamp).getTime() > oneDayAgo
    ).length,
    last7d: recentEvents.length,
    byAction: Array.from(actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count),
    activeUsers: activeUserIds.size,
  };
}

// ---------------------------------------------------------------------------
// Full summary
// ---------------------------------------------------------------------------

export function getAdminAnalyticsSummary(params: {
  documents: Document[];
  driveDocuments: DriveDocumentReference[];
  jobs: IngestionJob[];
  events: ActivityEvent[];
}): AdminAnalyticsSummary {
  return {
    documents: getDocumentAnalytics(params.documents),
    parser: getParserAnalytics(params.documents),
    ingestion: getIngestionAnalytics(params.jobs),
    drive: getDriveAnalytics(params.driveDocuments),
    activity: getActivityAnalytics(params.events),
    generatedAt: new Date().toISOString(),
  };
}