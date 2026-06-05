"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@/core/operon";
import type { DriveDiagnostics, DriveSyncMode } from "@/services/drive";
import {
  connectDrive,
  getDriveDiagnostics,
  syncDrive,
  disconnectDrive,
  getDriveConnectorStatus,
} from "@/services/drive";

interface DriveAccount {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  expiresAt?: string;
  updatedAt?: string;
}

interface DrivePanelProps {
  user: User;
  driveDiagnostics?: DriveDiagnostics | null;
  onDiagnosticsUpdate: (diagnostics: DriveDiagnostics) => void;
}

export function DrivePanel({
  user,
  driveDiagnostics,
  onDiagnosticsUpdate,
}: DrivePanelProps) {
  const [accounts, setAccounts] = useState<DriveAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [error, setError] = useState("");
  const [connectStatus, setConnectStatus] = useState("");
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const canManageDrive =
    user.roleId === "role_cofounder" ||
    user.roleId === "role_hr" ||
    user.roleId === "role_finance" ||
    user.roleId === "role_im_team_lead" ||
    user.roleId === "role_tm_team_lead";

  const loadStatus = useCallback(async () => {
    try {
      const status = await getDriveConnectorStatus();
      setAccounts(status.accounts || []);
      setError("");
    } catch {
      setError("Unable to load Drive account status.");
    }
  }, []);

  const loadDiagnostics = useCallback(async () => {
    try {
      const diags = await getDriveDiagnostics();
      onDiagnosticsUpdate(diags);
    } catch {
      // Diagnostics refresh is best-effort
    }
  }, [onDiagnosticsUpdate]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    if (!canManageDrive) {
      setError("Your role does not have permission to manage Drive accounts.");
      return;
    }
    setConnectStatus("Connecting to Google Drive...");
    setError("");
    try {
      const result = await connectDrive();
      if (result.connected) {
        setConnectStatus("Drive account connected successfully!");
        setTimeout(() => {
          setConnectStatus("");
          loadStatus();
          loadDiagnostics();
        }, 2000);
      } else {
        setConnectStatus(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
      setConnectStatus("");
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!canManageDrive) {
      setError("Your role does not have permission to manage Drive accounts.");
      return;
    }
    setDisconnectingId(accountId);
    setError("");
    try {
      await disconnectDrive(accountId);
      await loadStatus();
      await loadDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleSync = async (mode: DriveSyncMode) => {
    if (!canManageDrive) {
      setError("Your role does not have permission to sync Drive documents.");
      return;
    }
    setSyncing(true);
    setSyncStatus(
      mode === "full"
        ? "Refreshing all Drive documents..."
        : "Refreshing recent changes..."
    );
    setError("");
    try {
      const result = await syncDrive(mode);
      if (result.success) {
        setSyncStatus(
          `Successfully synced ${result.synced} document${result.synced === 1 ? "" : "s"}.`
        );
        await loadDiagnostics();
      } else {
        setError("Sync operation failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(""), 3000);
    }
  };

  const isLocalMode = driveDiagnostics?.providerMode === "local";
  const hasAccounts = accounts.length > 0;
  const pendingCount = driveDiagnostics?.ingestion.queued ?? 0;
  const processingCount = driveDiagnostics?.ingestion.processing ?? 0;
  const failedCount = driveDiagnostics?.ingestion.failed ?? 0;

  return (
    <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
      <div className="operon-panel space-y-6 p-8">
        <div>
          <p className="text-sm font-medium text-content-tertiary">
            Google Drive Integration
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-content-primary">
            Drive Management
          </h2>
          <p className="mt-2 text-sm text-content-secondary">
            Connect, sync, and manage Drive documents with role-based access
            control.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[20px] border border-border bg-bg-primary/80 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Status
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  isLocalMode
                    ? "bg-amber-500"
                    : hasAccounts
                      ? "bg-green-500"
                      : "bg-gray-400"
                }`}
              />
              <span className="text-sm font-semibold text-content-primary">
                {isLocalMode
                  ? "Local Fallback"
                  : hasAccounts
                    ? "Connected"
                    : "Not Connected"}
              </span>
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-bg-primary/80 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Accounts
            </div>
            <div className="mt-2 text-2xl font-semibold text-content-primary">
              {accounts.length}
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-bg-primary/80 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Pending Sync
            </div>
            <div className="mt-2 text-2xl font-semibold text-content-primary">
              {pendingCount}
            </div>
          </div>

          <div className="rounded-[20px] border border-border bg-bg-primary/80 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
              Processing
            </div>
            <div className="mt-2 text-2xl font-semibold text-content-primary">
              {processingCount}
            </div>
          </div>
        </div>

        {hasAccounts ? (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-content-primary">
              Connected Accounts
            </div>
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-[20px] border border-border bg-bg-primary/80 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-content-primary">
                      {account.displayName || account.email}
                    </div>
                    <div className="mt-1 truncate text-sm text-content-secondary">
                      {account.email}
                    </div>
                    {account.expiresAt && (
                      <div className="mt-1 text-xs text-content-tertiary">
                        Token expires:{" "}
                        {new Date(account.expiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  {canManageDrive && (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id)}
                      disabled={disconnectingId === account.id}
                      className="shrink-0 rounded-full border border-rose-500 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      {disconnectingId === account.id ? "..." : "Disconnect"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {canManageDrive && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="h-10 w-full rounded-[20px] bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Connecting..." : "Add Google Drive Account"}
            </button>
            {connectStatus && (
              <p className="text-sm text-content-secondary">{connectStatus}</p>
            )}
          </div>
        )}

        {canManageDrive && hasAccounts && (
          <div className="space-y-3 border-t border-border pt-6">
            <div className="text-sm font-semibold text-content-primary">
              Sync Options
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleSync("incremental")}
                disabled={syncing}
                className="h-10 rounded-[20px] border border-border bg-bg-primary/80 px-4 text-sm font-semibold text-content-primary transition hover:border-border-strong hover:bg-bg-secondary disabled:opacity-50"
              >
                Incremental Sync
              </button>
              <button
                type="button"
                onClick={() => handleSync("full")}
                disabled={syncing}
                className="h-10 rounded-[20px] border border-border bg-bg-primary/80 px-4 text-sm font-semibold text-content-primary transition hover:border-border-strong hover:bg-bg-secondary disabled:opacity-50"
              >
                Full Sync
              </button>
            </div>
            {syncStatus && (
              <p className="text-sm text-content-secondary">{syncStatus}</p>
            )}
          </div>
        )}

        {failedCount > 0 && (
          <div className="rounded-[20px] border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="text-sm font-semibold text-rose-700">
              {failedCount} document{failedCount === 1 ? "" : "s"} failed to
              index
            </div>
            <p className="mt-1 text-sm text-rose-600">
              Check the ingestion logs for details. Retries will occur
              automatically.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-[20px] border border-rose-500/30 bg-rose-500/10 p-4">
            <div className="text-sm font-semibold text-rose-700">{error}</div>
          </div>
        )}
      </div>

      <aside className="operon-panel space-y-4 p-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
            Ingestion Health
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Total jobs</span>
              <span className="font-semibold text-content-primary">
                {driveDiagnostics?.ingestion.total ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Queued</span>
              <span className="font-semibold text-content-primary">
                {pendingCount}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Processing</span>
              <span className="font-semibold text-content-primary">
                {processingCount}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Failed</span>
              <span className="font-semibold text-rose-600">{failedCount}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-content-tertiary">
            Parser Status
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Pending</span>
              <span className="font-semibold text-content-primary">
                {driveDiagnostics?.parser.pending ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Parsed</span>
              <span className="font-semibold text-green-600">
                {driveDiagnostics?.parser.parsed ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-[16px] bg-bg-primary/80 px-3 py-2">
              <span className="text-sm text-content-secondary">Failed</span>
              <span className="font-semibold text-rose-600">
                {driveDiagnostics?.parser.failed ?? 0}
              </span>
            </div>
          </div>
        </div>

        {!canManageDrive && (
          <div className="rounded-[16px] bg-bg-primary/80 p-3 text-xs text-content-tertiary">
            Your role does not have Drive management permissions.
          </div>
        )}
      </aside>
    </section>
  );
}
