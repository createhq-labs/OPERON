import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canViewAllHrRecords } from "@/security/permissions";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

interface AttendanceRow { attendance_date: string; status: string }
interface HolidayRow { id: string; holiday_date: string; name: string; description: string | null }
interface LeaveRow {
  id: string; request_type: string; date_from: string; date_to: string;
  reason: string; status: string; created_at: string;
}
interface LeaveDecisionRow { request_id: string; decision_stage: string; decision: string; decided_by: string; reason: string | null; created_at: string }
interface ProbationRow {
  id: string; start_date: string; end_date: string; review_date: string; probation_duration_days: number;
  status: string; recommendation: string | null; recommendation_reason: string | null; recommended_by: string | null; recommended_at: string | null;
  final_decision: string | null; final_decision_reason: string | null; decided_by: string | null; decided_at: string | null;
}
interface OnboardingHistoryRow { onboarding_id: string; old_status: string | null; new_status: string; changed_by: string; created_at: string }
interface ProbationHistoryRow { probation_id: string; old_status: string | null; new_status: string; changed_by: string; created_at: string }
interface DeboardingHistoryRow { deboarding_id: string; old_status: string | null; new_status: string; changed_by: string; created_at: string }
interface JoiningAuditRow { old_joined_at: string | null; new_joined_at: string; change_reason: string; changed_by: string; changed_at: string }
interface AttendanceAuditRow { attendance_date: string; old_status: string | null; new_status: string; changed_by: string; changed_at: string }

interface ActivityEntry {
  id: string;
  timestamp: string;
  actorName: string;
  kind: "onboarding" | "probation" | "leave" | "deboarding" | "attendance" | "joining_date";
  label: string;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!supabaseAdmin) return errorResponse("Server is not configured.", 503);

  const caller = await resolveRequestUser(request);
  if (!caller) return errorResponse("Unauthorized: sign in required.", 401);

  const targetId = params.id;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!from || !to) return errorResponse("A from/to date range is required.");

  const globalDb = supabaseAdmin.schema("global");
  const workforceDb = supabaseAdmin.schema("workforce");

  const { data: targetUser, error: targetError } = await globalDb
    .from("users")
    .select("id, manager_user_id")
    .eq("id", targetId)
    .maybeSingle<{ id: string; manager_user_id: string | null }>();
  if (targetError) return errorResponse(targetError.message, 500);
  if (!targetUser) return errorResponse("Employee not found.", 404);

  const isHrTier = canViewAllHrRecords(caller);
  const inScope = isHrTier || targetId === caller.id || targetUser.manager_user_id === caller.id;
  if (!inScope) return errorResponse("You do not have permission to view this person's records.", 403);

  let supervisorName: string | undefined;
  if (targetUser.manager_user_id) {
    const { data: supervisorRow } = await globalDb.from("users").select("full_name, email").eq("id", targetUser.manager_user_id).maybeSingle<{ full_name: string | null; email: string }>();
    supervisorName = supervisorRow ? (supervisorRow.full_name || supervisorRow.email) : undefined;
  }

  const [
    { data: attendanceRows, error: attendanceError },
    { data: holidayRows, error: holidayError },
    { data: leaveRows, error: leaveError },
    { data: probationRows, error: probationError },
    { data: onboardingRows },
    { data: deboardingRows },
    { data: joiningAuditRows, error: joiningAuditError },
    { data: attendanceAuditRows },
  ] = await Promise.all([
    workforceDb.from("hr_attendance").select("attendance_date, status").eq("user_id", targetId).gte("attendance_date", from).lte("attendance_date", to).returns<AttendanceRow[]>(),
    workforceDb.from("hr_holidays").select("id, holiday_date, name, description").order("holiday_date").returns<HolidayRow[]>(),
    workforceDb.from("hr_leave_requests").select("id, request_type, date_from, date_to, reason, status, created_at").eq("requester_user_id", targetId).order("created_at", { ascending: false }).returns<LeaveRow[]>(),
    workforceDb.from("hr_probation").select("id, start_date, end_date, review_date, probation_duration_days, status, recommendation, recommendation_reason, recommended_by, recommended_at, final_decision, final_decision_reason, decided_by, decided_at").eq("user_id", targetId).order("start_date", { ascending: true }).returns<ProbationRow[]>(),
    workforceDb.from("hr_onboarding").select("id").eq("user_id", targetId).returns<{ id: string }[]>(),
    workforceDb.from("hr_deboarding").select("id").eq("user_id", targetId).returns<{ id: string }[]>(),
    workforceDb.from("joining_date_audit").select("old_joined_at, new_joined_at, change_reason, changed_by, changed_at").eq("user_id", targetId).returns<JoiningAuditRow[]>(),
    workforceDb.from("hr_attendance_audit").select("attendance_date, old_status, new_status, changed_by, changed_at").eq("user_id", targetId).order("changed_at", { ascending: false }).limit(20).returns<AttendanceAuditRow[]>(),
  ]);
  if (attendanceError) return errorResponse(attendanceError.message, 500);
  if (holidayError) return errorResponse(holidayError.message, 500);
  if (leaveError) return errorResponse(leaveError.message, 500);
  if (probationError) return errorResponse(probationError.message, 500);
  if (joiningAuditError) return errorResponse(joiningAuditError.message, 500);

  const leaveIds = (leaveRows ?? []).map((r) => r.id);
  const probationIds = (probationRows ?? []).map((r) => r.id);
  const onboardingIds = (onboardingRows ?? []).map((r) => r.id);
  const deboardingIds = (deboardingRows ?? []).map((r) => r.id);

  const [
    { data: leaveDecisionRows },
    { data: probationHistoryRows },
    { data: onboardingHistoryRows },
    { data: deboardingHistoryRows },
  ] = await Promise.all([
    leaveIds.length > 0
      ? workforceDb.from("hr_leave_decisions").select("request_id, decision_stage, decision, decided_by, reason, created_at").in("request_id", leaveIds).returns<LeaveDecisionRow[]>()
      : Promise.resolve({ data: [] as LeaveDecisionRow[] }),
    probationIds.length > 0
      ? workforceDb.from("hr_probation_status_history").select("probation_id, old_status, new_status, changed_by, created_at").in("probation_id", probationIds).returns<ProbationHistoryRow[]>()
      : Promise.resolve({ data: [] as ProbationHistoryRow[] }),
    onboardingIds.length > 0
      ? workforceDb.from("hr_onboarding_status_history").select("onboarding_id, old_status, new_status, changed_by, created_at").in("onboarding_id", onboardingIds).returns<OnboardingHistoryRow[]>()
      : Promise.resolve({ data: [] as OnboardingHistoryRow[] }),
    deboardingIds.length > 0
      ? workforceDb.from("hr_deboarding_status_history").select("deboarding_id, old_status, new_status, changed_by, created_at").in("deboarding_id", deboardingIds).returns<DeboardingHistoryRow[]>()
      : Promise.resolve({ data: [] as DeboardingHistoryRow[] }),
  ]);

  // Resolve every referenced actor id to a display name in one batch.
  const actorIds = new Set<string>();
  for (const r of leaveDecisionRows ?? []) actorIds.add(r.decided_by);
  for (const r of probationHistoryRows ?? []) actorIds.add(r.changed_by);
  for (const r of onboardingHistoryRows ?? []) actorIds.add(r.changed_by);
  for (const r of deboardingHistoryRows ?? []) actorIds.add(r.changed_by);
  for (const r of joiningAuditRows ?? []) actorIds.add(r.changed_by);
  for (const r of attendanceAuditRows ?? []) actorIds.add(r.changed_by);
  for (const r of probationRows ?? []) { if (r.recommended_by) actorIds.add(r.recommended_by); if (r.decided_by) actorIds.add(r.decided_by); }

  const namesById = new Map<string, string>();
  if (actorIds.size > 0) {
    const { data: people } = await globalDb.from("users").select("id, full_name, email").in("id", Array.from(actorIds));
    for (const p of people ?? []) namesById.set(p.id as string, (p.full_name as string | null) || (p.email as string));
  }
  const nameOf = (id: string | null | undefined) => (id ? namesById.get(id) ?? id : "Someone");

  const leaveTypeById = new Map((leaveRows ?? []).map((r) => [r.id, r.request_type]));

  const activity: ActivityEntry[] = [];
  for (const r of joiningAuditRows ?? []) {
    activity.push({
      id: `join-${r.changed_at}`,
      timestamp: r.changed_at,
      actorName: nameOf(r.changed_by),
      kind: "joining_date",
      label: r.old_joined_at ? `Date joined changed from ${r.old_joined_at} to ${r.new_joined_at}` : `Date joined set to ${r.new_joined_at}`,
    });
  }
  for (const r of onboardingHistoryRows ?? []) {
    activity.push({ id: `onboard-${r.onboarding_id}-${r.created_at}`, timestamp: r.created_at, actorName: nameOf(r.changed_by), kind: "onboarding", label: `Onboarding ${r.old_status ? `moved from ${r.old_status} to` : "started as"} ${r.new_status}` });
  }
  for (const r of probationHistoryRows ?? []) {
    activity.push({ id: `probation-${r.probation_id}-${r.created_at}`, timestamp: r.created_at, actorName: nameOf(r.changed_by), kind: "probation", label: `Probation ${r.old_status ? `moved from ${r.old_status} to` : "started as"} ${r.new_status}` });
  }
  for (const r of leaveDecisionRows ?? []) {
    const typeLabel = leaveTypeById.get(r.request_id) === "wfh" ? "WFH" : "leave";
    activity.push({ id: `leave-${r.request_id}-${r.created_at}`, timestamp: r.created_at, actorName: nameOf(r.decided_by), kind: "leave", label: `${r.decision_stage === "auto" ? "Auto-" : ""}${r.decision} a ${typeLabel} request${r.reason ? `: ${r.reason}` : ""}` });
  }
  for (const r of deboardingHistoryRows ?? []) {
    activity.push({ id: `deboard-${r.deboarding_id}-${r.created_at}`, timestamp: r.created_at, actorName: nameOf(r.changed_by), kind: "deboarding", label: `Deboarding ${r.old_status ? `moved from ${r.old_status} to` : "initiated as"} ${r.new_status}` });
  }
  for (const r of attendanceAuditRows ?? []) {
    activity.push({ id: `attend-${r.attendance_date}-${r.changed_at}`, timestamp: r.changed_at, actorName: nameOf(r.changed_by), kind: "attendance", label: `Attendance for ${r.attendance_date} ${r.old_status ? `changed from ${r.old_status} to` : "set to"} ${r.new_status}` });
  }
  activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const leaveDecisionsByRequest = new Map<string, LeaveDecisionRow>();
  for (const r of leaveDecisionRows ?? []) {
    // Keep the most recent decision per request (a request has at most one
    // decision per stage; the final one is what matters for display).
    const existing = leaveDecisionsByRequest.get(r.request_id);
    if (!existing || existing.created_at < r.created_at) leaveDecisionsByRequest.set(r.request_id, r);
  }

  return NextResponse.json({
    success: true,
    supervisorName,
    attendance: (attendanceRows ?? []).map((r) => ({ date: r.attendance_date, status: r.status })),
    holidays: (holidayRows ?? []).map((h) => ({ id: h.id, date: h.holiday_date, name: h.name, description: h.description ?? undefined })),
    leaveRequests: (leaveRows ?? []).map((r) => {
      const decision = leaveDecisionsByRequest.get(r.id);
      return {
        id: r.id,
        requestType: r.request_type,
        dateFrom: r.date_from,
        dateTo: r.date_to,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        decidedByName: decision ? nameOf(decision.decided_by) : undefined,
        decidedAt: decision?.created_at,
        rejectionReason: decision?.decision === "rejected" ? decision.reason ?? undefined : undefined,
      };
    }),
    probationRecords: (probationRows ?? []).map((r) => ({
      id: r.id,
      startDate: r.start_date,
      endDate: r.end_date,
      reviewDate: r.review_date,
      durationDays: r.probation_duration_days,
      status: r.status,
      recommendation: r.recommendation,
      recommendationReason: r.recommendation_reason,
      recommendedByName: r.recommended_by ? nameOf(r.recommended_by) : undefined,
      recommendedAt: r.recommended_at,
      finalDecision: r.final_decision,
      finalDecisionReason: r.final_decision_reason,
      decidedByName: r.decided_by ? nameOf(r.decided_by) : undefined,
      decidedAt: r.decided_at,
    })),
    activity: activity.slice(0, 60),
  });
}
