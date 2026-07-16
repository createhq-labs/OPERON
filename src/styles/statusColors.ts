// ─────────────────────────────────────────────────────────────────────────────
// Shared status color + icon tokens.
//
// Single source of truth for every "what state is this in" indicator across
// the Workforce module — attendance days, probation/roster status pills,
// notification categories. Previously each area (StatusPill.tsx,
// attendance/page.tsx, EmployeeProfilePanel.tsx) hardcoded its own hex values
// for conceptually-identical states; this file centralizes them so a green
// dot always means the same thing everywhere.
//
// These are status colors (reserved, semantic — never reused for arbitrary
// series identity): good=green, info=blue, warning=amber, special=violet,
// critical=red, neutral=slate. Each ships as {fg, bg, softBg} — fg for a
// small dot/icon/text accent, bg for compact badges/pills, softBg for larger
// filled surfaces (calendar cells) where a wash of color reads better than a
// saturated block.
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Home,
  CalendarOff,
  Clock3,
  MinusCircle,
  PartyPopper,
  Circle,
  Clock,
  Send,
  Eye,
  RotateCcw,
  UserMinus,
  UserPlus,
  CalendarClock,
  XCircle,
} from "lucide-react";
import type { AttendanceDayStatus } from "@/core/types";

export interface StatusToken {
  fg:     string;
  bg:     string;
  softBg: string;
  label:  string;
  icon:   LucideIcon;
}

const GOOD     = { fg: "#4ade80", bg: "rgba(74,222,128,0.14)",  softBg: "rgba(74,222,128,0.16)" };
const INFO     = { fg: "#60a5fa", bg: "rgba(96,165,250,0.14)",  softBg: "rgba(96,165,250,0.16)" };
const WARNING  = { fg: "#fbbf24", bg: "rgba(251,191,36,0.14)",  softBg: "rgba(251,191,36,0.16)" };
const SPECIAL  = { fg: "#a78bfa", bg: "rgba(167,139,250,0.14)", softBg: "rgba(167,139,250,0.16)" };
const NEUTRAL  = { fg: "#94a3b8", bg: "rgba(148,163,184,0.12)", softBg: "rgba(148,163,184,0.10)" };
const CRITICAL = { fg: "#e5484d", bg: "rgba(229,72,77,0.14)",   softBg: "rgba(229,72,77,0.16)" };
const HOLIDAY  = { fg: "#d8a22a", bg: "rgba(216,162,42,0.14)",  softBg: "rgba(216,162,42,0.14)" };

export type CalendarStatusKey = AttendanceDayStatus | "holiday" | "unmarked";

export const STATUS_TOKENS: Record<CalendarStatusKey, StatusToken> = {
  present:  { ...GOOD,    label: "Present",  icon: CheckCircle2 },
  wfh:      { ...INFO,    label: "WFH",      icon: Home },
  leave:    { ...WARNING, label: "Leave",    icon: CalendarOff },
  half_day: { ...SPECIAL, label: "Half Day", icon: Clock3 },
  absent:   { ...NEUTRAL, label: "Absent",   icon: MinusCircle },
  holiday:  { ...HOLIDAY, label: "Holiday",  icon: PartyPopper },
  unmarked: { fg: "var(--op-text-3)", bg: "rgba(255,255,255,0.04)", softBg: "rgba(255,255,255,0.03)", label: "Unmarked", icon: Circle },
};

// Every StatusPill key across roster/onboarding/deboarding/leave/probation —
// reusing the same six base hues above so a "confirmed" pill and a "present"
// calendar cell read as the same semantic color.
export const PROBATION_STATUS_TOKENS: Record<string, StatusToken> = {
  active:                   { ...GOOD,     label: "Active",            icon: CheckCircle2 },
  invited:                  { ...WARNING,  label: "Inactive",          icon: UserPlus },
  disabled:                 { ...NEUTRAL,  label: "Offboarded",        icon: UserMinus },
  pending:                  { ...WARNING,  label: "Pending",           icon: Clock },
  submitted:                { ...INFO,     label: "Submitted",         icon: Send },
  acknowledged:             { ...SPECIAL,  label: "Acknowledged",      icon: Eye },
  completed:                { ...GOOD,     label: "Completed",         icon: CheckCircle2 },
  pending_lead_approval:    { ...WARNING,  label: "Pending Approval",  icon: Clock },
  pending_founder_approval: { ...WARNING,  label: "Founder Approval",  icon: Clock },
  data_recovery_pending:    { ...INFO,     label: "Checklist Pending", icon: RotateCcw },
  offboarded:               { ...NEUTRAL,  label: "Offboarded",        icon: UserMinus },
  confirmed:                { ...GOOD,     label: "Confirmed",         icon: CheckCircle2 },
  extended:                 { ...SPECIAL,  label: "Extended",          icon: CalendarClock },
  terminated:               { ...CRITICAL, label: "Terminated",        icon: XCircle },
};

export const DEFAULT_STATUS_TOKEN: StatusToken = {
  fg: "var(--op-text-3)", bg: "var(--op-surface-3)", softBg: "var(--op-surface-3)", label: "Unknown", icon: Circle,
};
