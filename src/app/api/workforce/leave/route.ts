import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canViewAllHrRecords } from "@/security/permissions";
import { syncApprovedAttendance } from "@/lib/workforceAttendanceSync";
import { resolveCofounderApprover, resolveHrManager } from "@/lib/workforceApprovers";

export const runtime = "nodejs";

interface LeaveRequestRow {
  id: string;
  requester_user_id: string;
  request_type: string;
  date_from: string;
  date_to: string;
  reason: string;
  status: string;
  current_approver_user_id: string | null;
  submitted_at: string | null;
  finalized_at: string | null;
  created_at: string;
}

const ACTIVE_STATUSES = ["pending_manager", "manager_approved", "pending_hr", "approved"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });

  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });

  const globalDb = supabaseAdmin.schema("global");
  const workforceDb = supabaseAdmin.schema("workforce");

  let query = workforceDb.from("hr_leave_requests").select("*");
  if (!canViewAllHrRecords(caller)) {
    const { data: reports } = await globalDb.from("users").select("id").eq("manager_user_id", caller.id);
    const reportIds = (reports ?? []).map((r) => r.id as string);
    const scopeIds = [caller.id, ...reportIds];
    query = query.in("requester_user_id", scopeIds);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).returns<LeaveRequestRow[]>();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const rows = data ?? [];
  const peopleIds = Array.from(new Set(rows.flatMap((r) => [r.requester_user_id, r.current_approver_user_id].filter((v): v is string => Boolean(v)))));
  const namesById = new Map<string, string>();
  if (peopleIds.length > 0) {
    const { data: people } = await globalDb.from("users").select("id, full_name, email").in("id", peopleIds);
    for (const p of people ?? []) namesById.set(p.id as string, (p.full_name as string | null) || (p.email as string));
  }

  const requests = rows.map((r) => ({
    id: r.id,
    userId: r.requester_user_id,
    userName: namesById.get(r.requester_user_id) ?? r.requester_user_id,
    requestType: r.request_type,
    dateFrom: r.date_from,
    dateTo: r.date_to,
    reason: r.reason,
    status: r.status,
    currentApproverUserId: r.current_approver_user_id ?? undefined,
    currentApproverName: r.current_approver_user_id ? namesById.get(r.current_approver_user_id) ?? r.current_approver_user_id : undefined,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ success: true, requests });
}

interface CreateLeaveBody {
  requestType?: "leave" | "wfh";
  dateFrom?: string;
  dateTo?: string;
  reason?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });

  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  if ((caller.roleName ?? "").trim().toLowerCase() === "creator") {
    return NextResponse.json({ success: false, error: "Creators cannot submit Leave/WFH requests." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as CreateLeaveBody | null;
  const { requestType, dateFrom, dateTo } = body ?? {};
  const reason = body?.reason?.trim();
  if (!requestType || !["leave", "wfh"].includes(requestType) || !dateFrom || !dateTo || !reason) {
    return NextResponse.json({ success: false, error: "Type, date range, and reason are all required." }, { status: 400 });
  }
  if (dateFrom > dateTo) return NextResponse.json({ success: false, error: "Date-from cannot be after date-to." }, { status: 400 });

  const globalDb = supabaseAdmin.schema("global");
  const workforceDb = supabaseAdmin.schema("workforce");

  if (!caller.dateJoined) {
    return NextResponse.json({ success: false, error: "Your joining date must be set before you can request Leave/WFH." }, { status: 400 });
  }
  if (dateFrom < caller.dateJoined) {
    return NextResponse.json({ success: false, error: `Leave/WFH cannot begin before your joining date (${caller.dateJoined}).` }, { status: 400 });
  }

  const { data: overlapping } = await workforceDb
    .from("hr_leave_requests")
    .select("id")
    .eq("requester_user_id", caller.id)
    .in("status", ACTIVE_STATUSES)
    .lte("date_from", dateTo)
    .gte("date_to", dateFrom);
  if ((overlapping ?? []).length > 0) {
    return NextResponse.json({ success: false, error: "An overlapping active Leave/WFH request already exists." }, { status: 400 });
  }

  const role = (caller.roleName ?? "").trim().toLowerCase();
  const nowIso = new Date().toISOString();

  // Co-Founder requests are auto-approved.
  if (role === "co-founder") {
    const { data: created, error } = await workforceDb
      .from("hr_leave_requests")
      .insert({
        requester_user_id: caller.id,
        request_type: requestType,
        date_from: dateFrom,
        date_to: dateTo,
        reason,
        status: "approved",
        current_approver_user_id: null,
        submitted_at: nowIso,
        finalized_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) return NextResponse.json({ success: false, error: error?.message ?? "Failed to submit request." }, { status: 500 });

    await workforceDb.from("hr_leave_decisions").insert({ request_id: created.id, decision_stage: "auto", decision: "approved", decided_by: caller.id, reason: "Co-Founder request automatically approved" });
    await syncApprovedAttendance(workforceDb, created.id, caller.id, caller.id, dateFrom, dateTo, requestType);
    return NextResponse.json({ success: true, id: created.id, status: "approved" });
  }

  let approverId: string;
  let status: string;

  if (role === "hr manager") {
    const resolved = await resolveCofounderApprover(globalDb, caller.departmentId);
    if ("error" in resolved) return NextResponse.json({ success: false, error: resolved.error }, { status: 500 });
    approverId = resolved.id;
    status = "pending_hr";
  } else if (caller.supervisorId) {
    approverId = caller.supervisorId;
    status = "pending_manager";
  } else {
    const resolved = await resolveHrManager(globalDb);
    if ("error" in resolved) return NextResponse.json({ success: false, error: resolved.error }, { status: 500 });
    approverId = resolved.id;
    status = "pending_hr";
  }

  const { data: created, error } = await workforceDb
    .from("hr_leave_requests")
    .insert({
      requester_user_id: caller.id,
      request_type: requestType,
      date_from: dateFrom,
      date_to: dateTo,
      reason,
      status,
      current_approver_user_id: approverId,
      submitted_at: nowIso,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) return NextResponse.json({ success: false, error: error?.message ?? "Failed to submit request." }, { status: 500 });

  return NextResponse.json({ success: true, id: created.id, status });
}
