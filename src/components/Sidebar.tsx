"use client";

import Image from "next/image";
import { useMemo } from "react";
import { motion } from "framer-motion";
import type { User } from "@/core/types";
import { Logo } from "@/components/Logo";

// ─── Icons ────────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-4V10h-3v4.5h-4A.5.5 0 012 14V6.5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    </svg>
  ),
  library: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.25"/>
      <rect x="9" y="2" width="5" height="7" rx="1" stroke="currentColor" strokeWidth="1.25"/>
      <rect x="9" y="11" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  ),
  resources: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M8 2.5c-2 2-2 7 0 11M8 2.5c2 2 2 7 0 11M2.5 8h11" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  ),
  activity: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 8h2.5l2-5 3 9 2-6 1.5 2H14.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  finance: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5v13M5 4.5h4.5a2 2 0 010 4H6.5a2 2 0 000 4H11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  ),
  team: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M1 13.5c0-2.5 2.5-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
      <circle cx="12" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M14.5 13c0-1.8-1.2-3-3-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  ),
  roles: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  ),
};

const SECTION_LABELS: Record<string, string> = {
  home:      "Home",
  library:   "Library",
  resources: "Resources",
  activity:  "Activity",
  finance:   "Finance",
  team:      "Team",
  roles:     "Roles",
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
      aria-label={connected ? "Google Drive connected" : "Google Drive disconnected"}
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
        {connected ? "Drive connected" : "Drive disconnected"}
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
      transition={{ duration: 0.3, ease: [0.44, 0, 0.56, 1] }}
      aria-label="Main navigation"
      style={{
        position:        "fixed",
        left:            0,
        top:             0,
        width:           "var(--sidebar-width)",
        height:          "100dvh",
        background:      "var(--op-sidebar-bg)",
        backdropFilter:  "var(--glass-blur-lg)",
        WebkitBackdropFilter: "var(--glass-blur-lg)",
        borderRight:     "1px solid var(--op-border)",
        padding:         "20px 12px",
        display:         "flex",
        flexDirection:   "column",
        gap:             "4px",
        boxSizing:       "border-box",
        zIndex:          10,
        overflowY:       "auto",
      }}
      className="hidden xl:flex"
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
              whileHover={!active ? { x: 2 } : {}}
              whileTap={{ scale: 0.98 }}
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
                background:   active ? "rgba(255,255,255,0.06)" : "transparent",
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
                    left:         0,
                    top:          "22%",
                    bottom:       "22%",
                    width:        "2px",
                    borderRadius: "1px",
                    background:   "var(--op-accent)",
                  }}
                  transition={{ duration: 0.2, ease: [0.44, 0, 0.56, 1] }}
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
                {SECTION_ICONS[section]}
              </span>
              <span>{label}</span>
            </motion.button>
          );
        })}
      </nav>

      {/* Drive status */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.18 }}
        style={{ marginTop: "auto", paddingTop: "8px" }}
      >
        <DriveStatus connected={driveConnected} />
      </motion.div>

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