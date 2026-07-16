"use client";

import { PROBATION_STATUS_TOKENS, DEFAULT_STATUS_TOKEN } from "@/styles/statusColors";

export function StatusPill({ status }: { status: string }) {
  const cfg = PROBATION_STATUS_TOKENS[status] ?? DEFAULT_STATUS_TOKEN;
  const Icon = cfg.icon;
  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           "5px",
        padding:       "3px 10px",
        borderRadius:  "var(--r-full)",
        fontFamily:    "var(--font-ui)",
        fontSize:      "var(--text-11)",
        fontWeight:    600,
        background:    cfg.bg,
        color:         cfg.fg,
        whiteSpace:    "nowrap",
        letterSpacing: "0.01em",
      }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}
