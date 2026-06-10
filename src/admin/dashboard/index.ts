import type {
  Document,
  DriveDocumentReference,
  ActivityEvent,
  User,
} from "@/core/operon";
import type { IngestionJob } from "@/services/ingestion/types";
import {
  getDocumentAnalytics,
  getDriveAnalytics,
  getIngestionAnalytics,
  getActivityAnalytics,
} from "@/admin/analytics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminDashboardAlert {
  level: "warning" | "error";
  module: string;
  message: string;
}

export interface AdminDashboardOverview {
  documents: {
    total: number;
    recentUploads: number;
    parserFailed: number;
  };
  drive: {
    total: number;
    synced: number;
    failed: number;
    syncRate: number;
  };
  ingestion: {
    queued: number;
    processing: number;
    failed: number;
  };
  activity: {
    last24h: number;
    last7d: number;
    activeUsers: number;
  };
  users: {
    total: number;
    active: number;
  };
  alerts: AdminDashboardAlert[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/**
 * Derives actionable alerts from runtime state.
 * Returned alerts are surfaced in the admin dashboard header.
 */
function deriveAlerts(params: {
  documents: Document[];
  driveDocuments: DriveDocumentReference[];
  jobs: IngestionJob[];
}): AdminDashboardAlert[] {
  const alerts: AdminDashboardAlert[] = [];

  const failedParse = params.documents.filter(
    (d) => d.parserStatus === "failed"
  ).length;
  if (failedParse > 0) {
    alerts.push({
      level: "error",
      module: "parser",
      message: `${failedParse} document${failedParse === 1 ? "" : "s"} failed to parse`,
    });
  }

  const failedJobs = params.jobs.filter((j) => j.status === "failed").length;
  if (failedJobs > 0) {
    alerts.push({
      level: "error",
      module: "ingestion",
      message: `${failedJobs} ingestion job${failedJobs === 1 ? "" : "s"} failed`,
    });
  }

  const failedSync = params.driveDocuments.filter(
    (d) => d.syncStatus === "failed"
  ).length;
  if (failedSync > 0) {
    alerts.push({
      level: "warning",
      module: "drive",
      message: `${failedSync} Drive document${failedSync === 1 ? "" : "s"} failed to sync`,
    });
  }

  const staleSync = params.driveDocuments.filter(
    (d) => d.syncStatus === "stale"
  ).length;
  if (staleSync > 0) {
    alerts.push({
      level: "warning",
      module: "drive",
      message: `${staleSync} Drive document${staleSync === 1 ? "" : "s"} are stale`,
    });
  }

  const longQueuedJobs = params.jobs.filter(
    (j) => j.status === "queued" && j.retryCount && j.retryCount > 2
  ).length;
  if (longQueuedJobs > 0) {
    alerts.push({
      level: "warning",
      module: "ingestion",
      message: `${longQueuedJobs} job${longQueuedJobs === 1 ? "" : "s"} retrying after repeated failure`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function getAdminDashboardOverview(params: {
  documents: Document[];
  driveDocuments: DriveDocumentReference[];
  jobs: IngestionJob[];
  events: ActivityEvent[];
  users: User[];
}): AdminDashboardOverview {
  const docAnalytics = getDocumentAnalytics(params.documents);
  const driveAnalytics = getDriveAnalytics(params.driveDocuments);
  const ingestionAnalytics = getIngestionAnalytics(params.jobs);
  const activityAnalytics = getActivityAnalytics(params.events);
  const activeUsers = params.users.filter(
    (u) => u.status !== "disabled"
  );

  return {
    documents: {
      total: docAnalytics.total,
      recentUploads: docAnalytics.recentUploads,
      parserFailed: params.documents.filter(
        (d) => d.parserStatus === "failed"
      ).length,
    },
    drive: {
      total: driveAnalytics.total,
      synced: driveAnalytics.synced,
      failed: driveAnalytics.failed,
      syncRate: driveAnalytics.syncRate,
    },
    ingestion: {
      queued: ingestionAnalytics.queued,
      processing: ingestionAnalytics.processing,
      failed: ingestionAnalytics.failed,
    },
    activity: {
      last24h: activityAnalytics.last24h,
      last7d: activityAnalytics.last7d,
      activeUsers: activityAnalytics.activeUsers,
    },
    users: {
      total: params.users.length,
      active: activeUsers.length,
    },
    alerts: deriveAlerts({
      documents: params.documents,
      driveDocuments: params.driveDocuments,
      jobs: params.jobs,
    }),
    generatedAt: new Date().toISOString(),
  };
}