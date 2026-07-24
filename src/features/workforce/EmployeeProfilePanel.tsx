"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Building2, UserCheck, CalendarDays, TrendingUp, Flame, Trophy,
  ClipboardList, History, Activity as ActivityIcon, Sparkles,
  ArrowUpRight, X, Inbox, ChevronDown, LogOut,
} from "lucide-react";
import type {
  User,
  AttendanceDayStatus,
  AttendanceRecord,
  LeaveRequest,
  ProbationRecord,
  ProbationStatus,
} from "@/core/operon";
import {
  computeAttendanceSummary,
  getRoleLabel,
  getDepartmentLabel,
  getTeams,
  formatRelativeTime,
  daysUntil,
} from "@/core/operon";
import { PROBATION_ACTIVE_STATUSES } from "@/core/types";
import { canViewAllHrRecords } from "@/security/permissions";
import { resolveDateRange, DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/core/dateRanges";
import { MonthlyCalendar, addMonths, monthLabel, type RequestKind } from "@/app/workforce/attendance/page";
import { StatusPill } from "@/features/workforce/StatusPill";
import { ProbationTimeline, ProbationReviewBanner } from "@/features/workforce/ProbationTimeline";
import { S, T } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";
import { STATUS_TOKENS } from "@/styles/statusColors";
import { getWorkforceEmployeeProfile, type WorkforceEmployeeProfile as WorkforceEmployeeProfileState, type WorkforceProfileActivityEntry, type WorkforceProfileHoliday, type WorkforceProfileLeaveRequest, type WorkforceProfileProbationRecord } from "@/services/workforceEmployeeProfile";
import { setWorkforceAttendanceDay } from "@/services/workforceAttendance";
import { submitWorkforceLeaveRequest } from "@/services/workforceLeave";

// Mirrors attendance/page.tsx's RECENT_PAST_DAYS — how far back a non-HR
// employee may still correct their own attendance.
const EDIT_WINDOW_DAYS = 7;

const PRESETS: DateRangePreset[] = ["from_joining", "this_week", "this_month", "last_month", "quarter", "year", "custom"];
const EMPTY_REQUEST_MAP = new Map<string, LeaveRequest>();

// Real workforce.hr_leave_requests vocabulary — distinct from core/types.ts's
// legacy 5-value LeaveStatus used elsewhere in the (still-mock) app.
const LEAVE_STATUS_META: Record<string, { label: string; fg: string }> = {
  draft:             { label: "Draft",                      fg: "#94a3b8" },
  pending_manager:   { label: "Pending manager approval",    fg: "#94a3b8" },
  manager_approved:  { label: "Pending HR approval",         fg: "#60a5fa" },
  pending_hr:        { label: "Pending HR approval",         fg: "#60a5fa" },
  approved:          { label: "Approved",                    fg: "#4ade80" },
  rejected:          { label: "Rejected",                    fg: "#e5484d" },
  cancelled:         { label: "Cancelled",                   fg: "#94a3b8" },
};

const EMPTY_PROFILE: WorkforceEmployeeProfileState = {
  supervisorName: undefined,
  attendance: [],
  holidays: [],
  leaveRequests: [],
  probationRecords: [],
  activity: [],
};

const ACTIVITY_ICON: Record<WorkforceProfileActivityEntry["kind"], LucideIcon> = {
  joining_date: CalendarDays,
  onboarding:   UserCheck,
  probation:    ClipboardList,
  leave:        ClipboardList,
  deboarding:   LogOut,
  attendance:   CalendarDays,
};

// ─── Adapters: real workforce.* rows → the legacy shapes MonthlyCalendar,
// computeAttendanceSummary, ProbationTimeline/ProbationReviewBanner, and
// StatusPill already render — same strategy as attendance/page.tsx's adapters.

function toLegacyAttendanceRecords(days: { date: string; status: string }[]): AttendanceRecord[] {
  const byMonth = new Map<string, Record<string, AttendanceDayStatus>>();
  for (const d of days) {
    const month = d.date.slice(0, 7);
    const day = String(Number(d.date.slice(8, 10)));
    if (!byMonth.has(month)) byMonth.set(month, {});
    if (d.status !== "unmarked") byMonth.get(month)![day] = d.status as AttendanceDayStatus;
  }
  return Array.from(byMonth.entries()).map(([month, dayMap]) => ({
    id: month, userId: "", month, days: dayMap, createdAt: "", updatedAt: "",
  }));
}

function toLegacyHoliday(h: WorkforceProfileHoliday) {
  return { id: h.id, date: h.date, name: h.name, type: "public" as const, createdById: "", createdAt: "", updatedAt: "" };
}

function toLegacyProbationStatus(status: string): ProbationStatus {
  switch (status) {
    case "review_due":
    case "recommendation_submitted": return "under_review";
    case "extended": return "extended";
    case "confirmed": return "confirmed";
    case "terminated":
    case "cancelled": return "terminated";
    default: return "pending";
  }
}

function toLegacyProbationRecord(r: WorkforceProfileProbationRecord): ProbationRecord {
  return {
    id: r.id,
    userId: "",
    dateJoined: r.startDate,
    probationDurationDays: r.durationDays,
    probationDurationUnit: "days",
    expectedReviewDate: r.reviewDate,
    status: toLegacyProbationStatus(r.status),
    reviewedById: undefined,
    reviewedAt: r.decidedAt ?? undefined,
    parentRecordId: undefined,
    submittedById: "",
    createdAt: "",
  };
}

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
      <Icon size={15} color="var(--op-accent)" />
      <span style={T.cardTitle}>{title}</span>
    </div>
  );
}

function EmptyBlock({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div style={S.emptyState}>
      <div style={S.emptyIcon}><Icon size={18} /></div>
      <div style={S.emptyTitle}>{title}</div>
      <div style={S.emptyDesc}>{desc}</div>
    </div>
  );
}

export function EmployeeProfilePanel({
  person,
  actor,
  onClose,
  editable = false,
}: {
  person: User;
  actor: User;
  onClose: () => void;
  /** Unlocks the calendar for direct attendance marking + leave/WFH submission — used by the Organization Attendance slide-over, which today lets HR edit inline. The People roster's read-only history view omits this. */
  editable?: boolean;
}) {
  // ISO date, not formatDocumentDate() — this feeds date-math and <input type="date">, both of which need YYYY-MM-DD.
  const today = new Date().toISOString().slice(0, 10);
  const [preset, setPreset] = useState<DateRangePreset>("from_joining");
  const [customFrom, setCustomFrom] = useState(person.dateJoined ?? today);
  const [customTo, setCustomTo] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(() => today.slice(0, 7));
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<AttendanceDayStatus | "">("");
  const [showProbationHistory, setShowProbationHistory] = useState(false);
  const [showLeaveHistory, setShowLeaveHistory] = useState(false);
  const [showHolidayHistory, setShowHolidayHistory] = useState(false);

  // Editing state — only reachable when `editable` is true.
  const [editVersion, setEditVersion] = useState(0);
  const [editSelectedDay, setEditSelectedDay] = useState<number | null>(null);
  const [editRequestDay, setEditRequestDay] = useState<number | null>(null);
  const [editRequestKind, setEditRequestKind] = useState<RequestKind>("leave");
  const [editRequestTo, setEditRequestTo] = useState("");
  const [editRequestReason, setEditRequestReason] = useState("");
  const [editMessage, setEditMessage] = useState("");

  const range = resolveDateRange(preset, person.dateJoined, today, preset === "custom" ? { from: customFrom, to: customTo } : undefined);

  const [profile, setProfile] = useState<WorkforceEmployeeProfileState>(EMPTY_PROFILE);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getWorkforceEmployeeProfile(person.id, range.from, range.to)
      .then((data) => { if (!cancelled) { setProfile(data); setLoadError(""); } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unable to load this employee's records."); });
    return () => { cancelled = true; };
  }, [person.id, range.from, range.to, editVersion]);

  const attendanceRecords = useMemo(() => toLegacyAttendanceRecords(profile.attendance), [profile.attendance]);
  const leaveHistory = profile.leaveRequests;
  const holidays = useMemo(() => profile.holidays.map(toLegacyHoliday), [profile.holidays]);
  const summary = computeAttendanceSummary(attendanceRecords, holidays, range.from, range.to);
  const probationHistory = useMemo(() => profile.probationRecords.map(toLegacyProbationRecord), [profile.probationRecords]);
  const latestProbation: ProbationRecord | undefined = probationHistory[probationHistory.length - 1];
  const activity = profile.activity;
  const team = person.teamId ? getTeams().find((t) => t.id === person.teamId) : undefined;

  // Named holidays are listed individually; Sundays are counted rather than
  // itemized (hundreds of "Weekly Off" chips for a multi-year tenure would
  // bury the named holidays without adding information beyond the count).
  const { tenureHolidays, tenureSundayCount } = useMemo(() => {
    const from = person.dateJoined ?? today;
    const named = holidays
      .filter((h) => h.date >= from && h.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date));

    let sundays = 0;
    const cursor = new Date(`${from}T00:00:00`);
    const end = new Date(`${today}T00:00:00`);
    while (cursor <= end) {
      if (cursor.getDay() === 0) sundays += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return { tenureHolidays: named, tenureSundayCount: sundays };
  }, [holidays, person.dateJoined, today]);

  const monthRecord = attendanceRecords.find((r) => r.month === calendarMonth);
  const holidaysByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);

  const registerRows = useMemo(() => {
    const rows: Array<{ iso: string; status: AttendanceDayStatus; leave?: WorkforceProfileLeaveRequest }> = [];
    for (const record of attendanceRecords) {
      for (const [day, status] of Object.entries(record.days)) {
        const iso = `${record.month}-${day.padStart(2, "0")}`;
        if (iso < range.from || iso > range.to) continue;
        if (statusFilter && status !== statusFilter) continue;
        const leave = leaveHistory.find((r) => r.dateFrom <= iso && r.dateTo >= iso);
        rows.push({ iso, status, leave });
      }
    }
    rows.sort((a, b) => (sortDir === "asc" ? a.iso.localeCompare(b.iso) : b.iso.localeCompare(a.iso)));
    return rows;
  }, [attendanceRecords, leaveHistory, range.from, range.to, statusFilter, sortDir]);

  const initials = person.avatar || person.name.slice(0, 2).toUpperCase();
  const daysRemaining = latestProbation && PROBATION_ACTIVE_STATUSES.has(latestProbation.status)
    ? daysUntil(latestProbation.expectedReviewDate) : undefined;

  // Mirrors attendance/page.tsx's canEditDate: HR/Founder tier can correct
  // any day; the employee themselves can only touch their own recent past.
  function canEditDateLocal(iso: string): boolean {
    if (holidaysByDate.has(iso) || new Date(`${iso}T00:00:00`).getDay() === 0) return false;
    if (canViewAllHrRecords(actor)) return true;
    if (person.id !== actor.id) return false;
    const diffDays = Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= EDIT_WINDOW_DAYS;
  }

  async function handleEditSelectStatus(targetUser: User, day: number, status: AttendanceDayStatus | null) {
    const iso = `${calendarMonth}-${String(day).padStart(2, "0")}`;
    if (!canEditDateLocal(iso)) { setEditMessage("That day is outside the editable window."); return; }
    if (status === "half_day" || status === "absent") { setEditMessage("That status isn't tracked in the real attendance system."); return; }
    try {
      await setWorkforceAttendanceDay(targetUser.id, iso, status ?? "unmarked");
      setEditMessage(status ? `${STATUS_TOKENS[status].label} saved for ${iso}.` : `Cleared ${iso}.`);
      setEditSelectedDay(null);
      setEditVersion((v) => v + 1);
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : "Failed to update attendance.");
    }
  }

  function handleEditOpenRequest(day: number, kind: RequestKind) {
    const iso = `${calendarMonth}-${String(day).padStart(2, "0")}`;
    if (!canEditDateLocal(iso)) { setEditMessage("That day is outside the editable window."); return; }
    setEditRequestDay(day);
    setEditRequestKind(kind);
    setEditRequestTo(iso);
    setEditRequestReason("");
  }

  async function handleEditSubmitRequest() {
    if (!editRequestDay) return;
    const from = `${calendarMonth}-${String(editRequestDay).padStart(2, "0")}`;
    if (!editRequestTo || !editRequestReason.trim()) { setEditMessage("Date range and reason are required."); return; }
    try {
      await submitWorkforceLeaveRequest(editRequestKind, from, editRequestTo, editRequestReason.trim());
      setEditMessage(`${editRequestKind === "wfh" ? "WFH" : "Leave"} request submitted.`);
      setEditRequestDay(null);
      setEditSelectedDay(null);
      setEditRequestReason("");
      setEditVersion((v) => v + 1);
    } catch (err) {
      setEditMessage(err instanceof Error ? err.message : "Failed to submit request.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionPreset.page.transition}
      style={{ ...S.card, marginTop: "6px", padding: "clamp(16px, 2.5vw, 28px)", display: "flex", flexDirection: "column", gap: "22px" }}
    >
      {/* Profile Summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <div
            style={{
              width: "48px", height: "48px", borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--op-accent-dim)", border: "1px solid rgba(245,166,35,0.3)",
              fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 700, color: "var(--op-accent)",
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={T.displayMd}>{person.name}</span>
              <StatusPill status={person.status} />
            </div>
            <div style={{ ...T.cardDesc, marginTop: "4px" }}>
              {person.roleName ?? getRoleLabel(person.roleId)} · {person.departmentName ?? (person.departmentId ? getDepartmentLabel(person.departmentId) : "No department")}
              {team ? ` · ${team.name}` : ""}
              {person.supervisorId ? ` · Reports to ${profile.supervisorName ?? "—"}` : ""}
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
              <span style={S.badgeAccent}>{summary.attendancePercentage}% attendance</span>
              {daysRemaining !== undefined && (
                <span style={S.badgeAccent}>{daysRemaining < 0 ? "Review overdue" : `${daysRemaining}d to review`}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {!editable && (
            <a href="/workforce/attendance" style={{ ...S.btnGhost, display: "inline-flex", alignItems: "center", gap: "5px", textDecoration: "none" } as React.CSSProperties}>
              Manage attendance <ArrowUpRight size={13} />
            </a>
          )}
          <button type="button" style={{ ...S.btnIcon }} onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
      </div>

      {loadError && <EmptyBlock icon={Inbox} title="Unable to load profile" desc={loadError} />}

      {!loadError && (
        <>
          {/* Employment Details */}
          <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "22px 24px" }}>
            <SectionHeader icon={Building2} title="Employment" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
              <InfoField label="Date Joined" value={person.dateJoined ?? "Unknown"} />
              <InfoField label="Department" value={person.departmentName ?? (person.departmentId ? getDepartmentLabel(person.departmentId) : "—")} />
              <InfoField label="Manager" value={person.supervisorId ? profile.supervisorName ?? "—" : "No manager"} />
              <InfoField label="Employment Status" value={<StatusPill status={person.status} />} />
            </div>
          </div>

          {/* Attendance Summary */}
          <div style={{ marginTop: "18px" }}>
            <div style={{ marginBottom: "18px" }}><div style={T.sectionLabel}>Performance</div><h3 style={{ ...T.displayMd, margin: "5px 0 0" }}>Attendance analytics</h3></div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "14px" }}>
              {PRESETS.map((p) => (
                <button key={p} type="button" style={S.pill(preset === p) as React.CSSProperties} onClick={() => setPreset(p)}>
                  {DATE_RANGE_PRESET_LABELS[p]}
                </button>
              ))}
              {preset === "custom" && (
                <>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={S.input} />
                  <span style={{ opacity: 0.5 }}>to</span>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={S.input} />
                </>
              )}
            </div>

            <div className="attendance-metric-grid" style={{ display: "grid", gridTemplateColumns: "minmax(250px, 1.1fr) minmax(340px, 1.55fr) minmax(210px, .9fr)", gap: "12px", marginBottom: "40px" }}>
              <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "26px", minHeight: "190px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={T.sectionLabel}>Attendance</span><TrendingUp size={16} color="var(--op-text-3)" /></div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(52px, 7vw, 76px)", lineHeight: .9, letterSpacing: "-.055em", fontWeight: 600 }}>{summary.attendancePercentage}<span style={{ fontSize: ".38em", marginLeft: "3px" }}>%</span></div>
                  <div style={{ height: "7px", borderRadius: "99px", background: "var(--op-surface-3)", overflow: "hidden", marginTop: "22px" }}><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, summary.attendancePercentage)}%` }} transition={{ duration: .65, ease: "easeOut" }} style={{ height: "100%", borderRadius: "inherit", background: "var(--op-accent)" }} /></div>
                </div>
              </div>
              <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "26px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px" }}>
                <MetricValue value={summary.present} label="Present" color={STATUS_TOKENS.present.fg} icon={STATUS_TOKENS.present.icon} />
                <MetricValue value={summary.wfh} label="WFH" color={STATUS_TOKENS.wfh.fg} icon={STATUS_TOKENS.wfh.icon} />
                <MetricValue value={summary.leave} label="Leave" color={STATUS_TOKENS.leave.fg} icon={STATUS_TOKENS.leave.icon} />
              </div>
              <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "18px 22px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <SecondaryMetric icon={CalendarDays} label="Working days" value={summary.totalWorkingDays} />
                <SecondaryMetric icon={Sparkles} label="Holidays" value={summary.holidayCount} />
                <SecondaryMetric icon={Flame} label="Current streak" value={summary.currentStreak} />
                <SecondaryMetric icon={Trophy} label="Longest streak" value={summary.longestStreak} last />
              </div>
            </div>

            <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "clamp(20px, 3vw, 34px)", marginBottom: "48px", boxShadow: "0 22px 70px rgba(0,0,0,.12)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <button type="button" style={S.btnGhost} onClick={() => setCalendarMonth((m) => addMonths(m, -1))}>← Prev</button>
                <span style={T.cardTitle}>{monthLabel(calendarMonth)}</span>
                <button type="button" style={S.btnGhost} onClick={() => setCalendarMonth((m) => addMonths(m, 1))}>Next →</button>
              </div>
              {editable && editMessage && (
                <div style={{ ...T.caption, marginBottom: "8px", color: "var(--op-accent)" }}>{editMessage}</div>
              )}
              <MonthlyCalendar
                month={calendarMonth}
                targetUser={person}
                record={monthRecord}
                requestByDate={EMPTY_REQUEST_MAP}
                holidaysByDate={holidaysByDate}
                selectedDay={editable ? editSelectedDay : null}
                onSelectDay={editable ? setEditSelectedDay : () => {}}
                onSelectStatus={editable ? handleEditSelectStatus : () => {}}
                onRequest={editable ? handleEditOpenRequest : () => {}}
                requestDay={editable ? editRequestDay : null}
                requestKind={editRequestKind}
                requestTo={editRequestTo}
                requestReason={editRequestReason}
                onRequestToChange={editable ? setEditRequestTo : () => {}}
                onRequestReasonChange={editable ? setEditRequestReason : () => {}}
                onSubmitRequest={editable ? handleEditSubmitRequest : () => {}}
                onCancelRequest={() => setEditRequestDay(null)}
                canEditDate={editable ? (_, iso) => canEditDateLocal(iso) : () => false}
                directEdit={editable}
                minSelectableIso={person.dateJoined}
              />
              <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--op-border)" }}>
                {(Object.keys(STATUS_TOKENS) as Array<keyof typeof STATUS_TOKENS>).filter((k) => k !== "unmarked").map((key) => {
                  const tok = STATUS_TOKENS[key];
                  const Icon = tok.icon;
                  return (
                    <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: "5px", ...T.caption, color: "var(--op-text-2)" }}>
                      <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: tok.fg }} />
                      <Icon size={11} color={tok.fg} /> {tok.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "10px", marginBottom: "22px" }}>
              <div><div style={T.sectionLabel}>History</div><h3 style={{ ...T.displayMd, margin: "5px 0 0" }}>Attendance timeline</h3></div>
              <div style={{ display: "flex", gap: "8px" }}>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AttendanceDayStatus | "")} style={S.select}>
                  <option value="">All statuses</option>
                  {(["present", "wfh", "leave", "half_day", "absent"] as AttendanceDayStatus[]).map((s) => <option key={s} value={s}>{STATUS_TOKENS[s].label}</option>)}
                </select>
                <button type="button" style={S.btnGhost} onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                  Date {sortDir === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>
            {registerRows.length === 0 ? (
              <div style={{ padding: "28px 0", borderTop: "1px solid var(--op-border)", borderBottom: "1px solid var(--op-border)" }}><EmptyBlock icon={CalendarDays} title="No attendance activity" desc="Marked days will appear here chronologically." /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0, paddingLeft: "14px" }}>
                {registerRows.map((row) => {
                  const tok = STATUS_TOKENS[row.status];
                  const Icon = tok.icon;
                  return (
                    <motion.div
                      key={row.iso}
                      className="attendance-timeline-row"
                      whileHover={{ x: 3 }}
                      style={{
                        position: "relative", borderLeft: "1px solid var(--op-border)", padding: "14px 14px 14px 28px",
                        display: "grid", gridTemplateColumns: "110px 120px minmax(0,1fr) 140px", gap: "12px", alignItems: "center",
                      }}
                    >
                      <span style={{ position: "absolute", left: "-5px", top: "20px", width: "9px", height: "9px", borderRadius: "50%", background: tok.fg, boxShadow: "0 0 0 4px var(--op-bg)" }} />
                      <span style={{ ...T.bodySmall, color: "var(--op-text-3)" }}>{new Date(`${row.iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", ...T.bodySmall, color: tok.fg }}>
                        <Icon size={12} /> {tok.label}
                      </span>
                      <span style={T.bodySmall}>{row.leave ? `${row.leave.requestType === "wfh" ? "WFH" : "Leave"}: ${row.leave.reason}` : "—"}</span>
                      <span style={T.bodySmall}>{row.leave?.decidedByName ?? "—"}</span>
                      <span style={T.bodySmall}>{row.leave?.decidedAt ?? "—"}</span>
                      <span style={T.bodySmall}>—</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leave History */}
          <div style={{ borderTop: "1px solid var(--op-border)", paddingTop: "8px" }}>
            <DisclosureButton icon={ClipboardList} title="Leave history" count={leaveHistory.length} open={showLeaveHistory} onClick={() => setShowLeaveHistory((value) => !value)} />
            <AnimatePresence initial={false}>{showLeaveHistory && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22 }} style={{ overflow: "hidden", paddingTop: "10px" }}>
            {leaveHistory.length === 0 ? (
              <EmptyBlock icon={ClipboardList} title="No leave or WFH requests" desc="Requests this employee submits will show up here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {leaveHistory.map((req) => {
                  const meta = LEAVE_STATUS_META[req.status] ?? { label: req.status, fg: "var(--op-text-3)" };
                  return (
                    <div key={req.id} className="op-row-interactive" style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                        <span style={T.bodySmall}>{req.requestType === "wfh" ? "WFH" : "Leave"}: {req.dateFrom} → {req.dateTo}</span>
                        <span style={{ ...T.bodySmall, color: meta.fg }}>{meta.label}</span>
                      </div>
                      <div style={{ ...T.caption, opacity: 0.7 }}>
                        Requested {req.createdAt} · {req.reason}
                        {req.decidedByName && ` · Decided by ${req.decidedByName}${req.decidedAt ? ` on ${req.decidedAt}` : ""}`}
                        {req.rejectionReason && ` · Rejected: ${req.rejectionReason}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </motion.div>}</AnimatePresence>
          </div>

          {/* Holiday History */}
          <div style={{ borderTop: "1px solid var(--op-border)", paddingTop: "8px" }}>
            <DisclosureButton icon={Sparkles} title="Holiday history" count={tenureHolidays.length + tenureSundayCount} open={showHolidayHistory} onClick={() => setShowHolidayHistory((value) => !value)} />
            <AnimatePresence initial={false}>{showHolidayHistory && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22 }} style={{ overflow: "hidden", paddingTop: "10px" }}>
            {tenureSundayCount > 0 && (
              <div style={{ ...T.bodySmall, opacity: 0.7, marginBottom: "8px" }}>
                {tenureSundayCount} Sunday{tenureSundayCount === 1 ? "" : "s"} (weekly off) during this tenure.
              </div>
            )}
            {tenureHolidays.length === 0 ? (
              <EmptyBlock icon={Sparkles} title="No named holidays" desc="Company holidays during this tenure will appear here." />
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {tenureHolidays.map((h) => (
                  <span key={h.id} style={S.badge}>{h.date} — {h.name}</span>
                ))}
              </div>
            )}
            </motion.div>}</AnimatePresence>
          </div>

          {/* Probation Timeline */}
          <div>
            <SectionHeader icon={ClipboardList} title="Probation Timeline" />
            {latestProbation ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <ProbationReviewBanner record={latestProbation} />
                <ProbationTimeline dateJoined={person.dateJoined ?? today} record={latestProbation} />
                {probationHistory.length > 1 && (
                  <div>
                    <button type="button" style={S.btnGhost} onClick={() => setShowProbationHistory((v) => !v)}>
                      {showProbationHistory ? "Hide" : "Show"} full probation history ({probationHistory.length} cycles)
                    </button>
                    {showProbationHistory && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
                        {probationHistory.map((record, i) => (
                          <div key={record.id} style={{ ...T.bodySmall, display: "flex", gap: "10px", alignItems: "center" }}>
                            <span style={{ opacity: 0.6 }}>Cycle {i + 1}:</span>
                            <span>{record.dateJoined} → {record.expectedReviewDate}</span>
                            <StatusPill status={record.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <EmptyBlock icon={ClipboardList} title="No probation required" desc="This employee was not placed on probation." />
            )}
          </div>

          {/* Manager History */}
          {/* Activity Timeline */}
          <div>
            <SectionHeader icon={ActivityIcon} title="Activity Timeline" />
            {activity.length === 0 ? (
              <EmptyBlock icon={ActivityIcon} title="No activity yet" desc="Changes made to this employee's record will show up here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {activity.map((event) => {
                  const Icon = ACTIVITY_ICON[event.kind] ?? History;
                  return (
                    <div key={event.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 4px" }}>
                      <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--op-surface-3)", border: "1px solid var(--op-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
                        <Icon size={11} color="var(--op-text-3)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={T.bodySmall}>{event.label}</div>
                        <div style={T.caption}>{event.actorName} · {formatRelativeTime(event.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
      <style>{`
        .attendance-timeline-row > :nth-child(6),
        .attendance-timeline-row > :nth-child(7) { display: none; }
        @media (max-width: 980px) {
          .attendance-metric-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 680px) {
          .attendance-timeline-row { grid-template-columns: 92px 1fr !important; }
          .attendance-timeline-row > :nth-child(4),
          .attendance-timeline-row > :nth-child(5) { grid-column: 2; }
        }
      `}</style>
    </motion.div>
  );
}

function MetricValue({ value, label, color, icon: Icon }: { value: number; label: string; color: string; icon: LucideIcon }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: .18 }} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "11px", display: "grid", placeItems: "center", background: `${color}16`, border: `1px solid ${color}30` }}><Icon size={15} color={color} /></div>
      <div><div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(32px, 4vw, 46px)", lineHeight: 1, letterSpacing: "-.035em", fontWeight: 600 }}>{value}</div><div style={{ ...T.caption, marginTop: "7px", color }}>{label}</div></div>
    </motion.div>
  );
}

function SecondaryMetric({ icon: Icon, label, value, last = false }: { icon: LucideIcon; label: string; value: number; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--op-border)" }}>
      <Icon size={13} color="var(--op-text-3)" />
      <span style={{ ...T.caption, flex: 1 }}>{label}</span>
      <span style={{ ...T.bodySmall, fontWeight: 650 }}>{value}</span>
    </div>
  );
}

function DisclosureButton({ icon: Icon, title, count, open, onClick }: { icon: LucideIcon; title: string; count: number; open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ width: "100%", border: 0, background: "transparent", color: "inherit", padding: "13px 2px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", textAlign: "left" }}>
      <Icon size={15} color="var(--op-text-3)" />
      <span style={{ ...T.cardTitle, flex: 1 }}>{title} <span style={{ color: "var(--op-text-3)", fontWeight: 500 }}>({count})</span></span>
      <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: .2 }} style={{ display: "inline-flex" }}><ChevronDown size={16} color="var(--op-text-3)" /></motion.span>
    </button>
  );
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={T.sectionLabel}>{label}</div>
      <div style={{ ...T.bodySmall, marginTop: "2px" }}>{value}</div>
    </div>
  );
}
