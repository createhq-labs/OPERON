"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/auth/authContext";
import { ROLE_SELECTION_OPTIONS } from "@/core/roles";

// ─── Role descriptions ────────────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<string, string> = {
  role_cofounder:    "Full platform owner",
  role_hr:           "Onboarding and policies",
  role_finance:      "SOPs and reporting",
  role_im_team_lead: "IM Team & SOPs",
  role_tm_team_lead: "TM Team & SOPs",
  role_creator:      "Marketing and brand",
  role_employee:     "Team member (IM/TM)",
  role_intern:       "Restricted training",
};

// ─── SVG paths — Create icon mark only (C symbol + || bars) ──────────────────
// Letter glyphs (R, E, A, T, E) intentionally excluded.
// C outer spans x:330–962, y:676–1316. Bars at x:891–960, y:953–1047.
// ViewBox "310 660 670 680" fits the full icon with breathing room.

const CREATE_ICON_PATHS = [
  // C outer ring
  "M810.1,922.1c-0.1-0.1-0.2-0.2-0.3-0.3c-21.1-21.8-50.2-34.1-80.5-34.1c-62,0-112.2,50.2-112.2,112.2c0,62,50.2,112.2,112.2,112.2c30.2,0,59.1-12.2,80.2-33.8c12.9-13,30.4-20.4,48.7-20.4c37.8,0,68.5,30.7,68.5,68.5c0,12.3-3.3,24.3-9.5,34.8c-56.9,95.9-160.1,154.6-271.6,154.6c-174.5,0-315.9-141.4-315.9-315.9c0-174.5,141.4-315.9,315.9-315.9c111.5,0,214.7,58.7,271.6,154.6c6.2,10.5,9.5,22.6,9.5,34.8c0,37.8-30.7,68.5-68.5,68.5C840.3,942,823,934.8,810.1,922.1z",
  // C inner highlight
  "M765.8,1080.2c-11.1,5-23.4,7.9-36.4,7.9c-48.7,0-88.1-39.4-88.1-88.1c0-13.4,3-26.1,8.3-37.4c-0.5,4-0.7,8-0.7,12.1c0,58.6,47.5,106.1,106.1,106.1C758.6,1080.8,762.2,1080.6,765.8,1080.2z",
  // | bar (right)
  "M948.1,953.1L948.1,953.1c-6.3,0-11.4,5.1-11.4,11.4v71c0,6.3,5.1,11.4,11.4,11.4h0c6.3,0,11.4-5.1,11.4-11.4v-71C959.5,958.2,954.4,953.1,948.1,953.1z",
  // | bar (left)
  "M902.5,953.1L902.5,953.1c-6.3,0-11.4,5.1-11.4,11.4v71c0,6.3,5.1,11.4,11.4,11.4h0c6.3,0,11.4-5.1,11.4-11.4v-71C913.9,958.2,908.7,953.1,902.5,953.1z",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MVPAccessMode() {
  const { loaded, selectRole } = useAuth();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [pendingRoleId,  setPendingRoleId]  = useState<string | null>(null);

  const handleContinue = useCallback(async () => {
    if (!selectedRoleId) return;
    const role = ROLE_SELECTION_OPTIONS.find((o) => o.id === selectedRoleId);
    if (!role) return;
    setPendingRoleId(selectedRoleId);
    try {
      await selectRole(selectedRoleId, role.title);
    } finally {
      setPendingRoleId(null);
    }
  }, [selectRole, selectedRoleId]);

  if (!loaded) {
    return (
      <div
        style={{
          minHeight:      "100dvh",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            background:   "var(--op-surface)",
            border:       "1px solid var(--op-border)",
            borderRadius: "var(--r-lg)",
            padding:      "16px 24px",
            fontSize:     "var(--text-14)",
            color:        "var(--op-text-3)",
            fontFamily:   "var(--font-ui)",
          }}
        >
          Loading…
        </motion.div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight:     "100dvh",
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        justifyContent:"center",
        padding:       "60px 24px",
      }}
    >

      {/* ── Branding block: Create logo above Operon wordmark ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.44, 0, 0.56, 1] }}
        style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:            "20px",
          marginBottom:   "72px",
        }}
      >
        {/* Create icon mark — C symbol + || bars only */}
        <svg
          viewBox="310 660 670 680"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            width:   "140px",
            height:  "auto",
            display: "block",
          }}
          aria-label="Create"
          role="img"
        >
          {CREATE_ICON_PATHS.map((d, i) => (
            <path key={i} fillRule="evenodd" clipRule="evenodd" fill="#FFFFFF" d={d} />
          ))}
        </svg>

        {/* Operon wordmark — Satoshi, same family as the rest of the design system */}
        <span
          style={{
            fontFamily:    "var(--font-display)",   /* Satoshi */
            fontSize:      "22px",
            fontWeight:    600,
            color:         "#FFFFFF",
            letterSpacing: "-0.025em",
            lineHeight:    1,
          }}
        >
          Operon
        </span>
      </motion.div>

      {/* ── Headline ── */}
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06, ease: [0.44, 0, 0.56, 1] }}
        style={{
          fontFamily:    "var(--font-display)",
          fontSize:      "clamp(28px, 4vw, 48px)",
          fontWeight:    300,
          letterSpacing: "-0.03em",
          color:         "#fff",
          marginBottom:  "12px",
          textAlign:     "center",
        }}
      >
        Who are you?
      </motion.h1>

      {/* ── Subtext ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        style={{
          fontFamily:   "var(--font-body)",
          fontSize:     "var(--text-14)",
          color:        "var(--op-text-3)",
          marginBottom: "48px",
          textAlign:    "center",
        }}
      >
        Select your role to continue.
      </motion.p>

      {/* ── Role grid ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.16 }}
        style={{
          display:             "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap:                 "10px",
          maxWidth:            "680px",
          width:               "100%",
          marginBottom:        "40px",
        }}
        className="mvp-role-grid"
      >
        {ROLE_SELECTION_OPTIONS.map((role, index) => {
          const isSelected = role.id === selectedRoleId;
          const desc       = ROLE_DESCRIPTIONS[role.id] ?? "";
          return (
            <motion.button
              key={role.id}
              type="button"
              onClick={() => setSelectedRoleId(role.id)}
              disabled={Boolean(pendingRoleId)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay:    0.16 + index * 0.04,
                ease:     [0.44, 0, 0.56, 1],
              }}
              whileHover={!pendingRoleId ? { y: -2 } : {}}
              whileTap={!pendingRoleId ? { scale: 0.98 } : {}}
              style={{
                background:   isSelected ? "rgba(255,255,255,0.06)" : "var(--op-surface)",
                border:       `1px solid ${isSelected ? "rgba(255,255,255,0.28)" : "var(--op-border)"}`,
                borderRadius: "var(--r-lg)",
                padding:      "18px 16px",
                cursor:       pendingRoleId ? "not-allowed" : "pointer",
                transition:   "border-color 150ms, background 150ms",
                opacity:      pendingRoleId && !isSelected ? 0.45 : 1,
                textAlign:    "left",
              }}
            >
              <div
                style={{
                  fontFamily:   "var(--font-ui)",
                  fontSize:     "var(--text-14)",
                  fontWeight:   600,
                  color:        isSelected ? "#fff" : "var(--op-text-2)",
                  marginBottom: "4px",
                  transition:   "color 150ms",
                }}
              >
                {role.title}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize:   "var(--text-12)",
                  color:      "var(--op-text-3)",
                }}
              >
                {desc}
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      {/* ── Continue ── */}
      <motion.button
        type="button"
        onClick={handleContinue}
        disabled={!selectedRoleId || Boolean(pendingRoleId)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.36, ease: [0.44, 0, 0.56, 1] }}
        whileHover={selectedRoleId && !pendingRoleId ? { scale: 1.02 } : {}}
        whileTap={selectedRoleId && !pendingRoleId ? { scale: 0.98 } : {}}
        style={{
          background:    !selectedRoleId || pendingRoleId ? "rgba(255,255,255,0.12)" : "#fff",
          color:         !selectedRoleId || pendingRoleId ? "rgba(255,255,255,0.3)" : "#111",
          fontFamily:    "var(--font-ui)",
          fontSize:      "var(--text-14)",
          fontWeight:    600,
          border:        "none",
          borderRadius:  "var(--r-full)",
          padding:       "11px 40px",
          cursor:        !selectedRoleId || pendingRoleId ? "not-allowed" : "pointer",
          transition:    "background 150ms, color 150ms",
          letterSpacing: "-0.01em",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {pendingRoleId ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Continuing…
            </motion.span>
          ) : (
            <motion.span
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Continue
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <style>{`
        @media (max-width: 1023px) {
          .mvp-role-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 599px) {
          .mvp-role-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}