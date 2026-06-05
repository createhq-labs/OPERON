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
  const [syncing, setSyncing] = useState(false);
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
      setError("Failed to load Drive status");
    }
  }, []);

  const loadDiagnostics = useCallback(async () => {
    try {
      const diags = await getDriveDiagnostics();
      onDiagnosticsUpdate(diags);
    } catch {
      // Best effort
    }
  }, [onDiagnosticsUpdate]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    if (!canManageDrive) {
      setError("No permission");
      return;
    }
    setConnectStatus("Connecting…");
    setError("");
    try {
      const result = await connectDrive();
      if (result.connected) {
        setConnectStatus("");
        setTimeout(() => {
          loadStatus();
          loadDiagnostics();
        }, 1500);
      } else {
        setConnectStatus("");
        setError(result.message);
      }
    } catch (err) {
      setError("Connection failed");
      setConnectStatus("");
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!canManageDrive) return;
    setDisconnectingId(accountId);
    setError("");
    try {
      await disconnectDrive(accountId);
      await loadStatus();
      await loadDiagnostics();
    } catch (err) {
      setError("Disconnect failed");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleSync = async (mode: DriveSyncMode) => {
    if (!canManageDrive) return;
    setSyncing(true);
    setError("");
    try {
      await syncDrive(mode);
      await loadDiagnostics();
    } catch (err) {
      setError("Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const isLocalMode = driveDiagnostics?.providerMode === "local";
  const hasAccounts = accounts.length > 0;
  const failedCount = driveDiagnostics?.ingestion.failed ?? 0;

  return (
    <section className="grid gap-8 xl:grid-cols-[1fr_280px]">
      <div className="rounded-[12px] border border-border bg-bg-secondary p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-content-primary">Drive</h2>
        </div>

        {hasAccounts ? (
          <div className="space-y-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-[12px] border border-border/50 bg-bg-primary p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-content-primary">
                    {account.displayName || account.email}
                  </div>
                  <div className="mt-1 truncate text-sm text-content-tertiary">
                    {account.email}
                  </div>
                </div>
                {canManageDrive && (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(account.id)}
                    disabled={disconnectingId === account.id}
                    className="shrink-0 ml-4 text-sm text-rose-600 hover:text-rose-700 disabled:opacity-50"
                  >
                    {disconnectingId === account.id ? "…" : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {canManageDrive && (
          <div className="mt-8 space-y-3 border-t border-border/50 pt-8">
            <button
              type="button"
              onClick={handleConnect}
              disabled={syncing}
              className="w-full rounded-[12px] bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {hasAccounts ? "Add Account" : "Connect Drive"}
            </button>
            {hasAccounts && (
              <div className="grid gap-2 grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleSync("incremental")}
                  disabled={syncing}
                  className="rounded-[12px] border border-border/50 bg-bg-primary px-3 py-2 text-sm font-medium text-content-primary hover:bg-bg-secondary disabled:opacity-50"
                >
                  Sync
                </button>
                <button
                  type="button"
                  onClick={() => handleSync("full")}
                  disabled={syncing}
                  className="rounded-[12px] border border-border/50 bg-bg-primary px-3 py-2 text-sm font-medium text-content-primary hover:bg-bg-secondary disabled:opacity-50"
                >
                  Full Sync
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-[12px] border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>

      <aside className="rounded-[12px] border border-border bg-bg-secondary p-6">
        <div className="space-y-4">
          <div className="text-xs font-medium uppercase text-content-tertiary">
            Status
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-content-secondary">Accounts</span>
              <span className="font-medium text-content-primary">
                {accounts.length}
              </span>
            </div>
            {failedCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-secondary">Failed</span>
                <span className="font-medium text-rose-600">{failedCount}</span>
              </div>
            )}
          </div>
        </div>

        {driveDiagnostics && (
          <>
            <div className="border-t border-border/50 my-4" />
            <div className="space-y-4">
              <div className="text-xs font-medium uppercase text-content-tertiary">
                Queue
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-content-secondary">Pending</span>
                  <span className="font-medium text-content-primary">
                    {driveDiagnostics.ingestion.queued}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-content-secondary">Processing</span>
                  <span className="font-medium text-content-primary">
                    {driveDiagnostics.ingestion.processing}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

