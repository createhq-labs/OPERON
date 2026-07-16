"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Building2, UserCheck, CalendarDays, TrendingUp, Flame, Trophy,
  ClipboardList, History, Activity as ActivityIcon, Sparkles,
  ArrowUpRight, X, Inbox,
} from "lucide-react";
import type {
  User,
  AttendanceDayStatus,
  AttendanceRecord,
  LeaveRequest,
  LeaveRequestType,
  LeaveStatus,
  ProbationRecord,
  ActivityEvent,
  ActivityAction,
} from "@/core/operon";
import {
  getAttendanceHistoryForUser,
  getLeaveHistoryForUser,
  getHolidays,
  getProbationHistoryForUser,
  getManagerHistoryForUser,
  getActivityForEmployee,
  computeAttendanceSummary,
  getUserById,
  getRoleLabel,
  getDepartmentLabel,
  getTeams,
  formatRelativeTime,
  daysUntil,
  setAttendanceDay,
  submitLeaveRequest,
} from "@/core/operon";
import { LEAVE_TYPE_LABELS, PROBATION_ACTIVE_STATUSES } from "@/core/types";
import { canViewAllHrRecords } from "@/security/permissions";
import { resolveDateRange, DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/core/dateRanges";
import { MonthlyCalendar, addMonths, monthLabel, type RequestKind } from "@/app/workforce/attendance/page";
import { StatusPill } from "@/features/workforce/StatusPill";
import { ProbationTimeline, ProbationReviewBanner } from "@/features/workforce/ProbationTimeline";
import { S, T } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";
import { STATUS_TOKENS } from "@/styles/statusColors";

// Mirrors attendance/page.tsx's RECENT_PAST_DAYS — how far back a non-HR
// employee may still correct their own attendance.
const EDIT_WINDOW_DAYS = 7;

const PRESETS: DateRangePreset[] = ["from_joining", "this_week", "this_month", "last_month", "quarter", "year", "custom"];
const EMPTY_REQUEST_MAP = new Map<string, LeaveRequest>();

const LEAVE_STATUS_META: Record<LeaveStatus, { label: string; fg: string }> = {
  pending:            { label: "Pending manager approval", fg: "#94a3b8" },
  tl_approved:        { label: "Pending HR approval",       fg: "#60a5fa" },
  cofounder_pending:  { label: "Pending Co-Founder approval", fg: "#fbbf24" },
  hr_approved:        { label: "Approved",                  fg: "#4ade80" },
  rejected:           { label: "Rejected",                  fg: "#e5484d" },
  cancelled:          { label: "Cancelled",                 fg: "#94a3b8" },
};

const ACTIVITY_META: Partial<Record<ActivityAction, { icon: LucideIcon; describe: (e: ActivityEvent) => string }>> = {
  USER_MANAGED:          { icon: UserCheck,     describe: () => "Roster details updated" },
  DATE_JOINED_CHANGED:   { icon: CalendarDays,  describe: (e) => `Date joined changed from ${e.metadata?.oldDate || "—"} to ${e.metadata?.newDate || "—"}` },
  PROBATION_SUBMITTED:   { icon: ClipboardList, describe: () => "Probation review submitted" },
  PROBATION_UNDER_REVIEW:{ icon: ClipboardList, describe: () => "Probation moved to under review" },
  PROBATION_DECIDED:     { icon: ClipboardList, describe: (e) => `Probation ${e.metadata?.outcome || "decided"}` },
  PROBATION_NOTE_ADDED:  { icon: ClipboardList, describe: () => "Probation note added" },
  ATTENDANCE_UPDATED:    { icon: CalendarDays,  describe: () => "Attendance record updated" },
  DEBOARDING_FLAGGED:    { icon: History,       describe: () => "Deboarding initiated" },
  DEBOARDING_COMPLETED:  { icon: History,       describe: () => "Offboarding completed" },
};

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "14px 16px" }} className="op-lift">
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Icon size={12} color="var(--op-text-3)" />
        <div style={T.sectionLabel}>{label}</div>
      </div>
      <div style={{ ...T.displayMd, marginTop: "6px" }}>{value}</div>
    </div>
  );
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

  // Editing state — only reachable when `editable` is true.
  const [editVersion, setEditVersion] = useState(0);
  const [editSelectedDay, setEditSelectedDay] = useState<number | null>(null);
  const [editRequestDay, setEditRequestDay] = useState<number | null>(null);
  const [editRequestKind, setEditRequestKind] = useState<RequestKind>("leave");
  const [editRequestTo, setEditRequestTo] = useState("");
  const [editRequestReason, setEditRequestReason] = useState("");
  const [editMessage, setEditMessage] = useState("");

  const range = resolveDateRange(preset, person.dateJoined, today, preset === "custom" ? { from: customFrom, to: customTo } : undefined);

  const { attendanceRecords, leaveHistory, activity, loadError } = useMemo(() => {
    try {
      return {
        attendanceRecords: getAttendanceHistoryForUser(actor, person.id, range.from, range.to),
        leaveHistory:      getLeaveHistoryForUser(actor, person.id),
        activity:          getActivityForEmployee(actor, person.id),
        loadError:         "",
      };
    } catch (err) {
      return {
        attendanceRecords: [] as AttendanceRecord[],
        leaveHistory:      [] as LeaveRequest[],
        activity:          [] as ActivityEvent[],
        loadError:         err instanceof Error ? err.message : "Unable to load this employee's records.",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor.id, person.id, range.from, range.to, editVersion]);

  const holidays = getHolidays();
  const summary = computeAttendanceSummary(attendanceRecords, holidays, range.from, range.to);
  const probationHistory = getProbationHistoryForUser(person.id);
  const latestProbation: ProbationRecord | undefined = probationHistory[probationHistory.length - 1];
  const managerHistory = getManagerHistoryForUser(person.id);
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
    const rows: Array<{ iso: string; status: AttendanceDayStatus; leave?: LeaveRequest }> = [];
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

  function handleEditSelectStatus(targetUser: User, day: number, status: AttendanceDayStatus | null) {
    const iso = `${calendarMonth}-${String(day).padStart(2, "0")}`;
    if (!canEditDateLocal(iso)) { setEditMessage("That day is outside the editable window."); return; }
    try {
      setAttendanceDay(actor, targetUser.id, iso, status);
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

  function handleEditSubmitRequest() {
    if (!editRequestDay) return;
    const from = `${calendarMonth}-${String(editRequestDay).padStart(2, "0")}`;
    if (!editRequestTo || !editRequestReason.trim()) { setEditMessage("Date range and reason are required."); return; }
    try {
      submitLeaveRequest(actor, { requestType: editRequestKind as LeaveRequestType, dateFrom: from, dateTo: editRequestTo, reason: editRequestReason.trim() });
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
              {getRoleLabel(person.roleId)} · {person.departmentId ? getDepartmentLabel(person.departmentId) : "No department"}
              {team ? ` · ${team.name}` : ""}
              {person.supervisorId ? ` · Reports to ${getUserById(person.supervisorId)?.name ?? "—"}` : ""}
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
          <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "16px 18px" }}>
            <SectionHeader icon={Building2} title="Employment Details" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
              <InfoField label="Date Joined" value={person.dateJoined ?? "Unknown"} />
              <InfoField label="Department" value={person.departmentId ? getDepartmentLabel(person.departmentId) : "—"} />
              <InfoField label="Manager" value={person.supervisorId ? getUserById(person.supervisorId)?.name ?? "—" : "No manager"} />
              <InfoField label="Employment Status" value={<StatusPill status={person.status} />} />
            </div>
          </div>

          {/* Attendance Summary */}
          <div>
            <SectionHeader icon={TrendingUp} title="Attendance Summary" />
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" }}>
              <StatCard icon={CalendarDays} label="Total Working Days" value={summary.totalWorkingDays} />
              <StatCard icon={STATUS_TOKENS.present.icon} label="Present Days" value={summary.present} />
              <StatCard icon={STATUS_TOKENS.wfh.icon} label="WFH Days" value={summary.wfh} />
              <StatCard icon={STATUS_TOKENS.leave.icon} label="Leave Days" value={summary.leave} />
              <StatCard icon={STATUS_TOKENS.holiday.icon} label="Holiday Count" value={summary.holidayCount} />
              <StatCard icon={TrendingUp} label="Attendance %" value={`${summary.attendancePercentage}%`} />
              <StatCard icon={Flame} label="Current Streak" value={summary.currentStreak} />
              <StatCard icon={Trophy} label="Longest Streak" value={summary.longestStreak} />
            </div>

            <div style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "16px 18px", marginBottom: "16px" }}>
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
              <span style={T.cardTitle}>Attendance Register</span>
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
              <EmptyBlock icon={CalendarDays} title="No attendance records" desc="Nothing marked in this range yet." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {registerRows.map((row) => {
                  const tok = STATUS_TOKENS[row.status];
                  const Icon = tok.icon;
                  const approvedById = row.leave?.hrApprovedById ?? row.leave?.tlApprovedById;
                  const approvedAt   = row.leave?.hrApprovedAt ?? row.leave?.tlApprovedAt;
                  return (
                    <div
                      key={row.iso}
                      className="op-row-interactive"
                      style={{
                        ...S.cardInner, border: "1px solid var(--op-border)", padding: "8px 14px",
                        display: "grid", gridTemplateColumns: "100px 100px 1fr 140px 100px 1fr", gap: "10px", alignItems: "center",
                      }}
                    >
                      <span style={T.bodySmall}>{row.iso}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", ...T.bodySmall, color: tok.fg }}>
                        <Icon size={12} /> {tok.label}
                      </span>
                      <span style={T.bodySmall}>{row.leave ? `${LEAVE_TYPE_LABELS[row.leave.requestType] ?? row.leave.requestType}: ${row.leave.reason}` : "—"}</span>
                      <span style={T.bodySmall}>{approvedById ? getUserById(approvedById)?.name ?? approvedById : "—"}</span>
                      <span style={T.bodySmall}>{approvedAt ?? "—"}</span>
                      <span style={T.bodySmall}>—</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leave History */}
          <div>
            <SectionHeader icon={ClipboardList} title="Leave History" />
            {leaveHistory.length === 0 ? (
              <EmptyBlock icon={ClipboardList} title="No leave or WFH requests" desc="Requests this employee submits will show up here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {leaveHistory.map((req) => {
                  const meta = LEAVE_STATUS_META[req.status];
                  const decidedById = req.hrApprovedById ?? req.tlApprovedById;
                  const decidedAt   = req.hrApprovedAt ?? req.tlApprovedAt;
                  return (
                    <div key={req.id} className="op-row-interactive" style={{ ...S.cardInner, border: "1px solid var(--op-border)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                        <span style={T.bodySmall}>{LEAVE_TYPE_LABELS[req.requestType] ?? req.requestType}: {req.dateFrom} → {req.dateTo}</span>
                        <span style={{ ...T.bodySmall, color: meta.fg }}>{meta.label}</span>
                      </div>
                      <div style={{ ...T.caption, opacity: 0.7 }}>
                        Requested {req.createdAt} · {req.reason}
                        {decidedById && ` · Decided by ${getUserById(decidedById)?.name ?? decidedById}${decidedAt ? ` on ${decidedAt}` : ""}`}
                        {req.rejectionReason && ` · Rejected: ${req.rejectionReason}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Holiday History */}
          <div>
            <SectionHeader icon={Sparkles} title="Holiday History" />
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
          <div>
            <SectionHeader icon={UserCheck} title="Manager History" />
            {managerHistory.length === 0 ? (
              <EmptyBlock icon={UserCheck} title="No manager changes" desc="Reporting-manager changes will be tracked here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {managerHistory.map((entry, i) => {
                  const next = managerHistory[i + 1];
                  const manager = entry.supervisorId ? getUserById(entry.supervisorId) : undefined;
                  return (
                    <div key={entry.id} style={{ ...T.bodySmall, display: "flex", gap: "10px" }}>
                      <span>{manager?.name ?? "No manager"}</span>
                      <span style={{ opacity: 0.6 }}>{entry.effectiveFrom} → {next ? next.effectiveFrom : "Present"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Activity Timeline */}
          <div>
            <SectionHeader icon={ActivityIcon} title="Activity Timeline" />
            {activity.length === 0 ? (
              <EmptyBlock icon={ActivityIcon} title="No activity yet" desc="Changes made to this employee's record will show up here." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {activity.map((event) => {
                  const meta = ACTIVITY_META[event.action];
                  const Icon = meta?.icon ?? History;
                  const actorName = getUserById(event.userId)?.name ?? "Someone";
                  return (
                    <div key={event.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 4px" }}>
                      <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "var(--op-surface-3)", border: "1px solid var(--op-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
                        <Icon size={11} color="var(--op-text-3)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={T.bodySmall}>{meta ? meta.describe(event) : event.action}</div>
                        <div style={T.caption}>{actorName} · {formatRelativeTime(event.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
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
