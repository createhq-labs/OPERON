"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import type { User } from "@/core/types";
import {
  canManageRoles,
  canPublishGlobally,
  canViewActivity,
  getRoleLabel,
} from "@/core/operon";
import { useSession } from "@/auth/useSession";
import { Sidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { S } from "@/styles/sharedUi";

type DashboardSection =
  | "home"
  | "library"
  | "workforce"
  | "resources"
  | "activity"
  | "finance"
  | "roles";

interface DashboardRouteShellProps {
  user: User;
  title: string;
  activeSection: DashboardSection;
  children: ReactNode;
}

function sectionHref(section: DashboardSection) {
  if (section === "home") return "/";
  if (section === "workforce") return "/workforce";
  return `/?section=${section}`;
}

export function DashboardRouteShell({
  user,
  title,
  activeSection,
  children,
}: DashboardRouteShellProps) {
  const router = useRouter();
  const { signOut } = useSession();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Order must exactly match src/app/page.tsx's own visibleSections
  // construction — this is a second, independent nav-rendering shell
  // (only used by the Workforce module) and having its section order
  // drift from the home dashboard's is what caused Workforce/Resources
  // to visually swap places depending on which shell was active.
  const visibleSections = useMemo(() => {
    const sections: DashboardSection[] = ["home", "library", "resources"];
    sections.push("workforce");
    if (canViewActivity(user)) sections.push("activity");
    if (canPublishGlobally(user)) sections.push("finance");
    if (canManageRoles(user)) sections.push("roles");
    return sections;
  }, [user]);

  const roleLabel = user.roleName ?? getRoleLabel(user.roleId);

  function handleSectionSelect(section: string) {
    router.push(sectionHref(section as DashboardSection));
    setIsMobileNavOpen(false);
  }

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  return (
    <div style={{ minHeight: "100dvh" }}>
      <AnimatePresence>
        {isMobileNavOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 40, display: "flex" }}
          >
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsMobileNavOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", border: "none", cursor: "pointer" }}
            />
            <div style={{ position: "relative", left: "16px", top: "16px", height: "calc(100dvh - 32px)", width: "240px" }}>
              <Sidebar
                user={user}
                roleLabel={roleLabel}
                sections={visibleSections}
                selectedSection={activeSection}
                onClose={() => setIsMobileNavOpen(false)}
                onSelect={handleSectionSelect}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "260px minmax(0,1fr)",
          gap: "clamp(12px, 1.5vw, 24px)",
          padding: "clamp(16px, 2vw, 32px) clamp(16px, 3vw, 40px)",
          width: "100%",
        }}
        className="page-grid"
      >
        <div className="sidebar-col">
          <Sidebar
            user={user}
            roleLabel={roleLabel}
            sections={visibleSections}
            selectedSection={activeSection}
            onSelect={handleSectionSelect}
          />
        </div>

        <main style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "clamp(14px, 1.5vw, 24px)" }}>
          <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "10px 18px", ...S.card }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                className="mobile-only"
                style={{ display: "none", alignItems: "center", justifyContent: "center", height: "36px", width: "36px", borderRadius: "var(--r-md)", border: "1px solid var(--op-border)", background: "var(--op-surface-2)", cursor: "pointer", color: "var(--op-text-2)" }}
                aria-label="Open navigation"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-16)", fontWeight: 600, color: "var(--op-text)", margin: 0 }}>
                {title}
              </h1>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <NotificationBell user={user} />
              <button
                type="button"
                onClick={handleLogout}
                style={{ height: "34px", borderRadius: "var(--r-full)", background: "#fff", border: "none", padding: "0 16px", fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600, color: "#0A0A0A", cursor: "pointer" }}
              >
                Sign out
              </button>
            </div>
          </motion.header>

          {children}
        </main>
      </div>
    </div>
  );
}
