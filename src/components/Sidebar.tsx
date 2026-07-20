"use client";

import Image from "next/image";
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  CircleDollarSign,
  Home,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { User } from "@/core/types";
import { Logo } from "@/components/Logo";
import { spring } from "@/styles/motionPresets";
import { canManageDrive } from "@/security/permissions";

// ─── Icons ────────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, LucideIcon> = {
  home:      Home,
  library:   BookOpen,
  resources: BriefcaseBusiness,
  activity:  Activity,
  finance:   CircleDollarSign,
  team:      Users,
  roles:     Settings2,
  workforce: Users,
};

const SECTION_LABELS: Record<string, string> = {
  home:      "Home",
  library:   "Library",
  resources: "Resources",
  activity:  "Activity",
  finance:   "Finance",
  team:      "Team",
  roles:     "Roles",
  workforce: "Workforce",
};

// ─── Drive Status ─────────────────────────────────────────────────────────────

function DriveStatus({ connected }: { connected: boolean }) {
  return (
    <div
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "7px",
        padding:      "7px 10px",
        borderRadius: "var(--r-md)",
        background:   "var(--op-surface-2)",
        border:       "1px solid var(--op-border)",
      }}
      role="status"
      aria-label={connected ? "Central storage connected" : "Central storage unavailable"}
    >
      <div
        style={{
          width:        "5px",
          height:       "5px",
          borderRadius: "50%",
          background:   connected ? "#4ade80" : "var(--op-text-3)",
          flexShrink:   0,
        }}
      />
      <span
        style={{
          fontFamily:    "var(--font-ui)",
          fontSize:      "var(--text-11)",
          color:         "var(--op-text-3)",
          fontWeight:    500,
          letterSpacing: "0.04em",
        }}
      >
        {connected ? "Central storage connected" : "Central storage unavailable"}
      </span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  user: User;
  roleLabel: string;
  sections: string[];
  selectedSection: string;
  driveConnected?: boolean;
  onSelect: (section: string) => void;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Sidebar({
  user,
  roleLabel,
  sections,
  selectedSection,
  driveConnected = false,
  onSelect,
  onClose,
}: SidebarProps) {
  const initials = useMemo(() => getInitials(user.name), [user.name]);

  const handleSelect = (section: string) => {
    onSelect(section);
    onClose?.();
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={spring.soft}
      aria-label="Main navigation"
      style={{
        position:        "fixed",
        left:            "16px",
        top:             "16px",
        width:           "228px",
        height:          "calc(100dvh - 32px)",
        background:      "var(--op-sidebar-bg)",
        backdropFilter:  "var(--glass-blur-lg)",
        WebkitBackdropFilter: "var(--glass-blur-lg)",
        border:          "1px solid var(--op-border)",
        borderRadius:    "var(--r-xl)",
        boxShadow:       "var(--shadow-lg)",
        padding:         "20px 12px",
        display:         "flex",
        flexDirection:   "column",
        gap:             "4px",
        boxSizing:       "border-box",
        zIndex:          10,
        overflowY:       "auto",
      }}
    >
      {/* Logo — only branding placement in the app */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: [0.44, 0, 0.56, 1] }}
        style={{
          padding:      "0 8px 18px",
          borderBottom: "1px solid var(--op-border)",
          marginBottom: "8px",
        }}
      >
        <Logo variant="sidebar" />
      </motion.div>

      {/* Navigation */}
      <nav
        aria-label="Application sections"
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}
      >
        {sections.map((section, index) => {
          const active = selectedSection === section;
          const label = SECTION_LABELS[section] ?? section;
          const Icon = SECTION_ICONS[section] ?? Settings2;
          return (
            <motion.button
              key={section}
              type="button"
              onClick={() => handleSelect(section)}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.25,
                delay:    index * 0.04,
                ease:     [0.44, 0, 0.56, 1],
              }}
              whileHover={{ x: active ? 0 : 2, backgroundColor: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.045)" }}
              whileTap={{ scale: 0.985 }}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          "9px",
                padding:      "7px 10px",
                borderRadius: "var(--r-md)",
                fontFamily:   "var(--font-ui)",
                fontSize:     "var(--text-14)",
                fontWeight:   active ? 600 : 500,
                color:        active ? "var(--op-text)" : "var(--op-text-2)",
                background:   active ? "rgba(255,255,255,0.08)" : "transparent",
                border:       "none",
                cursor:       "pointer",
                transition:   "background 140ms, color 140ms",
                position:     "relative",
                textAlign:    "left",
                width:        "100%",
              }}
            >
              {/* Active indicator bar */}
              {active && (
                <motion.div
                  layoutId="sidebar-active-indicator"
                  style={{
                    position:     "absolute",
                    inset:        0,
                    borderRadius: "var(--r-md)",
                    border:       "1px solid rgba(255,255,255,0.05)",
                    background:   "var(--op-accent)",
                    opacity:      0.1,
                  }}
                  transition={spring.snappy}
                />
              )}
              <span
                style={{
                  color:      active ? "var(--op-accent)" : "var(--op-text-3)",
                  display:    "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span>{label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Central Drive storage status — admin diagnostics only. Regular users
          never see Google Drive referenced anywhere in the UI. */}
      {canManageDrive(user) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.18 }}
          style={{ marginTop: "auto", paddingTop: "8px" }}
        >
          <DriveStatus connected={driveConnected} />
        </motion.div>
      )}

      {/* Role badge */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2, ease: [0.44, 0, 0.56, 1] }}
        style={{
          fontFamily:    "var(--font-ui)",
          fontSize:      "var(--text-11)",
          fontWeight:    600,
          background:    "var(--op-surface-3)",
          border:        "1px solid var(--op-border)",
          borderRadius:  "var(--r-full)",
          padding:       "3px 10px",
          color:         "var(--op-text-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textAlign:     "center",
          margin:        "4px 8px",
        }}
        role="note"
        aria-label={`Current role: ${roleLabel}`}
      >
        {roleLabel}
      </motion.div>

      {/* User profile */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25, ease: [0.44, 0, 0.56, 1] }}
        style={{
          display:    "flex",
          alignItems: "center",
          gap:        "10px",
          padding:    "12px 8px 4px",
          borderTop:  "1px solid var(--op-border)",
          marginTop:  "4px",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width:          "28px",
            height:         "28px",
            borderRadius:   "var(--r-sm)",
            background:     "var(--op-surface-2)",
            border:         "1px solid var(--op-border)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
            fontFamily:     "var(--font-ui)",
            fontSize:       "var(--text-11)",
            fontWeight:     600,
            color:          "var(--op-text-2)",
            overflow:       "hidden",
          }}
          aria-hidden="true"
        >
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt=""
              width={28}
              height={28}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              unoptimized
            />
          ) : (
            initials
          )}
        </div>

        {/* Name + email */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily:   "var(--font-ui)",
              fontSize:     "var(--text-13)",
              fontWeight:   500,
              color:        "var(--op-text-2)",
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}
          >
            {user.name}
          </div>
          {user.email && (
            <div
              style={{
                fontFamily:   "var(--font-body)",
                fontSize:     "var(--text-11)",
                color:        "var(--op-text-3)",
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
                marginTop:    "1px",
              }}
            >
              {user.email}
            </div>
          )}
        </div>
      </motion.div>
    </motion.aside>
  );
}
