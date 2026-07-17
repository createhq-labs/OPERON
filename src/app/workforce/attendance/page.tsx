"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AttendanceDayStatus, AttendanceRecord, User } from "@/core/operon";
import { useSession } from "@/auth/useSession";
import {
  approveLeaveAsFounder,
  approveLeaveAsHr,
  approveLeaveAsTl,
  canApproveLeaveRequestAsFounder,
  canApproveLeaveRequestAsHr,
  canApproveLeaveRequestAsTl,
  deleteHolidayEntry,
  getAttendanceForMonth,
  getDepartmentLabel,
  getDepartments,
  getHolidays,
  getLeaveRequestsForHr,
  getMyDirectReports,
  getMyLeaveRequests,
  getTeamLeaveHistoryForTl,
  getRoleLabel,
  getUserById,
  getUsers,
  rejectLeave,
  saveHolidayEntry,
  submitLeaveRequest,
  setAttendanceDay,
  type LeaveRequest,
  type LeaveRequestType,
} from "@/core/operon";
import { LEAVE_TYPE_LABELS } from "@/core/types";
import {
  canApproveLeaveAsHr,
  canApproveLeaveAsTl,
  canManageHrCalendar,
  canViewAllHrRecords,
} from "@/security/permissions";
import { ROLE_IDS } from "@/core/roles";
import { openFloatingLayer, subscribeFloatingLayerClose } from "@/lib/floatingLayers";
import { S, Sp, T } from "@/styles/sharedUi";
import {
  Button, Drawer, EmptyState, IconButton, Input, Matrix, Metric, Modal,
  PageShell, SearchField, Section, SectionHeader, Select, Surface, Tabs,
} from "@/components/ui";
import { AnimatePresence, motion } from "framer-motion";
import { motionPreset } from "@/styles/motionPresets";
import { STATUS_TOKENS } from "@/styles/statusColors";
import { EmployeeProfilePanel } from "@/features/workforce/EmployeeProfilePanel";
import {
  CalendarClock, ChevronLeft, ChevronRight, UsersRound, CheckCircle2, Home as HomeIcon,
  CalendarOff, TrendingUp,
} from "lucide-react";

// ─── Types & Constants ────────────────────────────────────────────────────────

type ViewMode = "my" | "team" | "org";
type HolidayType = "public" | "optional" | "company";
export type RequestKind = "leave" | "wfh";

const RECENT_PAST_DAYS = 7;
const NAME_COL = 200; // frozen column width, px
const DAY_COL  = 36;  // per-day cell width, px

// Derived from the shared STATUS_TOKENS (src/styles/statusColors.ts) so this
// calendar, the Employee Profile, and StatusPill all read the same colors.
export type StatusMeta = { label: string; fg: string; bg: string; softBg: string };
export const STATUS_META: Record<AttendanceDayStatus, StatusMeta> = {
  present:  STATUS_TOKENS.present,
  wfh:      STATUS_TOKENS.wfh,
  leave:    STATUS_TOKENS.leave,
  half_day: STATUS_TOKENS.half_day,
  absent:   STATUS_TOKENS.absent,
};

// Centralized so new floating elements in this file don't extend the app's
// existing ad-hoc z-index ladder (10/20/21/35/40/50/100/110/120) with more
// guesswork — every new layer built in this pass reads from here.
const Z = {
  stickyRow:          20,
  stickyCorner:        21,
  popover:             50,
  modal:               100,
  toolbar:             60,
  slideOverBackdrop:   199,
  slideOver:           200,
} as const;

const HOLIDAY_TYPE_COLOR: Record<HolidayType, string> = {
  public:   "#f97316",
  optional: "#a78bfa",
  company:  "#60a5fa",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function isoForDay(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  return localDate(`${month}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtShortDate(iso: string): string {
  return localDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function summarize(record: AttendanceRecord | undefined, month: string) {
  const t = { present: 0, wfh: 0, leave: 0, absent: 0, half_day: 0, unmarked: daysInMonth(month) };
  for (const s of Object.values(record?.days ?? {})) { t.unmarked--; t[s]++; }
  return t;
}

// Local getters only — never .toISOString() here. Converting a locally-
// constructed date to UTC shifts the calendar day in positive-UTC-offset
// timezones (e.g. midnight IST becomes the previous day in UTC).
function toIsoDateLocal(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = localDate(from);
  const end = localDate(to);
  while (cursor <= end) { dates.push(toIsoDateLocal(cursor)); cursor.setDate(cursor.getDate() + 1); }
  return dates;
}

function isHolidayDate(iso: string, holidaysByDate: Map<string, unknown>): boolean {
  return localDate(iso).getDay() === 0 || holidaysByDate.has(iso);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { user } = useSession();

  const [month, setMonth]           = useState(currentMonth());
  const [viewMode, setViewMode]     = useState<ViewMode>("my");
  const viewInitRef                  = useRef(false);

  // Personal calendar state
  const [selectedDay, setSelectedDay]         = useState<number | null>(null);
  const [requestDay, setRequestDay]           = useState<number | null>(null);
  const [requestKind, setRequestKind]         = useState<RequestKind>("leave");
  const [requestTo, setRequestTo]             = useState("");
  const [requestReason, setRequestReason]     = useState("");

  // Holiday management
  const [showAddHoliday, setShowAddHoliday]   = useState(false);
  const [holidayDate, setHolidayDate]         = useState("");
  const [holidayName, setHolidayName]         = useState("");
  const [holidayType, setHolidayType]         = useState<HolidayType>("public");

  // Feedback
  const [message, setMessage]                 = useState("");
  const [rejectingId, setRejectingId]         = useState<string | null>(null);
  const [rejectReason, setRejectReason]       = useState("");

  // HR drilldown into individual employee calendar
  const [drilldownUser, setDrilldownUser]     = useState<User | null>(null);

  // Org / team matrix filters
  const [searchQuery, setSearchQuery]         = useState("");
  const [deptFilter, setDeptFilter]           = useState("all");
  const [managerFilter, setManagerFilter]     = useState("all");
  const [orgStatusFilter, setOrgStatusFilter] = useState<AttendanceDayStatus | "all">("all");

  const [, forceRefresh] = useState(0);
  function refresh() { forceRefresh((n) => n + 1); }

  function handleSelectDay(day: number | null) {
    if (day !== null) {
      openFloatingLayer("calendar");
    } else {
      setRequestDay(null);
    }
    setSelectedDay(day);
  }

  // Escape: close calendar popovers then modals in order.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showAddHoliday) { setShowAddHoliday(false); return; }
      if (selectedDay !== null) { setSelectedDay(null); setRequestDay(null); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showAddHoliday, selectedDay]);

  // Close calendar popovers when another floating panel (e.g. notification) opens.
  useEffect(() => {
    return subscribeFloatingLayerClose("calendar", () => { setSelectedDay(null); setRequestDay(null); });
  }, []);

  // Click outside: close calendar popover when clicking off the day cell or popover.
  useEffect(() => {
    if (selectedDay === null) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-calendar-popover]") && !target.closest(".calendar-day")) {
        setSelectedDay(null);
        setRequestDay(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [selectedDay]);

  // Role detection
  const isHrTier     = user ? canViewAllHrRecords(user) : false;
  const directReports = user ? getMyDirectReports(user) : [];
  const isTlTier     = user ? (canApproveLeaveAsTl(user) && !isHrTier && directReports.length > 0) : false;

  // Set default view once after user loads
  useEffect(() => {
    if (!user || viewInitRef.current) return;
    viewInitRef.current = true;
    if (canViewAllHrRecords(user)) setViewMode("org");
    else if (canApproveLeaveAsTl(user) && getMyDirectReports(user).length > 0) setViewMode("team");
  }, [user]);

  // Data
  const records        = user ? getAttendanceForMonth(user, month) : [];
  const recordByUser   = new Map(records.map((r) => [r.userId, r] as [string, AttendanceRecord]));
  const allOrgUsers    = isHrTier ? getUsers().filter((u) => u.userType !== "creator") : [];
  const holidays       = getHolidays();
  const holidaysByDate = new Map(holidays.map((h) => [h.date, h]));

  const leaveRequests = user ? getMyLeaveRequests(user) : [];
  const teamLeaveRequests = user
    ? (isHrTier ? getLeaveRequestsForHr(user) : [...leaveRequests, ...getTeamLeaveHistoryForTl(user)])
    : [];

  // Build leave-request overlay maps
  const requestByDate = new Map<string, LeaveRequest>();
  for (const r of leaveRequests) {
    if (r.status === "cancelled" || r.status === "rejected") continue;
    for (const iso of datesBetween(r.dateFrom, r.dateTo)) {
      if (isHolidayDate(iso, holidaysByDate)) continue;
      if (iso.startsWith(month)) requestByDate.set(iso, r);
    }
  }
  const requestByUserDate = new Map<string, LeaveRequest>();
  for (const r of teamLeaveRequests) {
    if (r.status === "cancelled" || r.status === "rejected") continue;
    for (const iso of datesBetween(r.dateFrom, r.dateTo)) {
      if (isHolidayDate(iso, holidaysByDate)) continue;
      if (iso.startsWith(month)) requestByUserDate.set(`${r.userId}:${iso}`, r);
    }
  }
  // Org KPI row always reflects the real current day, independent of which
  // month the matrix is currently displaying.
  const todayMonthKey = currentMonth();
  const todayRecordByUser = isHrTier
    ? (month === todayMonthKey ? recordByUser : new Map(getAttendanceForMonth(user!, todayMonthKey).map((r) => [r.userId, r] as [string, AttendanceRecord])))
    : recordByUser;

  const canEditCalendar = user ? canManageHrCalendar(user) : false;
  const canApproveAsTl  = user ? canApproveLeaveAsTl(user) : false;
  const canApproveAsHr  = user ? canApproveLeaveAsHr(user) : false;

  const approvalQueue = user && (canApproveAsHr || canApproveAsTl || user.roleId === ROLE_IDS.ADMIN)
    ? teamLeaveRequests.filter((r) =>
        canApproveLeaveRequestAsTl(user, r) ||
        canApproveLeaveRequestAsHr(user, r) ||
        canApproveLeaveRequestAsFounder(user, r),
      )
    : [];

  if (!user) return null;

  const myRecord = recordByUser.get(user.id);
  const summary  = summarize(myRecord, month);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function canEditDate(targetUser: User, iso: string) {
    if (isHolidayDate(iso, holidaysByDate)) return false;
    if (isHrTier) return true;
    if (targetUser.id !== user!.id) return false;
    const diffDays = Math.floor((localDate(new Date().toISOString().slice(0, 10)).getTime() - localDate(iso).getTime()) / 86400000);
    return diffDays >= 0 && diffDays <= RECENT_PAST_DAYS;
  }

  function handleSelectStatus(targetUser: User, day: number, status: AttendanceDayStatus | null) {
    const iso = isoForDay(month, day);
    if (!canEditDate(targetUser, iso)) { setMessage("That day is outside your editable attendance window."); return; }
    try {
      setAttendanceDay(user!, targetUser.id, iso, status);
      setMessage(status ? `${STATUS_META[status].label} saved for ${iso}.` : `Cleared ${iso}.`);
      setSelectedDay(null);
      refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Failed to update attendance."); }
  }

  function openRequest(day: number, kind: RequestKind) {
    const iso = isoForDay(month, day);
    if (!canEditDate(user!, iso)) { setMessage("That day is outside your editable request window."); return; }
    setRequestDay(day); setRequestKind(kind); setRequestTo(iso); setRequestReason("");
  }

  function handleSubmitRequest() {
    if (!requestDay) return;
    const from = isoForDay(month, requestDay);
    if (!requestTo || !requestReason.trim()) { setMessage("Date range and reason are required."); return; }
    try {
      submitLeaveRequest(user!, { requestType: requestKind as LeaveRequestType, dateFrom: from, dateTo: requestTo, reason: requestReason.trim() });
      setMessage(`${requestKind === "wfh" ? "WFH" : "Leave"} request submitted.`);
      setRequestDay(null); setSelectedDay(null); setRequestReason(""); refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Failed to submit request."); }
  }

  function handleAddHoliday() {
    if (!holidayDate || !holidayName.trim()) { setMessage("Date and name are required."); return; }
    try {
      saveHolidayEntry(user!, { date: holidayDate, name: holidayName.trim(), type: holidayType });
      setHolidayDate(""); setHolidayName(""); setHolidayType("public");
      setShowAddHoliday(false); setMessage("Holiday added."); refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Failed to add holiday."); }
  }

  function handleDeleteHoliday(id: string) {
    try { deleteHolidayEntry(user!, id); setMessage("Holiday removed."); refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Failed to remove holiday."); }
  }

  function handleApproveTl(id: string) {
    try { approveLeaveAsTl(user!, id); setMessage("Approved (TL step)."); refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Failed to approve."); }
  }

  function handleApproveHr(id: string) {
    try { approveLeaveAsHr(user!, id); setMessage("Approved — attendance updated."); refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Failed to approve."); }
  }

  function handleApproveFounder(id: string) {
    try { approveLeaveAsFounder(user!, id); setMessage("Approved - attendance updated."); refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Failed to approve."); }
  }

  function handleReject(id: string) {
    if (!rejectReason.trim()) { setMessage("Enter a rejection reason."); return; }
    try {
      rejectLeave(user!, id, rejectReason.trim());
      setMessage("Request rejected."); setRejectingId(null); setRejectReason(""); refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : "Failed to reject."); }
  }

  // ── View tabs ────────────────────────────────────────────────────────────────

  const tabs: Array<{ id: ViewMode; label: string }> = isHrTier
    ? [{ id: "org", label: "Organization" }, { id: "my", label: "My Calendar" }]
    : isTlTier
      ? [{ id: "team", label: "My Team" }, { id: "my", label: "My Calendar" }]
      : [];

  const headerTitle = viewMode === "org"  ? "Organization Attendance"
    : viewMode === "team" ? "Team Attendance"
    : "My Calendar";

  const headerDesc = viewMode === "org"  ? "Monthly attendance across the organization"
    : viewMode === "team" ? "Your direct reports this month"
    : "Attendance, Leave & WFH";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageShell>

      <div className="calendar-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 268px", gap: Sp["8"], alignItems: "start" }}>

        {/* ── Left: main content ── */}
        <Section spacing="compact" style={{ minWidth: 0 }}>

          {/* Header */}
          <SectionHeader title={headerTitle} description={headerDesc} actions={
            <div style={{ display: "flex", alignItems: "center", gap: Sp["2"], flexWrap: "wrap" }}>
              {/* View toggle */}
              {tabs.length > 0 && (
                <Tabs<ViewMode> items={tabs.map((tab) => ({ value: tab.id as ViewMode, label: tab.label }))} value={viewMode} onChange={setViewMode} label="Attendance view" />
              )}
              {/* Month nav — org view keeps its own inside the floating toolbar */}
              {viewMode !== "org" && (
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={14} /></IconButton>
                  <span style={{ ...T.cardTitle, minWidth: "150px", textAlign: "center" }}>{monthLabel(month)}</span>
                  <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={14} /></IconButton>
                </div>
              )}
            </div>
          } />

          {/* Feedback */}
          {message && (
            <Surface tone="inset" padding="compact" style={{ display: "flex", alignItems: "center", gap: Sp["2"] }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--op-accent)", flexShrink: 0 }} />
              <p style={T.bodySmall}>{message}</p>
            </Surface>
          )}

          {/* ── Views ─────────────────────────────────────────────────────── */}

          {/* HR Org Matrix — stays visible; clicking a row opens a slide-over rather than replacing this. */}
          {viewMode === "org" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <OrgSummaryCards users={allOrgUsers} recordByUser={todayRecordByUser} leaveRequests={teamLeaveRequests} />
              <AttendanceMatrix
                month={month}
                users={allOrgUsers}
                recordByUser={recordByUser}
                holidaysByDate={holidaysByDate}
                requestByUserDate={requestByUserDate}
                showFilters
                searchQuery={searchQuery}
                deptFilter={deptFilter}
                managerFilter={managerFilter}
                statusFilter={orgStatusFilter}
                onSearchChange={setSearchQuery}
                onDeptFilterChange={setDeptFilter}
                onManagerFilterChange={setManagerFilter}
                onStatusFilterChange={setOrgStatusFilter}
                monthLabelText={monthLabel(month)}
                onPrevMonth={() => setMonth(addMonths(month, -1))}
                onNextMonth={() => setMonth(addMonths(month, 1))}
                onEmployeeClick={(emp) => setDrilldownUser(emp)}
              />
            </div>
          )}

          {/* TL Team Matrix */}
          {viewMode === "team" && (
            <AttendanceMatrix
              month={month}
              users={directReports}
              recordByUser={recordByUser}
              holidaysByDate={holidaysByDate}
              requestByUserDate={requestByUserDate}
            />
          )}

          {/* My Calendar (employee + TL/HR personal tab) */}
          {viewMode === "my" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <MonthlyCalendar
                month={month}
                targetUser={user}
                record={myRecord}
                requestByDate={requestByDate}
                holidaysByDate={holidaysByDate}
                selectedDay={selectedDay}
                onSelectDay={handleSelectDay}
                onSelectStatus={handleSelectStatus}
                onRequest={openRequest}
                requestDay={requestDay}
                requestKind={requestKind}
                requestTo={requestTo}
                requestReason={requestReason}
                onRequestToChange={setRequestTo}
                onRequestReasonChange={setRequestReason}
                onSubmitRequest={handleSubmitRequest}
                onCancelRequest={() => setRequestDay(null)}
                canEditDate={canEditDate}
              />
              <SummaryPanel summary={summary} />
            </div>
          )}
        </Section>

        {/* ── Right: holiday panel ── */}
        <HolidayPanel
          holidays={holidays}
          canEdit={canEditCalendar}
          onDeleteHoliday={handleDeleteHoliday}
          onOpenAddModal={() => setShowAddHoliday(true)}
        />
      </div>

      {/* ── Approval queue ── */}
      {approvalQueue.length > 0 && (
        <details style={{ ...S.group, padding: Sp["4"] }} open>
          <summary style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", color: "var(--op-text)", cursor: "pointer", fontWeight: 700 }}>
            Leave &amp; WFH Approvals
            <span style={{ marginLeft: "8px", color: "var(--op-accent)", fontWeight: 700 }}>{approvalQueue.length}</span>
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
            {approvalQueue.map((req) => {
              const requester  = getUserById(req.userId);
              const isRejecting = rejectingId === req.id;
              const typeLabel  = LEAVE_TYPE_LABELS[req.requestType] ?? "Leave";
              const canActAsTl = canApproveLeaveRequestAsTl(user, req);
              const canActAsHr = canApproveLeaveRequestAsHr(user, req);
              const canActAsFounder = canApproveLeaveRequestAsFounder(user, req);
              const statusLabel =
                req.status === "cofounder_pending" ? "Pending Co-Founder approval" :
                req.status === "tl_approved" ? "Pending HR approval" :
                canActAsFounder ? "Pending Co-Founder approval" :
                canActAsHr ? "Pending HR approval" :
                "Pending manager approval";
              return (
                <div key={req.id} style={{ ...S.row, padding: `${Sp["3"]} ${Sp["4"]}`, display: "flex", flexDirection: "column", alignItems: "stretch", gap: Sp["2"] }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 700, color: "var(--op-text)" }}>{requester?.name ?? req.userId}</span>
                      <span style={S.badge}>{typeLabel}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-12)", color: "var(--op-text-3)" }}>{req.dateFrom}{req.dateTo !== req.dateFrom ? ` → ${req.dateTo}` : ""}</span>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)" }}>{req.reason}</span>
                      <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", color: "var(--op-text-3)", letterSpacing: "0.04em" }}>{statusLabel}</span>
                    </div>
                    {!isRejecting && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        {canActAsTl && (
                          <button type="button" style={{ ...S.btnPrimary, height: "30px", padding: "0 12px" }} onClick={() => handleApproveTl(req.id)}>Approve</button>
                        )}
                        {canActAsHr && (
                          <button type="button" style={{ ...S.btnPrimary, height: "30px", padding: "0 12px" }} onClick={() => handleApproveHr(req.id)}>Approve</button>
                        )}
                        {canActAsFounder && (
                          <button type="button" style={{ ...S.btnPrimary, height: "30px", padding: "0 12px" }} onClick={() => handleApproveFounder(req.id)}>Approve</button>
                        )}
                        <button type="button" style={{ ...S.btnGhost, height: "30px", padding: "0 12px", color: "#e5484d", borderColor: "#e5484d" }} onClick={() => { setRejectingId(req.id); setRejectReason(""); }}>Reject</button>
                      </div>
                    )}
                  </div>
                  {isRejecting && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <input style={{ ...S.input, flex: 1, minWidth: "200px" }} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (required)" autoFocus />
                      <button type="button" style={{ ...S.btnGhost, height: "30px", padding: "0 12px", color: "#e5484d", borderColor: "#e5484d" }} onClick={() => handleReject(req.id)}>Confirm</button>
                      <button type="button" style={{ ...S.btnGhost, height: "30px", padding: "0 12px" }} onClick={() => setRejectingId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* ── Add Holiday Modal ── */}
      {showAddHoliday && (
          <AddHolidayModal
            holidayDate={holidayDate}
            holidayName={holidayName}
            holidayType={holidayType}
            onDateChange={setHolidayDate}
            onNameChange={setHolidayName}
            onTypeChange={setHolidayType}
            onSubmit={handleAddHoliday}
            onClose={() => setShowAddHoliday(false)}
          />
      )}

      {/* ── Employee slide-over — overlays the org matrix instead of replacing it ── */}
      <Drawer open={viewMode === "org" && Boolean(drilldownUser && user)} title="Employee details" onClose={() => setDrilldownUser(null)}>
        {drilldownUser && user && <EmployeeProfilePanel person={drilldownUser} actor={user} onClose={() => setDrilldownUser(null)} editable />}
      </Drawer>

      <style>{`
        @media (max-width: 900px) {
          .calendar-layout { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .calendar-grid { gap: 3px !important; }
          .calendar-day { min-height: 42px !important; }
        }
        .calendar-day:not([disabled]):hover {
          border-color: rgba(255,255,255,0.22) !important;
          background: rgba(255,255,255,0.06) !important;
          z-index: 1;
        }
        .calendar-day:not([disabled]):active { transform: scale(0.96); }
        .calendar-day { transition: border-color 120ms ease, background 120ms ease, transform 100ms ease; }
        .matrix-name-btn:hover { background: rgba(255,255,255,0.06) !important; }
        .matrix-day-cell {
          transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease, border-color 150ms ease;
        }
        .matrix-day-cell:hover {
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(0,0,0,0.3);
          filter: brightness(1.18);
        }
      `}</style>
    </PageShell>
  );
}

// ─── Attendance Matrix (spreadsheet register) ─────────────────────────────────

function AttendanceMatrix({
  month,
  users,
  recordByUser,
  holidaysByDate,
  requestByUserDate,
  showFilters = false,
  searchQuery = "",
  deptFilter = "all",
  managerFilter = "all",
  statusFilter = "all",
  onSearchChange,
  onDeptFilterChange,
  onManagerFilterChange,
  onStatusFilterChange,
  monthLabelText,
  onPrevMonth,
  onNextMonth,
  onEmployeeClick,
}: {
  month: string;
  users: User[];
  recordByUser: Map<string, AttendanceRecord>;
  holidaysByDate: Map<string, ReturnType<typeof getHolidays>[number]>;
  requestByUserDate: Map<string, LeaveRequest>;
  showFilters?: boolean;
  searchQuery?: string;
  deptFilter?: string;
  managerFilter?: string;
  statusFilter?: AttendanceDayStatus | "all";
  onSearchChange?: (v: string) => void;
  onDeptFilterChange?: (v: string) => void;
  onManagerFilterChange?: (v: string) => void;
  onStatusFilterChange?: (v: AttendanceDayStatus | "all") => void;
  monthLabelText?: string;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onEmployeeClick?: (user: User) => void;
}) {
  const totalDays  = daysInMonth(month);
  const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);
  const todayIso   = new Date().toISOString().slice(0, 10);
  const todayDayKey = String(Number(todayIso.slice(8, 10)));
  const isCurrentMonth = month === currentMonth();

  // Filters
  const departments  = showFilters ? getDepartments() : [];
  const supervisorIds = new Set(users.map((u) => u.supervisorId).filter(Boolean) as string[]);
  const managers     = showFilters ? users.filter((u) => supervisorIds.has(u.id)) : [];

  const filtered = users.filter((u) => {
    if (searchQuery && !u.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (deptFilter !== "all" && u.departmentId !== deptFilter) return false;
    if (managerFilter !== "all" && u.supervisorId !== managerFilter) return false;
    if (statusFilter !== "all") {
      const recordStatus = recordByUser.get(u.id)?.days[todayDayKey];
      if (recordStatus !== statusFilter) return false;
    }
    return true;
  });

  // Shared background color for sticky cells — must be opaque to cover scrolled content
  const stickyBg = "var(--op-surface)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Floating toolbar (HR only) */}
      {showFilters && (
        <Surface
          padding="compact"
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
            position: "relative",
            zIndex: Z.toolbar,
          }}
        >
          <SearchField
              style={{ flex: "1 1 180px", minWidth: "160px" }}
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search employee…"
            />
          <Select style={{ minWidth: "150px", height: "38px" }} value={deptFilter} onChange={(e) => onDeptFilterChange?.(e.target.value)} aria-label="Department">
            <option value="all">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select style={{ minWidth: "150px", height: "38px" }} value={managerFilter} onChange={(e) => onManagerFilterChange?.(e.target.value)} aria-label="Manager">
            <option value="all">All Managers</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select style={{ minWidth: "140px", height: "38px" }} value={statusFilter} onChange={(e) => onStatusFilterChange?.(e.target.value as AttendanceDayStatus | "all")} aria-label="Attendance status">
            <option value="all">All Statuses</option>
            <option value="present">Present Today</option>
            <option value="wfh">WFH Today</option>
            <option value="leave">Leave Today</option>
          </Select>
          {monthLabelText && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "auto", paddingLeft: "8px", borderLeft: "1px solid var(--op-border)" }}>
              <CalendarClock size={14} color="var(--op-text-3)" />
              <IconButton label="Previous month" onClick={onPrevMonth}><ChevronLeft size={14} /></IconButton>
              <span style={{ ...T.cardTitle, minWidth: "150px", textAlign: "center" }}>{monthLabelText}</span>
              <IconButton label="Next month" onClick={onNextMonth}><ChevronRight size={14} /></IconButton>
            </div>
          )}
        </Surface>
      )}

      {/* Spreadsheet matrix */}
      <Matrix label="Employee attendance by date"
        style={{
          maxHeight:    "58vh",
          minHeight:    "120px",
        }}
      >
        {filtered.length === 0 ? (
          <EmptyState icon={UsersRound} title="No employees match your filters" description="Try adjusting search, department, manager, or status." />
        ) : (
          <>
            {/* ── Header row (sticky top) ── */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: Z.stickyRow, background: stickyBg, borderBottom: "1px solid var(--op-border)" }}>
              {/* Corner cell — sticky top + left */}
              <div style={{ width: NAME_COL, flexShrink: 0, position: "sticky", left: 0, zIndex: Z.stickyCorner, background: stickyBg, padding: "8px 12px", display: "flex", alignItems: "flex-end" }}>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-10)", fontWeight: 700, color: "var(--op-text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  EMPLOYEE
                </span>
              </div>
              {/* Day headers */}
              {dayNumbers.map((day) => {
                const iso       = isoForDay(month, day);
                const d         = localDate(iso);
                const isSunday  = d.getDay() === 0;
                const isHoliday = holidaysByDate.has(iso);
                const isSpecial = isSunday || isHoliday;
                const isToday   = iso === todayIso;
                const dayNames  = ["S","M","T","W","T","F","S"];
                return (
                  <div
                    key={day}
                    title={isHoliday ? holidaysByDate.get(iso)?.name : isSunday ? "Sunday" : undefined}
                    style={{
                      width:      DAY_COL,
                      flexShrink: 0,
                      textAlign:  "center",
                      padding:    "6px 0 4px",
                      background: isSpecial ? "rgba(251,191,36,0.05)" : "transparent",
                      borderLeft: "1px solid var(--op-border)",
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: 700, color: isToday ? "var(--op-accent)" : isSpecial ? "#d8a22a" : "var(--op-text-2)", lineHeight: 1 }}>{day}</div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "9px", color: isSpecial ? "#d8a22a80" : "var(--op-text-3)", opacity: 0.7, marginTop: "1px" }}>{dayNames[d.getDay()]}</div>
                  </div>
                );
              })}
            </div>

            {/* ── Data rows ── */}
            {filtered.map((emp, rowIdx) => {
              const record      = recordByUser.get(emp.id);
              const isClickable = !!onEmployeeClick;
              const rowBg       = rowIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)";
              const todayStatus = isCurrentMonth ? (record?.days[todayDayKey] as AttendanceDayStatus | undefined) : undefined;
              const todayToken  = todayStatus ? STATUS_TOKENS[todayStatus] : undefined;
              const initials    = emp.avatar || emp.name.slice(0, 2).toUpperCase();

              return (
                <div
                  key={emp.id}
                  style={{ display: "flex", background: rowBg, borderTop: "1px solid rgba(255,255,255,0.035)" }}
                >
                  {/* Sticky name cell */}
                  <button
                    type="button"
                    className="matrix-name-btn"
                    disabled={!isClickable}
                    onClick={() => onEmployeeClick?.(emp)}
                    style={{
                      width:          NAME_COL,
                      flexShrink:     0,
                      position:       "sticky",
                      left:           0,
                      zIndex:         10,
                      background:     stickyBg,
                      padding:        "8px 12px",
                      textAlign:      "left",
                      cursor:         isClickable ? "pointer" : "default",
                      border:         "none",
                      borderRight:    "1px solid var(--op-border)",
                      transition:     "background 120ms",
                      display:        "flex",
                      alignItems:     "center",
                      gap:            "8px",
                    }}
                  >
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <div
                        style={{
                          width: "26px", height: "26px", borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "var(--op-accent-dim)", border: "1px solid rgba(245,166,35,0.3)",
                          fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 700, color: "var(--op-accent)",
                        }}
                      >
                        {initials}
                      </div>
                      {todayToken && (
                        <span
                          title={`${todayToken.label} today`}
                          style={{
                            position: "absolute", bottom: "-1px", right: "-1px",
                            width: "8px", height: "8px", borderRadius: "50%",
                            background: todayToken.fg, border: `2px solid ${stickyBg}`,
                          }}
                        />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 700, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {emp.name}
                      </div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: "10px", color: "var(--op-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "1px" }}>
                        {getRoleLabel(emp.roleId)}{emp.departmentId ? ` · ${getDepartmentLabel(emp.departmentId)}` : ""}
                      </div>
                    </div>
                  </button>

                  {/* Day cells */}
                  {dayNumbers.map((day) => {
                    const iso       = isoForDay(month, day);
                    const d         = localDate(iso);
                    const isSunday  = d.getDay() === 0;
                    const holiday   = holidaysByDate.get(iso);
                    const isHoliday = isSunday || !!holiday;
                    const status    = record?.days[String(day)] as AttendanceDayStatus | undefined;
                    const request   = requestByUserDate.get(`${emp.id}:${iso}`);
                    const isToday   = iso === todayIso;

                    let token = STATUS_TOKENS.unmarked;
                    let isDashed = false;
                    let CellIcon: typeof STATUS_TOKENS.unmarked.icon | null = null;

                    if (isHoliday) {
                      token = STATUS_TOKENS.holiday;
                      CellIcon = token.icon;
                    } else if (status) {
                      token = STATUS_TOKENS[status];
                      CellIcon = token.icon;
                    } else if (request) {
                      token = request.requestType === "wfh" ? STATUS_TOKENS.wfh : STATUS_TOKENS.leave;
                      CellIcon = token.icon;
                      isDashed = true;
                    }

                    return (
                      <div
                        key={day}
                        className="matrix-day-cell"
                        title={[
                          holiday ? holiday.name : isSunday ? "Weekly Off" : "",
                          status ? STATUS_META[status]?.label : "",
                          request && !status ? `${LEAVE_TYPE_LABELS[request.requestType] ?? "Leave"} (pending)` : "",
                        ].filter(Boolean).join(" · ")}
                        style={{
                          width:        DAY_COL - 2,
                          flexShrink:   0,
                          height:       "36px",
                          margin:       "2px 1px",
                          borderRadius: "var(--r-sm, 6px)",
                          display:      "flex",
                          alignItems:   "center",
                          justifyContent: "center",
                          background:   CellIcon ? token.softBg : "transparent",
                          border:       `1px solid ${CellIcon ? `${token.fg}25` : "transparent"}`,
                          outline:      isToday ? "1.5px solid var(--op-accent)" : isDashed ? `1.5px dashed ${token.fg}77` : "none",
                          outlineOffset:"-2px",
                          position:     "relative",
                        }}
                      >
                        {CellIcon && <CellIcon size={13} color={token.fg} strokeWidth={2.25} style={{ opacity: isDashed ? 0.75 : 1 }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </Matrix>

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", paddingLeft: "2px" }}>
        {(["present", "wfh", "leave", "holiday", "unmarked"] as const).map((key) => {
          const tok = STATUS_TOKENS[key];
          const Icon = tok.icon;
          return (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", color: "var(--op-text-3)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "3px", background: key === "unmarked" ? "rgba(255,255,255,0.12)" : tok.fg }} />
              <Icon size={12} color={key === "unmarked" ? "var(--op-text-3)" : tok.fg} />
              {tok.label}
            </span>
          );
        })}
        {onEmployeeClick && (
          <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-11)", color: "var(--op-text-3)", marginLeft: "auto" }}>
            Click an employee to view their profile
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Holiday Panel (compact) ──────────────────────────────────────────────────

function HolidayPanel({
  holidays,
  canEdit,
  onDeleteHoliday,
  onOpenAddModal,
}: {
  holidays: ReturnType<typeof getHolidays>;
  canEdit: boolean;
  onDeleteHoliday: (id: string) => void;
  onOpenAddModal: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const sorted   = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((h) => h.date >= todayIso);
  const past     = sorted.filter((h) => h.date < todayIso);

  return (
    <Surface style={{ display: "flex", flexDirection: "column", gap: Sp["4"] }}>
      <SectionHeader title="Holidays" />

      {/* Upcoming list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {upcoming.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", margin: 0 }}>No upcoming holidays.</p>
        ) : upcoming.map((h) => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: "1px solid var(--op-border)" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: HOLIDAY_TYPE_COLOR[h.type], flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 600, color: "var(--op-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-11)", color: "var(--op-text-3)", marginTop: "1px" }}>{fmtShortDate(h.date)}</div>
            </div>
            {canEdit && (
              <button type="button" title="Remove" onClick={() => onDeleteHoliday(h.id)} style={{ ...S.btnGhost, width: "22px", height: "22px", padding: 0, border: "none", color: "var(--op-text-3)", flexShrink: 0, fontSize: "16px" }}>×</button>
            )}
          </div>
        ))}
      </div>

      {/* Past — collapsed */}
      {past.length > 0 && (
        <details>
          <summary style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", color: "var(--op-text-3)", cursor: "pointer", userSelect: "none" }}>
            {past.length} past {past.length === 1 ? "holiday" : "holidays"}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "6px" }}>
            {past.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", opacity: 0.45 }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: HOLIDAY_TYPE_COLOR[h.type], flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", color: "var(--op-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{h.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-11)", color: "var(--op-text-3)", flexShrink: 0 }}>{fmtShortDate(h.date)}</span>
                {canEdit && (
                  <button type="button" onClick={() => onDeleteHoliday(h.id)} style={{ ...S.btnGhost, width: "20px", height: "20px", padding: 0, border: "none", color: "var(--op-text-3)", flexShrink: 0 }}>×</button>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Add Holiday button */}
      {canEdit && (
        <Button variant="secondary" onClick={onOpenAddModal} style={{ width: "100%" }}>
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          Add Holiday
        </Button>
      )}
    </Surface>
  );
}

// ─── Add Holiday Modal ────────────────────────────────────────────────────────

function AddHolidayModal({
  holidayDate, holidayName, holidayType,
  onDateChange, onNameChange, onTypeChange,
  onSubmit, onClose,
}: {
  holidayDate: string;
  holidayName: string;
  holidayType: HolidayType;
  onDateChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onTypeChange: (v: HolidayType) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open title="Add Holiday" onClose={onClose} width={400} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button variant="primary" onClick={onSubmit}>Add Holiday</Button>
    </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: Sp["4"] }}>
          <Input label="Date" type="date" value={holidayDate} onChange={(e) => onDateChange(e.target.value)} />
          <Input label="Name" value={holidayName} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Independence Day" autoFocus />
          <Select label="Type" value={holidayType} onChange={(e) => onTypeChange(e.target.value as HolidayType)}>
              <option value="public">Public</option>
              <option value="optional">Optional</option>
              <option value="company">Company</option>
          </Select>
        </div>
    </Modal>
  );
}

// ─── Monthly Calendar (employee + HR drilldown) ───────────────────────────────

export function MonthlyCalendar({
  month, targetUser, record, requestByDate, holidaysByDate,
  selectedDay, onSelectDay, onSelectStatus, onRequest,
  requestDay, requestKind, requestTo, requestReason,
  onRequestToChange, onRequestReasonChange, onSubmitRequest, onCancelRequest,
  canEditDate, directEdit = false, minSelectableIso,
}: {
  month: string;
  targetUser: User;
  record: AttendanceRecord | undefined;
  requestByDate: Map<string, LeaveRequest>;
  holidaysByDate: Map<string, ReturnType<typeof getHolidays>[number]>;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  onSelectStatus: (targetUser: User, day: number, status: AttendanceDayStatus | null) => void;
  onRequest: (day: number, kind: RequestKind) => void;
  requestDay: number | null;
  requestKind: RequestKind;
  requestTo: string;
  requestReason: string;
  onRequestToChange: (value: string) => void;
  onRequestReasonChange: (value: string) => void;
  onSubmitRequest: () => void;
  onCancelRequest: () => void;
  canEditDate: (targetUser: User, iso: string) => boolean;
  directEdit?: boolean;
  /** Dims days before this ISO date — e.g. an employee's dateJoined, which never has real attendance. */
  minSelectableIso?: string;
}) {
  const firstDay  = localDate(`${month}-01`).getDay();
  const totalDays = daysInMonth(month);
  const todayIso  = new Date().toISOString().slice(0, 10);
  const cells     = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  const holidayToken = STATUS_TOKENS.holiday;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px", marginBottom: "6px" }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontFamily: "var(--font-ui)", fontSize: "var(--text-10)", color: "var(--op-text-3)", fontWeight: 600, padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <motion.div
        key={month}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={motionPreset.fadeScale.transition}
        className="calendar-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}
      >
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} />;
          const iso          = isoForDay(month, day);
          const status       = record?.days[String(day)] as AttendanceDayStatus | undefined;
          const request      = requestByDate.get(iso);
          const meta         = status ? STATUS_META[status] : null;
          const Icon         = status ? STATUS_TOKENS[status].icon : null;
          const holiday      = holidaysByDate.get(iso);
          const isSunday     = localDate(iso).getDay() === 0;
          const isHolidayDay = isSunday || !!holiday;
          const isToday      = iso === todayIso;
          const isEditable   = canEditDate(targetUser, iso);
          const beforeJoin   = !!minSelectableIso && iso < minSelectableIso;
          const isSelected   = selectedDay === day;
          const pendingFg    = request ? (request.requestType === "wfh" ? STATUS_META.wfh.fg : STATUS_META.leave.fg) : null;
          const holidayLabel = isSunday && !holiday ? "Weekly\nOff" : holiday?.name ?? "Holiday";
          return (
            <div key={iso} style={{ position: "relative" }}>
              <button
                type="button"
                className="calendar-day"
                disabled={!isHolidayDay && !isEditable}
                onClick={() => onSelectDay(isSelected ? null : day)}
                style={{
                  minHeight:     "54px", width: "100%",
                  borderRadius:  "var(--r-lg)",
                  border:        `1px solid ${isSelected ? "rgba(255,255,255,0.2)" : isHolidayDay ? `${holidayToken.fg}4d` : meta ? `${meta.fg}30` : "var(--op-border)"}`,
                  outline:       isToday ? "2px solid var(--op-accent)" : "none",
                  outlineOffset: "1px",
                  background:    isSelected ? (meta ? meta.bg : isHolidayDay ? holidayToken.softBg : "rgba(255,255,255,0.05)") : meta ? meta.softBg : isHolidayDay ? holidayToken.softBg : "var(--op-surface-2)",
                  padding:       "5px 4px",
                  display:       "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px",
                  opacity:       beforeJoin ? 0.25 : (!isHolidayDay && !isEditable) ? 0.35 : 1,
                  cursor:        (isHolidayDay || isEditable) ? "pointer" : "default",
                  transition:    "transform var(--dur-fast), background var(--dur-fast)",
                }}
              >
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-11)", fontWeight: isToday ? 800 : 600, color: isToday ? "var(--op-accent)" : isHolidayDay ? holidayToken.fg : meta ? meta.fg : "var(--op-text-2)", lineHeight: 1 }}>{day}</span>
                {status && meta && Icon ? (
                  <Icon size={13} color={meta.fg} strokeWidth={2.25} />
                ) : request ? (
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: `2px dashed ${pendingFg}`, opacity: 0.9 }} />
                ) : isHolidayDay ? (
                  <span style={{ fontSize: "8px", fontFamily: "var(--font-ui)", fontWeight: 700, color: holidayToken.fg, textAlign: "center", lineHeight: 1.15, whiteSpace: "pre-line" }}>{holidayLabel}</span>
                ) : (
                  <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
                )}
              </button>
              <AnimatePresence>
                {isSelected && (
                  isHolidayDay
                    ? <HolidayInfoPopover isSunday={isSunday} holiday={holiday} onClose={() => onSelectDay(null)} />
                    : isEditable
                      ? <StatusPopover
                          targetUser={targetUser} day={day}
                          onSelectStatus={onSelectStatus} onRequest={onRequest}
                          requestOpen={requestDay === day} requestKind={requestKind}
                          requestFrom={iso} requestTo={requestTo} requestReason={requestReason}
                          holidaysByDate={holidaysByDate}
                          onRequestToChange={onRequestToChange}
                          onRequestReasonChange={onRequestReasonChange}
                          onSubmitRequest={onSubmitRequest}
                          onCancelRequest={onCancelRequest}
                          onClose={() => onSelectDay(null)}
                          directEdit={directEdit}
                        />
                      : null
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Holiday Info Popover ─────────────────────────────────────────────────────

function HolidayInfoPopover({ isSunday, holiday, onClose }: {
  isSunday: boolean;
  holiday: ReturnType<typeof getHolidays>[number] | undefined;
  onClose: () => void;
}) {
  const title = holiday?.name ?? (isSunday ? "Weekly Off" : "Holiday");
  return (
    <motion.div
      {...motionPreset.fadeScale}
      data-calendar-popover
      style={{ position: "absolute", zIndex: Z.popover, top: "calc(100% + 6px)", left: "50%", x: "-50%", minWidth: "180px", ...S.card, padding: "12px", boxShadow: "0 16px 40px rgba(0,0,0,0.5)", border: "1px solid rgba(251,191,36,0.25)" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 700, color: "#fbbf24" }}>{title}</div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "3px" }}>No attendance required</div>
        </div>
        <button type="button" onClick={onClose} style={{ ...S.btnGhost, width: "22px", height: "22px", padding: 0, border: "none", color: "var(--op-text-3)" }}>×</button>
      </div>
    </motion.div>
  );
}

// ─── Status Popover ───────────────────────────────────────────────────────────

function StatusPopover({
  targetUser, day, onSelectStatus, onRequest,
  requestOpen, requestKind, requestFrom, requestTo, requestReason,
  holidaysByDate, onRequestToChange, onRequestReasonChange,
  onSubmitRequest, onCancelRequest, onClose, directEdit,
}: {
  targetUser: User; day: number;
  onSelectStatus: (targetUser: User, day: number, status: AttendanceDayStatus | null) => void;
  onRequest: (day: number, kind: RequestKind) => void;
  requestOpen: boolean; requestKind: RequestKind;
  requestFrom: string; requestTo: string; requestReason: string;
  holidaysByDate: Map<string, ReturnType<typeof getHolidays>[number]>;
  onRequestToChange: (v: string) => void;
  onRequestReasonChange: (v: string) => void;
  onSubmitRequest: () => void;
  onCancelRequest: () => void;
  onClose: () => void;
  directEdit: boolean;
}) {
  const skippedCount = requestFrom && requestTo
    ? datesBetween(requestFrom, requestTo).filter((iso) => isHolidayDate(iso, holidaysByDate)).length
    : 0;

  return (
    <motion.div
      {...motionPreset.fadeScale}
      data-calendar-popover
      style={{ position: "absolute", zIndex: Z.popover, top: "calc(100% + 6px)", left: "50%", x: "-50%", minWidth: "200px", ...S.card, padding: "8px", boxShadow: "0 16px 40px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2px" }}>
        <button type="button" onClick={onClose} style={{ ...S.btnGhost, width: "22px", height: "22px", padding: 0, border: "none", color: "var(--op-text-3)", fontSize: "16px" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: "5px", flexDirection: "column" }}>
        {([
          { id: "present" as AttendanceDayStatus, label: "Present", fg: "#4ade80", bg: "rgba(74,222,128,0.10)" },
          { id: "wfh"     as AttendanceDayStatus, label: "WFH",     fg: "#60a5fa", bg: "rgba(96,165,250,0.10)" },
          { id: "leave"   as AttendanceDayStatus, label: "Leave",   fg: "#fbbf24", bg: "rgba(251,191,36,0.10)" },
        ]).map(({ id, label, fg, bg }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === "present" || directEdit) onSelectStatus(targetUser, day, id);
              else onRequest(day, id as RequestKind);
            }}
            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", height: "36px", borderRadius: "var(--r-md)", border: `1px solid ${fg}33`, background: bg, color: fg, padding: "0 10px", fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600, textAlign: "left", cursor: "pointer" }}
          >
            <span style={id === "present" || directEdit ? { width: "10px", height: "10px", borderRadius: "50%", background: fg, flexShrink: 0 } : { width: "10px", height: "10px", borderRadius: "50%", border: `2px dashed ${fg}`, flexShrink: 0 }} />
            {label}
          </button>
        ))}
        <button type="button" onClick={() => onSelectStatus(targetUser, day, null)} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", height: "36px", borderRadius: "var(--r-md)", border: "1px dashed var(--op-border)", background: "transparent", color: "var(--op-text-3)", padding: "0 10px", fontFamily: "var(--font-ui)", fontSize: "var(--text-13)", fontWeight: 600, cursor: "pointer" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "50%", border: "1.5px dashed var(--op-text-3)" }} />
          Clear
        </button>
      </div>

      {!directEdit && requestOpen && (
        <div style={{ marginTop: "10px", borderTop: "1px solid var(--op-border)", paddingTop: "10px", display: "grid", gap: "8px" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", fontWeight: 700, color: "var(--op-text)" }}>
            {requestKind === "wfh" ? "WFH request" : "Leave request"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <div><label style={S.label}>From</label><input type="date" style={S.input} value={requestFrom} disabled /></div>
            <div><label style={S.label}>To</label><input type="date" style={S.input} value={requestTo} min={requestFrom} onChange={(e) => onRequestToChange(e.target.value)} /></div>
          </div>
          {skippedCount > 0 && (
            <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-11)", color: "#fbbf24", display: "flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fbbf24" }} />
              Holidays and Sundays skipped automatically.
            </div>
          )}
          <div>
            <label style={S.label}>Reason</label>
            <input style={S.input} value={requestReason} onChange={(e) => onRequestReasonChange(e.target.value)} placeholder="Short reason" />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={{ ...S.btnPrimary, height: "32px", padding: "0 14px" }} onClick={onSubmitRequest}>Submit</button>
            <button type="button" style={{ ...S.btnGhost, height: "32px", padding: "0 12px" }} onClick={onCancelRequest}>Cancel</button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Summary Panel ────────────────────────────────────────────────────────────

function SummaryPanel({ summary }: { summary: ReturnType<typeof summarize> }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {([
        { label: "Present", value: summary.present, fg: "#4ade80", bg: "rgba(74,222,128,0.10)" },
        { label: "WFH",     value: summary.wfh,     fg: "#60a5fa", bg: "rgba(96,165,250,0.10)" },
        { label: "Leave",   value: summary.leave,   fg: "#fbbf24", bg: "rgba(251,191,36,0.10)" },
      ] as const).map(({ label, value, fg, bg }) => (
        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: "5px", borderRadius: "var(--r-full)", border: `1px solid ${fg}30`, padding: "4px 10px", background: bg, fontFamily: "var(--font-ui)", fontSize: "var(--text-12)", color: fg, fontWeight: 700 }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: fg }} />
          {label} {value}
        </span>
      ))}
    </div>
  );
}

// ─── Organization Summary (KPI row) ───────────────────────────────────────────

function OrgSummaryCards({
  users, recordByUser, leaveRequests,
}: {
  users: User[];
  recordByUser: Map<string, AttendanceRecord>;
  leaveRequests: LeaveRequest[];
}) {
  const todayIso   = new Date().toISOString().slice(0, 10);
  const todayDayKey = String(Number(todayIso.slice(8, 10)));

  let present = 0, wfh = 0, leave = 0;
  for (const u of users) {
    const status = recordByUser.get(u.id)?.days[todayDayKey];
    if (status === "present") present += 1;
    else if (status === "wfh") wfh += 1;
    else if (status === "leave") leave += 1;
  }
  const attendancePct = users.length ? Math.round(((present + wfh) / users.length) * 100) : 0;

  const upcoming = leaveRequests
    .filter((r) => r.status !== "cancelled" && r.status !== "rejected" && r.dateFrom > todayIso)
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));

  const tiles: Array<{ icon: typeof UsersRound; label: string; value: string | number; fg?: string }> = [
    { icon: UsersRound,   label: "Total Employees",  value: users.length },
    { icon: CheckCircle2, label: "Present Today",    value: present, fg: STATUS_TOKENS.present.fg },
    { icon: HomeIcon,     label: "WFH Today",         value: wfh,     fg: STATUS_TOKENS.wfh.fg },
    { icon: CalendarOff,  label: "Leave Today",       value: leave,   fg: STATUS_TOKENS.leave.fg },
    { icon: TrendingUp,   label: "Attendance %",      value: `${attendancePct}%` },
    { icon: CalendarClock, label: "Upcoming Leaves",  value: upcoming.length },
  ];

  return (
    <Surface tone="inset" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: Sp["6"] }}>
      {tiles.map(({ icon: Icon, label, value, fg }) => (
        <Metric key={label} icon={Icon} label={label} value={value} color={fg} />
      ))}
    </Surface>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────
