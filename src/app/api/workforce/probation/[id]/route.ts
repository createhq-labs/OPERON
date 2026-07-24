import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canDecideProbationReview, canSubmitProbationReview } from "@/security/permissions";

export const runtime = "nodejs";

interface HrProbationRow {
  id: string;
  user_id: string;
  onboarding_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
  recommendation: string | null;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

interface PatchBody {
  action?: "recommend" | "decide";
  recommendation?: "confirm" | "extend" | "terminate";
  decision?: "confirmed" | "extended" | "terminated" | "cancelled";
  reason?: string;
  extensionDurationDays?: number;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!supabaseAdmin) return errorResponse("Server is not configured.", 503);

  const caller = await resolveRequestUser(request);
  if (!caller) return errorResponse("Unauthorized: sign in required.", 401);

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body?.action) return errorResponse("Malformed request.");

  const reason = body.reason?.trim();
  if (!reason) return errorResponse("A reason is required.");

  const workforceDb = supabaseAdmin.schema("workforce");
  const nowIso = new Date().toISOString();

  const { data: probation, error: fetchError } = await workforceDb
    .from("hr_probation")
    .select("id, user_id, onboarding_id, start_date, end_date, status, recommendation")
    .eq("id", params.id)
    .single<HrProbationRow>();

  if (fetchError || !probation) return errorResponse("Probation record not found.", 404);

  if (body.action === "recommend") {
    if (!canSubmitProbationReview(caller)) return errorResponse("You do not have permission to submit probation recommendations.", 403);
    if (!body.recommendation || !["confirm", "extend", "terminate"].includes(body.recommendation)) {
      return errorResponse("Recommendation must be confirm, extend or terminate.");
    }
    if (!["active", "review_due"].includes(probation.status)) {
      return errorResponse("A recommendation cannot be submitted for this probation's current status.");
    }

    const { error: updateError } = await workforceDb
      .from("hr_probation")
      .update({
        recommendation: body.recommendation,
        recommendation_reason: reason,
        recommended_by: caller.id,
        recommended_at: nowIso,
        status: "recommendation_submitted",
        updated_by: caller.id,
        updated_at: nowIso,
      })
      .eq("id", probation.id);
    if (updateError) return errorResponse(updateError.message, 500);

    await workforceDb.from("hr_probation_notes").insert({
      probation_id: probation.id,
      note: reason,
      note_type: "recommendation",
      created_by: caller.id,
    });

    return NextResponse.json({ success: true });
  }

  if (body.action === "decide") {
    if (!canDecideProbationReview(caller)) return errorResponse("Only the Co-Founder may finalize probation decisions.", 403);
    if (!body.decision || !["confirmed", "extended", "terminated", "cancelled"].includes(body.decision)) {
      return errorResponse("Decision must be confirmed, extended, terminated or cancelled.");
    }
    if (probation.status !== "recommendation_submitted") {
      return errorResponse("A submitted recommendation is required before a final decision.");
    }
    if (body.decision === "extended" && (!body.extensionDurationDays || body.extensionDurationDays <= 0)) {
      return errorResponse("A positive extension duration is required.");
    }

    const { error: updateError } = await workforceDb
      .from("hr_probation")
      .update({
        final_decision: body.decision,
        final_decision_reason: reason,
        decided_by: caller.id,
        decided_at: nowIso,
        status: body.decision,
        updated_by: caller.id,
        updated_at: nowIso,
      })
      .eq("id", probation.id);
    if (updateError) return errorResponse(updateError.message, 500);

    await workforceDb.from("hr_probation_notes").insert({
      probation_id: probation.id,
      note: reason,
      note_type: body.decision === "extended" ? "extension" : "decision",
      created_by: caller.id,
    });

    if (body.decision === "extended") {
      const extensionDays = body.extensionDurationDays!;
      const newEndDate = addDays(probation.end_date, extensionDays);
      const { error: extendError } = await workforceDb.from("hr_probation").insert({
        user_id: probation.user_id,
        onboarding_id: probation.onboarding_id,
        previous_probation_id: probation.id,
        start_date: probation.end_date,
        end_date: newEndDate,
        review_date: newEndDate,
        probation_duration_days: extensionDays,
        extension_duration_days: extensionDays,
        extension_reason: reason,
        status: "active",
        created_by: caller.id,
        updated_by: caller.id,
      });
      if (extendError) return errorResponse(`Decision saved, but the extended probation record failed to save: ${extendError.message}`, 500);
    }

    if (body.decision === "confirmed") {
      await workforceDb
        .from("employment_details")
        .update({ probation_required: false, probation_duration_days: null, employment_status: "active", updated_by: caller.id, updated_at: nowIso })
        .eq("user_id", probation.user_id);
    }

    if (body.decision === "terminated") {
      await workforceDb
        .from("employment_details")
        .update({ employment_status: "offboarding", updated_by: caller.id, updated_at: nowIso })
        .eq("user_id", probation.user_id);

      // Mirrors workforce.initiate_employee_deboarding()'s core insert — the
      // full initiate/approve/checklist workflow is built out in the
      // Deboarding phase; this just seeds the record so probation
      // termination doesn't leave employment_status stuck at "offboarding"
      // with no corresponding deboarding case.
      await workforceDb.from("hr_deboarding").insert({
        user_id: probation.user_id,
        deboarding_type: "employee",
        source_type: "probation_termination",
        source_entity_id: probation.id,
        status: "approved",
        reason: `Probation terminated: ${reason}`,
        initiated_by: caller.id,
        approved_by: caller.id,
        approved_at: nowIso,
      });
    }

    return NextResponse.json({ success: true });
  }

  return errorResponse("Unknown action.");
}
