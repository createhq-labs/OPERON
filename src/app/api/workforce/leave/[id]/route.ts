import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canApproveLeaveAsHr, canApproveLeaveAsTl } from "@/security/permissions";
import { syncApprovedAttendance } from "@/lib/workforceAttendanceSync";
import { isEitherCofounder, resolveCofounderApprover, resolveHrManager, roleNameOf } from "@/lib/workforceApprovers";

export const runtime = "nodejs";

interface LeaveRequestRow {
  id: string;
  requester_user_id: string;
  request_type: string;
  date_from: string;
  date_to: string;
  status: string;
  current_approver_user_id: string | null;
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

interface PatchBody {
  action?: "manager_decide" | "hr_decide" | "cancel";
  decision?: "approved" | "rejected";
  reason?: string;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!supabaseAdmin) return errorResponse("Server is not configured.", 503);

  const caller = await resolveRequestUser(request);
  if (!caller) return errorResponse("Unauthorized: sign in required.", 401);

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body?.action) return errorResponse("Malformed request.");

  const globalDb = supabaseAdmin.schema("global");
  const workforceDb = supabaseAdmin.schema("workforce");
  const nowIso = new Date().toISOString();

  const { data: reqRow, error: fetchError } = await workforceDb
    .from("hr_leave_requests")
    .select("id, requester_user_id, request_type, date_from, date_to, status, current_approver_user_id")
    .eq("id", params.id)
    .single<LeaveRequestRow>();
  if (fetchError || !reqRow) return errorResponse("Leave/WFH request not found.", 404);

  if (body.action === "manager_decide") {
    if (!canApproveLeaveAsTl(caller)) return errorResponse("You do not have permission to approve this step.", 403);
    if (reqRow.status !== "pending_manager") return errorResponse("This request is not awaiting manager approval.");
    if (reqRow.current_approver_user_id !== caller.id) return errorResponse("You are not the assigned approver for this request.", 403);
    if (!body.decision || !["approved", "rejected"].includes(body.decision)) return errorResponse("Decision must be approved or rejected.");
    if (body.decision === "rejected" && !body.reason?.trim()) return errorResponse("A rejection reason is required.");

    await workforceDb.from("hr_leave_decisions").insert({ request_id: reqRow.id, decision_stage: "manager", decision: body.decision, decided_by: caller.id, reason: body.reason?.trim() ?? null });

    if (body.decision === "rejected") {
      await workforceDb.from("hr_leave_requests").update({ status: "rejected", current_approver_user_id: null, finalized_at: nowIso, updated_at: nowIso }).eq("id", reqRow.id);
      return NextResponse.json({ success: true, status: "rejected" });
    }

    const { data: requesterRow } = await globalDb.from("users").select("department_id, role:roles(name)").eq("id", reqRow.requester_user_id).maybeSingle<{ department_id: string | null; role: { name: string } | { name: string }[] | null }>();
    const requesterRole = roleNameOf(requesterRow?.role ?? null);
    const resolved =
      requesterRole === "hr executive"
        ? await resolveCofounderApprover(globalDb, requesterRow?.department_id)
        : await resolveHrManager(globalDb);
    if ("error" in resolved) return errorResponse(resolved.error, 500);

    await workforceDb.from("hr_leave_requests").update({ status: "pending_hr", current_approver_user_id: resolved.id, updated_at: nowIso }).eq("id", reqRow.id);
    return NextResponse.json({ success: true, status: "pending_hr" });
  }

  if (body.action === "hr_decide") {
    if (!canApproveLeaveAsHr(caller)) return errorResponse("Only HR Manager or Co-Founder may provide final approval.", 403);
    if (reqRow.status !== "pending_hr") return errorResponse("This request is not awaiting final approval.");

    // The recorded current_approver_user_id may be either Co-Founder (this
    // org has two, jointly covering departments outside their own focus
    // area) — so a Co-Founder acting here is authorized even if the OTHER
    // Co-Founder was the one recorded. The HR Manager step still requires
    // an exact match since there's exactly one HR Manager.
    const isRecordedApprover = reqRow.current_approver_user_id === caller.id;
    const callerIsCofounder = (caller.roleName ?? "").trim().toLowerCase() === "co-founder";
    const isAlternateCofounder =
      !isRecordedApprover && callerIsCofounder && reqRow.current_approver_user_id
        ? await isEitherCofounder(globalDb, reqRow.current_approver_user_id)
        : false;
    if (!isRecordedApprover && !isAlternateCofounder) {
      return errorResponse("You are not the assigned final approver for this request.", 403);
    }
    if (!body.decision || !["approved", "rejected"].includes(body.decision)) return errorResponse("Decision must be approved or rejected.");
    if (body.decision === "rejected" && !body.reason?.trim()) return errorResponse("A rejection reason is required.");

    await workforceDb.from("hr_leave_decisions").insert({ request_id: reqRow.id, decision_stage: "hr", decision: body.decision, decided_by: caller.id, reason: body.reason?.trim() ?? null });

    if (body.decision === "rejected") {
      await workforceDb.from("hr_leave_requests").update({ status: "rejected", current_approver_user_id: null, finalized_at: nowIso, updated_at: nowIso }).eq("id", reqRow.id);
      return NextResponse.json({ success: true, status: "rejected" });
    }

    await workforceDb.from("hr_leave_requests").update({ status: "approved", current_approver_user_id: null, finalized_at: nowIso, updated_at: nowIso }).eq("id", reqRow.id);
    await syncApprovedAttendance(workforceDb, reqRow.id, reqRow.requester_user_id, caller.id, reqRow.date_from, reqRow.date_to, reqRow.request_type);
    return NextResponse.json({ success: true, status: "approved" });
  }

  if (body.action === "cancel") {
    if (reqRow.requester_user_id !== caller.id) return errorResponse("You may only cancel your own request.", 403);
    if (["approved", "rejected", "cancelled"].includes(reqRow.status)) return errorResponse("This request can no longer be cancelled.");

    await workforceDb.from("hr_leave_requests").update({ status: "cancelled", current_approver_user_id: null, finalized_at: nowIso, updated_at: nowIso }).eq("id", reqRow.id);
    return NextResponse.json({ success: true, status: "cancelled" });
  }

  return errorResponse("Unknown action.");
}
