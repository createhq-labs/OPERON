"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

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
    <motion.section
      className="grid gap-8 xl:grid-cols-[1fr_320px]"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={itemVariants}
        className="glass-card border-white/8 p-8 rounded-2xl"
      >
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <h2 className="text-h2 text-white">Cloud Storage</h2>
          <p className="text-text-secondary mt-1">Manage Google Drive connections and sync</p>
        </motion.div>

        {hasAccounts ? (
          <motion.div
            className="space-y-3"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {accounts.map((account, index) => (
              <motion.div
                key={account.id}
                variants={itemVariants}
                className="glass-card border-white/8 p-4 rounded-xl flex items-center justify-between hover:border-white/12 transition-all duration-250"
                whileHover={{ x: 2 }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-600 text-white">
                    {account.displayName || account.email}
                  </div>
                  <div className="mt-1 truncate text-sm text-text-tertiary">
                    {account.email}
                  </div>
                </div>
                {canManageDrive && (
                  <motion.button
                    type="button"
                    onClick={() => handleDisconnect(account.id)}
                    disabled={disconnectingId === account.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="shrink-0 ml-4 px-3 py-1.5 text-sm font-500 text-status-error hover:bg-status-error/10 rounded-lg transition-all duration-250 disabled:opacity-50"
                  >
                    {disconnectingId === account.id ? "Removing…" : "Remove"}
                  </motion.button>
                )}
              </motion.div>
            ))}
          </motion.div>
        ) : null}

        {canManageDrive && (
          <motion.div
            variants={itemVariants}
            className="mt-8 space-y-3 border-t border-white/8 pt-8"
          >
            <motion.button
              type="button"
              onClick={handleConnect}
              disabled={syncing}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="w-full btn-premium h-11 font-600 text-white disabled:opacity-50"
            >
              {hasAccounts ? "Add Account" : "Connect Drive"}
            </motion.button>
            {hasAccounts && (
              <motion.div
                className="grid gap-2 grid-cols-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
              >
                <motion.button
                  type="button"
                  onClick={() => handleSync("incremental")}
                  disabled={syncing}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="glass-card border-white/8 hover:border-white/12 px-3 py-2.5 text-sm font-600 text-white rounded-xl transition-all duration-250 disabled:opacity-50"
                >
                  {syncing ? "Syncing…" : "Quick Sync"}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => handleSync("full")}
                  disabled={syncing}
                  whileHover={{ scale: 1.05, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="glass-card border-white/8 hover:border-white/12 px-3 py-2.5 text-sm font-600 text-white rounded-xl transition-all duration-250 disabled:opacity-50"
                >
                  Full Sync
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 glass-card border-status-error/30 bg-status-error/5 p-4 rounded-xl text-sm text-status-error"
          >
            {error}
          </motion.div>
        )}
      </motion.div>

      {/* Sidebar Stats */}
      <motion.aside
        variants={itemVariants}
        className="glass-card border-white/8 p-6 rounded-2xl h-fit"
      >
        <motion.div
          className="text-xs font-600 text-text-secondary uppercase tracking-wide mb-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          Status
        </motion.div>

        <motion.div
          className="space-y-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants} className="flex items-center justify-between p-2 hover:bg-white/4 rounded-lg transition-colors">
            <span className="text-sm text-text-secondary">Connected</span>
            <motion.span
              className="font-display font-600 text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              {accounts.length}
            </motion.span>
          </motion.div>

          {failedCount > 0 && (
            <motion.div variants={itemVariants} className="flex items-center justify-between p-2 hover:bg-status-error/5 rounded-lg transition-colors">
              <span className="text-sm text-text-secondary">Failed Items</span>
              <motion.span
                className="font-display font-600 text-status-error"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 0.35 }}
              >
                {failedCount}
              </motion.span>
            </motion.div>
          )}
        </motion.div>

        {driveDiagnostics && (
          <>
            <motion.div className="border-t border-white/8 my-5" />
            <motion.div
              className="space-y-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="text-xs font-600 text-text-secondary uppercase tracking-wide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                Queue
              </motion.div>
              <motion.div className="space-y-2 text-sm">
                <motion.div variants={itemVariants} className="flex items-center justify-between p-2 hover:bg-white/4 rounded-lg transition-colors">
                  <span className="text-text-secondary">Pending</span>
                  <motion.span
                    className="font-display font-600 text-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    {driveDiagnostics.ingestion.queued}
                  </motion.span>
                </motion.div>
                <motion.div variants={itemVariants} className="flex items-center justify-between p-2 hover:bg-white/4 rounded-lg transition-colors">
                  <span className="text-text-secondary">Processing</span>
                  <motion.span
                    className="font-display font-600 text-white"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.45 }}
                  >
                    {driveDiagnostics.ingestion.processing}
                  </motion.span>
                </motion.div>
              </motion.div>
            </motion.div>
          </>
        )}
      </motion.aside>
    </motion.section>
  );
}

