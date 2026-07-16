/**
 * Operon Shared Design Language
 * Single source of truth for all inline styles in the authenticated shell.
 *
 * Three exports:
 *   T   — Typography tokens. Every text element belongs to one named role.
 *   Sp  — Spacing scale. Matches --space-N CSS tokens.
 *   S   — Layout / component tokens. Cards, buttons, forms, badges, etc.
 *
 * Never write raw fontFamily / fontSize / fontWeight inline.
 * Never write arbitrary pixel values for spacing.
 * Spread these tokens; add only layout overrides locally.
 */

// ─── T  · Typography ─────────────────────────────────────────────────────────
//
// Semantic roles, not arbitrary sizes.
// Font families follow a strict two-tier system:
//   Primary   → Satoshi / Plus Jakarta Sans  (headings, UI chrome, labels)
//   Secondary → Inter                        (body copy, descriptions, metadata)
//   Utility   → JetBrains Mono              (code, badges, numeric values)

export const T = {

  // ── Display  (Satoshi, weight 300 — editorial, deliberately oversized) ────
  hero: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-54)",
    fontWeight:    300,
    letterSpacing: "-0.03em",
    lineHeight:    1.1,
    color:         "var(--op-text)",
  },
  displayLg: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-30)",
    fontWeight:    300,
    letterSpacing: "-0.03em",
    lineHeight:    1.1,
    color:         "var(--op-text)",
  },
  displayMd: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    300,
    letterSpacing: "-0.02em",
    lineHeight:    1.2,
    color:         "var(--op-text)",
  },

  // ── Page & section structure  (Satoshi, weight 400) ──────────────────────
  pageTitle: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    400,
    letterSpacing: "-0.02em",
    lineHeight:    1.2,
    color:         "var(--op-text)",
    margin:        0,
  },
  pageDesc: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-13)",
    fontWeight: 400,
    lineHeight: 1.6,
    color:      "var(--op-text-3)",
    margin:     0,
    marginTop:  "4px",
  },
  sectionTitle: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    400,
    letterSpacing: "-0.02em",
    color:         "var(--op-text)",
    margin:        0,
  },
  sectionDesc: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-14)",
    fontWeight: 400,
    lineHeight: 1.6,
    color:      "var(--op-text-2)",
    margin:     0,
  },
  sectionLabel: {
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-11)",
    fontWeight:    700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color:         "var(--op-text-3)",
  },

  // ── Card / panel headings  (Plus Jakarta Sans — purposeful at small size) ─
  cardTitle: {
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-13)",
    fontWeight:    700,
    letterSpacing: "-0.01em",
    color:         "var(--op-text)",
  },
  cardDesc: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-12)",
    fontWeight: 400,
    lineHeight: 1.5,
    color:      "var(--op-text-3)",
  },

  // ── Modal / dialog headings ───────────────────────────────────────────────
  modalTitle: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    400,
    letterSpacing: "-0.02em",
    color:         "var(--op-text)",
    margin:        0,
  },

  // ── Body copy  (Inter — legible at reading sizes) ─────────────────────────
  body: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-14)",
    fontWeight: 400,
    lineHeight: 1.6,
    color:      "var(--op-text-2)",
  },
  bodySmall: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-12)",
    fontWeight: 400,
    lineHeight: 1.5,
    color:      "var(--op-text-2)",
  },
  caption: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-11)",
    fontWeight: 400,
    lineHeight: 1.4,
    color:      "var(--op-text-3)",
  },

  // ── UI chrome  (Plus Jakarta Sans — labels, nav, controls) ───────────────
  ui: {
    fontFamily: "var(--font-ui)",
    fontSize:   "var(--text-14)",
    fontWeight: 500,
    color:      "var(--op-text-2)",
  },
  uiMd: {
    fontFamily: "var(--font-ui)",
    fontSize:   "var(--text-13)",
    fontWeight: 500,
    color:      "var(--op-text-2)",
  },
  uiSmall: {
    fontFamily: "var(--font-ui)",
    fontSize:   "var(--text-12)",
    fontWeight: 500,
    color:      "var(--op-text-3)",
  },
  btnText: {
    fontFamily: "var(--font-ui)",
    fontSize:   "var(--text-13)",
    fontWeight: 600,
  },
  inputText: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-14)",
    fontWeight: 400,
  },
  tabLabel: {
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-12)",
    fontWeight:    500,
    letterSpacing: "0.01em",
  },

  // ── Tables ────────────────────────────────────────────────────────────────
  tableHead: {
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-11)",
    fontWeight:    700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color:         "var(--op-text-3)",
  },
  tableCell: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-13)",
    fontWeight: 400,
    color:      "var(--op-text-2)",
  },

  // ── Utility ───────────────────────────────────────────────────────────────
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize:   "var(--text-12)",
    fontWeight: 400,
  },
  monoSm: {
    fontFamily: "var(--font-mono)",
    fontSize:   "var(--text-11)",
    fontWeight: 400,
  },
  badgeText: {
    fontFamily:    "var(--font-mono)",
    fontSize:      "var(--text-11)",
    fontWeight:    400,
    letterSpacing: "0.04em",
  },

} as const;


// ─── Sp  · Spacing ───────────────────────────────────────────────────────────
//
// Named slots matching the --space-N scale in tokens.css.
// Use Sp["4"] instead of "16px". If a value isn't here it doesn't belong.

export const Sp = {
  "1":  "4px",
  "2":  "8px",
  "3":  "12px",
  "4":  "16px",
  "5":  "20px",
  "6":  "24px",
  "8":  "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
} as const;


// ─── S  · Layout / component tokens ─────────────────────────────────────────
//
// Structural patterns: surfaces, controls, navigation, feedback.
// Spread S.card into your style prop, then add layout-specific overrides.

export const S = {

  /** Borderless page section. Hierarchy comes from typography and spacing. */
  section: {
    display:       "flex",
    flexDirection: "column" as const,
    gap:           Sp["8"],
  },
  /** Use once around a related task; never recursively. */
  group: {
    background:   "var(--op-surface)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-lg)",
  },
  /** Quiet secondary fill without another outline. */
  inset: {
    background:   "var(--op-surface-2)",
    borderRadius: "var(--r-md)",
  },
  /** Canonical list/table row; use dividers instead of row cards. */
  row: {
    background:   "transparent",
    border:       "none",
    borderBottom: "1px solid var(--op-border)",
    padding:      `${Sp["3"]} ${Sp["4"]}`,
  },
  toolbar: {
    minHeight:  "48px",
    display:    "flex",
    alignItems: "center",
    gap:        Sp["2"],
    flexWrap:   "wrap" as const,
  },

  // ── Surfaces ─────────────────────────────────────────────────────────────
  card: {
    background:           "var(--op-surface)",
    border:               "1px solid var(--op-border)",
    borderRadius:         "var(--r-lg)",
    backdropFilter:       "var(--glass-blur)",
    WebkitBackdropFilter: "var(--glass-blur)",
  },
  cardInner: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
  },
  cardRaised: {
    background:           "var(--op-surface-3)",
    border:               "1px solid var(--op-border)",
    borderRadius:         "var(--r-lg)",
    backdropFilter:       "var(--glass-blur-sm)",
    WebkitBackdropFilter: "var(--glass-blur-sm)",
    boxShadow:            "var(--shadow-md)",
  },
  glassBase: {
    background:           "var(--op-surface)",
    border:               "1px solid var(--op-border)",
    borderRadius:         "var(--r-lg)",
    backdropFilter:       "var(--glass-blur)",
    WebkitBackdropFilter: "var(--glass-blur)",
  },
  glassRaised: {
    background:           "var(--op-surface-2)",
    border:               "1px solid var(--op-border-hover)",
    borderRadius:         "var(--r-lg)",
    backdropFilter:       "var(--glass-blur-lg)",
    WebkitBackdropFilter: "var(--glass-blur-lg)",
    boxShadow:            "var(--shadow-lg)",
  },
  floatingPanel: {
    background:           "rgba(18, 13, 9, 0.82)",
    border:               "1px solid var(--op-border-hover)",
    borderRadius:         "var(--r-lg)",
    backdropFilter:       "var(--glass-blur-lg)",
    WebkitBackdropFilter: "var(--glass-blur-lg)",
    boxShadow:            "var(--shadow-xl)",
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    borderTop: "1px solid var(--op-border)",
    margin:    "16px 0",
  },

  // ── Form controls ─────────────────────────────────────────────────────────
  input: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
    padding:      "10px 14px",
    fontSize:     "var(--text-14)",
    color:        "var(--op-text)",
    width:        "100%",
    outline:      "none",
    fontFamily:   "var(--font-body)",
    transition:   "border-color var(--dur-fast)",
  },
  select: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
    padding:      "10px 14px",
    fontSize:     "var(--text-14)",
    color:        "var(--op-text)",
    width:        "100%",
    outline:      "none",
    fontFamily:   "var(--font-body)",
    cursor:       "pointer",
    transition:   "border-color var(--dur-fast)",
  },
  textarea: {
    background:   "var(--op-surface-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-md)",
    padding:      "10px 14px",
    fontSize:     "var(--text-14)",
    color:        "var(--op-text)",
    width:        "100%",
    outline:      "none",
    fontFamily:   "var(--font-body)",
    resize:       "vertical" as const,
    lineHeight:   1.6,
    transition:   "border-color var(--dur-fast)",
  },
  label: {
    fontFamily:    "var(--font-ui)",
    fontSize:      "var(--text-12)",
    fontWeight:    500,
    color:         "var(--op-text-3)",
    letterSpacing: "0.04em",
    display:       "block" as const,
    marginBottom:  "6px",
  },
  helperText: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-11)",
    color:      "var(--op-text-3)",
    marginTop:  "4px",
    lineHeight: 1.4,
  },
  errorText: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-11)",
    color:      "var(--color-error)",
    marginTop:  "4px",
    lineHeight: 1.4,
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  btnPrimary: {
    background:   "var(--op-accent)",
    color:        "#000",
    border:       "none",
    borderRadius: "var(--r-full)",
    padding:      "0 20px",
    height:       "38px",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   600,
    cursor:       "pointer",
    display:      "inline-flex" as const,
    alignItems:   "center",
    transition:   "opacity var(--dur-fast), transform var(--dur-fast)",
  },
  btnSecondary: {
    background:   "rgba(255,255,255,0.06)",
    color:        "var(--op-text)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-full)",
    padding:      "0 20px",
    height:       "38px",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   500,
    cursor:       "pointer",
    display:      "inline-flex" as const,
    alignItems:   "center",
    transition:   "border-color var(--dur-fast), background var(--dur-fast)",
  },
  btnGhost: {
    background:   "transparent",
    color:        "var(--op-text-2)",
    border:       "1px solid var(--op-border)",
    borderRadius: "var(--r-full)",
    padding:      "0 16px",
    height:       "34px",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   500,
    cursor:       "pointer",
    display:      "inline-flex" as const,
    alignItems:   "center",
    transition:   "border-color var(--dur-fast), color var(--dur-fast)",
  },
  btnDanger: {
    background:   "transparent",
    color:        "var(--color-error)",
    border:       "1px solid var(--color-error)",
    borderRadius: "var(--r-full)",
    padding:      "0 16px",
    height:       "34px",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   500,
    cursor:       "pointer",
    display:      "inline-flex" as const,
    alignItems:   "center",
    transition:   "background var(--dur-fast)",
  },
  btnIcon: {
    background:     "transparent",
    color:          "var(--op-text-3)",
    border:         "1px solid var(--op-border)",
    borderRadius:   "var(--r-md)",
    width:          "34px",
    height:         "34px",
    padding:        0,
    cursor:         "pointer",
    display:        "inline-flex" as const,
    alignItems:     "center",
    justifyContent: "center" as const,
    transition:     "border-color var(--dur-fast), color var(--dur-fast)",
    flexShrink:     0,
  },

  // ── Badges ────────────────────────────────────────────────────────────────
  badge: {
    display:       "inline-flex",
    alignItems:    "center",
    padding:       "3px 10px",
    borderRadius:  "var(--r-full)",
    background:    "var(--op-surface-3)",
    border:        "1px solid var(--op-border)",
    fontFamily:    "var(--font-mono)",
    fontSize:      "var(--text-11)",
    color:         "var(--op-text-3)",
    letterSpacing: "0.04em",
    whiteSpace:    "nowrap" as const,
  },
  badgeAccent: {
    display:       "inline-flex",
    alignItems:    "center",
    padding:       "3px 10px",
    borderRadius:  "var(--r-full)",
    background:    "var(--op-accent-dim)",
    border:        "1px solid rgba(245,166,35,0.25)",
    fontFamily:    "var(--font-mono)",
    fontSize:      "var(--text-11)",
    color:         "var(--op-accent)",
    letterSpacing: "0.04em",
    whiteSpace:    "nowrap" as const,
  },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabBar: {
    display:      "flex",
    gap:          "3px",
    padding:      "3px",
    borderRadius: "var(--r-full)",
    border:       "1px solid var(--op-border)",
    background:   "var(--op-surface-2)",
  },
  tab: (active: boolean) => ({
    display:      "inline-flex" as const,
    alignItems:   "center",
    padding:      "5px 14px",
    borderRadius: "var(--r-full)",
    border:       "none",
    background:   active ? "rgba(255,255,255,0.08)" : "transparent",
    color:        active ? "var(--op-text)" : "var(--op-text-3)",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-12)",
    fontWeight:   active ? 600 : 500,
    cursor:       "pointer",
    transition:   "all var(--dur-fast)",
    whiteSpace:   "nowrap" as const,
  }),

  // ── Navigation pills ──────────────────────────────────────────────────────
  pill: (active: boolean) => ({
    display:      "inline-flex" as const,
    alignItems:   "center",
    padding:      "5px 14px",
    borderRadius: "var(--r-full)",
    border:       `1px solid ${active ? "var(--op-border-hover)" : "var(--op-border)"}`,
    background:   active ? "rgba(255,255,255,0.08)" : "transparent",
    color:        active ? "var(--op-text)" : "var(--op-text-2)",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-12)",
    fontWeight:   500,
    cursor:       "pointer",
    transition:   "all var(--dur-fast)",
    whiteSpace:   "nowrap" as const,
  }),
  toggleBtn: (active: boolean) => ({
    display:        "flex" as const,
    alignItems:     "center",
    justifyContent: "space-between" as const,
    padding:        "10px 14px",
    borderRadius:   "var(--r-md)",
    border:         `1px solid ${active ? "var(--op-accent)" : "var(--op-border)"}`,
    background:     active ? "rgba(245,166,35,0.08)" : "var(--op-surface-2)",
    color:          active ? "var(--op-text)" : "var(--op-text-2)",
    fontFamily:     "var(--font-ui)",
    fontSize:       "var(--text-13)",
    fontWeight:     500,
    cursor:         "pointer",
    transition:     "all var(--dur-fast)",
    width:          "100%",
    textAlign:      "left" as const,
  }),

  // ── Page / section structure ──────────────────────────────────────────────
  pageHeader: {
    display:        "flex",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    gap:            "16px",
    marginBottom:   "24px",
    flexWrap:       "wrap" as const,
  },
  sectionHeader: {
    display:      "flex",
    alignItems:   "center",
    gap:          "12px",
    marginBottom: "16px",
    flexWrap:     "wrap" as const,
  },

  // Backward-compat aliases (prefer T.sectionTitle / T.sectionDesc above)
  sectionTitle: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    400,
    color:         "var(--op-text)",
    letterSpacing: "-0.02em",
    margin:        0,
  },
  sectionDesc: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-14)",
    color:      "var(--op-text-2)",
    marginTop:  "6px",
    lineHeight: 1.6,
  },

  // ── Empty states ──────────────────────────────────────────────────────────
  emptyState: {
    border:          "1px dashed var(--op-border)",
    borderRadius:    "var(--r-lg)",
    padding:         "64px 32px",
    textAlign:       "center" as const,
    display:         "flex",
    flexDirection:   "column" as const,
    alignItems:      "center",
    gap:             "8px",
  },
  emptyIcon: {
    width:        "40px",
    height:       "40px",
    borderRadius: "var(--r-md)",
    background:   "rgba(255,255,255,0.04)",
    border:       "1px solid var(--op-border)",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center" as const,
    color:        "var(--op-text-3)",
    marginBottom: "4px",
    flexShrink:   0,
  },
  emptyTitle: {
    fontFamily: "var(--font-ui)",
    fontSize:   "var(--text-14)",
    fontWeight: 600,
    color:      "var(--op-text-2)",
    margin:     0,
  },
  emptyDesc: {
    fontFamily: "var(--font-body)",
    fontSize:   "var(--text-13)",
    color:      "var(--op-text-3)",
    lineHeight: 1.55,
    maxWidth:   "280px",
    margin:     0,
  },

  // ── Modal / popover overlays ──────────────────────────────────────────────
  modalOverlay: {
    position:             "fixed" as const,
    inset:                0,
    background:           "rgba(0,0,0,0.65)",
    backdropFilter:       "var(--glass-blur-sm)",
    WebkitBackdropFilter: "var(--glass-blur-sm)",
    display:              "flex",
    alignItems:           "center",
    justifyContent:       "center" as const,
    padding:              "24px",
    zIndex:               100,
  },
  modalPanel: {
    background:           "var(--op-surface-3)",
    border:               "1px solid var(--op-border-hover)",
    borderRadius:         "var(--r-xl)",
    backdropFilter:       "var(--glass-blur)",
    WebkitBackdropFilter: "var(--glass-blur)",
    boxShadow:            "var(--shadow-xl)",
    padding:              "28px",
    display:              "flex",
    flexDirection:        "column" as const,
    gap:                  "20px",
  },
  modalHeader: {
    fontFamily:    "var(--font-display)",
    fontSize:      "var(--text-20)",
    fontWeight:    400,
    letterSpacing: "-0.02em",
    color:         "var(--op-text)",
    margin:        0,
  },
  modalFooter: {
    display:        "flex",
    gap:            "8px",
    justifyContent: "flex-end" as const,
    paddingTop:     "4px",
    borderTop:      "1px solid var(--op-border)",
  },

  // ── Nav item (sidebar / subnav) ───────────────────────────────────────────
  navItem: (active: boolean) => ({
    display:      "flex" as const,
    alignItems:   "center",
    gap:          "9px",
    padding:      "7px 10px",
    borderRadius: "var(--r-md)",
    fontFamily:   "var(--font-ui)",
    fontSize:     "var(--text-13)",
    fontWeight:   active ? 600 : 500,
    color:        active ? "var(--op-text)" : "var(--op-text-2)",
    background:   active ? "rgba(255,255,255,0.06)" : "transparent",
    border:       "none",
    cursor:       "pointer",
    transition:   "background var(--dur-fast), color var(--dur-fast)",
    width:        "100%",
    textAlign:    "left" as const,
  }),

  // ── Status dot ────────────────────────────────────────────────────────────
  dot: (color: string) => ({
    width:        "6px",
    height:       "6px",
    borderRadius: "50%",
    background:   color,
    flexShrink:   0,
  }),

} as const;
