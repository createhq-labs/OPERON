"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSession } from "@/auth/useSession";
import { S } from "@/styles/sharedUi";
import { NotificationBell } from "@/features/notifications/NotificationBell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Tab {
  id:    string;
  label: string;
  href:  string;
}

interface DashboardShellProps {
  /** Section title shown in the top nav bar */
  title: string;
  /** Optional breadcrumb back link */
  backHref?: string;
  backLabel?: string;
  /** Tab strip rendered between the header and content */
  tabs?: Tab[];
  /** Resolved active tab id — used to highlight the active pill */
  activeTabId?: string;
  children: ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Shared page shell for all dashboard sections (Workforce, Library, Resources,
 * Attendance, Leave, Probation, Onboarding, Deboarding).
 *
 * Layout contract:
 *   max-width: 1440px | margin: 0 auto | padding: 32px 40px
 *
 * Structure:
 *   TopNav (title + sign-out)
 *   [optional] Tab strip
 *   Content
 */
export function DashboardShell({
  title,
  backHref,
  backLabel = "← Dashboard",
  tabs,
  activeTabId,
  children,
}: DashboardShellProps) {
  const { user, signOut } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  return (
    <div style={{ minHeight: "100dvh" }}>
      <div
        style={{
          maxWidth:      "1440px",
          margin:        "0 auto",
          padding:       "32px 40px",
          display:       "flex",
          flexDirection: "column",
          gap:           "24px",
        }}
        className="dashboard-shell-container"
      >
        {/* ── Top nav ───────────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            "16px",
            padding:        "10px 18px",
            ...S.card,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {backHref && (
              <>
                <Link
                  href={backHref}
                  style={{
                    fontFamily:  "var(--font-ui)",
                    fontSize:    "var(--text-13)",
                    color:       "var(--op-text-3)",
                    textDecoration: "none",
                  }}
                >
                  {backLabel}
                </Link>
                <span style={{ color: "var(--op-border)", userSelect: "none" }}>|</span>
              </>
            )}
            <h1
              style={{
                fontFamily:    "var(--font-display)",
                fontSize:      "var(--text-16)",
                fontWeight:    600,
                color:         "var(--op-text)",
                letterSpacing: "-0.01em",
                margin:        0,
              }}
            >
              {title}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {user && <NotificationBell user={user} />}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                height:      "34px",
                borderRadius: "var(--r-full)",
                background:   "#fff",
                border:       "none",
                padding:      "0 16px",
                fontFamily:   "var(--font-ui)",
                fontSize:     "var(--text-13)",
                fontWeight:   600,
                color:        "#0A0A0A",
                cursor:       "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </motion.header>

        {/* ── Tab strip (optional) ──────────────────────────────────────── */}
        {tabs && tabs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                style={
                  S.pill(activeTabId === tab.id) as React.CSSProperties
                }
              >
                {tab.label}
              </Link>
            ))}
          </div>
        )}

        {/* ── Page content ──────────────────────────────────────────────── */}
        <div style={{ flex: 1 }}>
          {children}
        </div>

      </div>

      <style>{`
        @media (max-width: 767px) {
          .dashboard-shell-container {
            padding: 16px 20px !important;
            gap: 16px !important;
          }
        }
        @media (max-width: 480px) {
          .dashboard-shell-container {
            padding: 12px 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
