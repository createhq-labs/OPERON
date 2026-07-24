import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canApproveCreatorDeboarding, canInitiateEmployeeDeboarding } from "@/security/permissions";

export const runtime = "nodejs";

interface HrDeboardingRow {
  id: string;
  user_id: string;
  deboarding_type: string;
  status: string;
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

interface PatchBody {
  action?: "decide" | "start_checklist" | "set_checklist_item" | "complete" | "cancel";
  decision?: "approved" | "rejected";
  reason?: string;
  itemId?: string;
  isCompleted?: boolean;
  note?: string;
}

function canManageTrack(caller: Parameters<typeof canInitiateEmployeeDeboarding>[0], deboardingType: string): boolean {
  return deboardingType === "creator" ? canApproveCreatorDeboarding(caller) : canInitiateEmployeeDeboarding(caller);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!supabaseAdmin) return errorResponse("Server is not configured.", 503);

  const caller = await resolveRequestUser(request);
  if (!caller) return errorResponse("Unauthorized: sign in required.", 401);

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body?.action) return errorResponse("Malformed request.");

  const workforceDb = supabaseAdmin.schema("workforce");
  const nowIso = new Date().toISOString();

  const { data: record, error: fetchError } = await workforceDb
    .from("hr_deboarding")
    .select("id, user_id, deboarding_type, status")
    .eq("id", params.id)
    .single<HrDeboardingRow>();
  if (fetchError || !record) return errorResponse("Deboarding record not found.", 404);

  if (body.action === "decide") {
    if (record.deboarding_type !== "creator") return errorResponse("Only creator-track deboarding uses this action.");
    if (!canApproveCreatorDeboarding(caller)) return errorResponse("You do not have permission to approve creator deboarding.", 403);
    if (record.status !== "pending_approval") return errorResponse("This record is not awaiting approval.");
    if (!body.decision || !["approved", "rejected"].includes(body.decision)) return errorResponse("Decision must be approved or rejected.");
    if (body.decision === "rejected" && !body.reason?.trim()) return errorResponse("A rejection reason is required.");

    const update =
      body.decision === "rejected"
        ? { status: "rejected", rejected_by: caller.id, rejected_at: nowIso, rejection_reason: body.reason!.trim(), updated_at: nowIso }
        : { status: "approved", approved_by: caller.id, approved_at: nowIso, updated_at: nowIso };
    const { error } = await workforceDb.from("hr_deboarding").update(update).eq("id", record.id);
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (body.action === "start_checklist") {
    if (!canManageTrack(caller, record.deboarding_type)) return errorResponse("You do not have permission to manage this checklist.", 403);
    if (record.status !== "approved") return errorResponse("Only an approved record may start checklist work.");
    const { error } = await workforceDb.from("hr_deboarding").update({ status: "checklist_in_progress", updated_at: nowIso }).eq("id", record.id);
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (body.action === "set_checklist_item") {
    if (!canManageTrack(caller, record.deboarding_type)) return errorResponse("You do not have permission to update this checklist.", 403);
    if (!["approved", "checklist_in_progress"].includes(record.status)) return errorResponse("The checklist cannot be changed in this record's current status.");
    if (!body.itemId) return errorResponse("A checklist item is required.");

    const { error: itemError } = await workforceDb
      .from("hr_deboarding_checklist_items")
      .update({
        is_completed: Boolean(body.isCompleted),
        completed_by: body.isCompleted ? caller.id : null,
        completed_at: body.isCompleted ? nowIso : null,
        note: body.note ?? null,
        updated_at: nowIso,
      })
      .eq("id", body.itemId)
      .eq("deboarding_id", record.id);
    if (itemError) return errorResponse(itemError.message, 500);

    if (record.status === "approved") {
      await workforceDb.from("hr_deboarding").update({ status: "checklist_in_progress", updated_at: nowIso }).eq("id", record.id);
    }
    return NextResponse.json({ success: true });
  }

  if (body.action === "complete") {
    if (!canManageTrack(caller, record.deboarding_type)) return errorResponse("You do not have permission to complete this deboarding.", 403);
    if (!["approved", "checklist_in_progress"].includes(record.status)) return errorResponse("This record is not ready for completion.");

    const { data: pendingRequired } = await workforceDb
      .from("hr_deboarding_checklist_items")
      .select("id")
      .eq("deboarding_id", record.id)
      .eq("is_required", true)
      .eq("is_completed", false);
    if ((pendingRequired ?? []).length > 0) return errorResponse("All required checklist items must be completed first.");

    const { error } = await workforceDb.from("hr_deboarding").update({ status: "completed", completed_by: caller.id, completed_at: nowIso, updated_at: nowIso }).eq("id", record.id);
    if (error) return errorResponse(error.message, 500);

    // Deliberately does not touch global.users.status — same as
    // workforce.complete_deboarding()'s own comment: that's a separate,
    // manual HR step, not automatic here.
    await workforceDb
      .from("employment_details")
      .upsert(
        { user_id: record.user_id, probation_required: false, probation_duration_days: null, employment_status: "offboarded", created_by: caller.id, updated_by: caller.id },
        { onConflict: "user_id" },
      );
    return NextResponse.json({ success: true });
  }

  if (body.action === "cancel") {
    if (!body.reason?.trim()) return errorResponse("A cancellation reason is required.");
    if (!canManageTrack(caller, record.deboarding_type)) return errorResponse("You do not have permission to cancel this deboarding.", 403);
    if (["completed", "cancelled", "rejected"].includes(record.status)) return errorResponse("This record can no longer be cancelled.");

    const { error } = await workforceDb
      .from("hr_deboarding")
      .update({ status: "cancelled", cancelled_by: caller.id, cancelled_at: nowIso, cancellation_reason: body.reason.trim(), updated_at: nowIso })
      .eq("id", record.id);
    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ success: true });
  }

  return errorResponse("Unknown action.");
}
