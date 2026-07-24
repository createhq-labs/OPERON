import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canDecideProbationReview, canSubmitProbationReview, canViewAllHrRecords } from "@/security/permissions";

export const runtime = "nodejs";

interface HrProbationRow {
  id: string;
  user_id: string;
  onboarding_id: string | null;
  previous_probation_id: string | null;
  start_date: string;
  end_date: string;
  review_date: string;
  probation_duration_days: number;
  extension_duration_days: number | null;
  extension_reason: string | null;
  status: string;
  recommendation: string | null;
  recommendation_reason: string | null;
  recommended_by: string | null;
  recommended_at: string | null;
  final_decision: string | null;
  final_decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  const caller = await resolveRequestUser(request);
  if (!caller) {
    return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  }

  const canSubmit = canSubmitProbationReview(caller);
  const canDecide = canDecideProbationReview(caller);
  const canViewAll = canViewAllHrRecords(caller);
  if (!canSubmit && !canDecide && !canViewAll) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const workforceDb = supabaseAdmin.schema("workforce");
  const globalDb = supabaseAdmin.schema("global");

  let query = workforceDb.from("hr_probation").select("*");
  if (!canViewAll && !canDecide) {
    // Submit-only callers (e.g. a manager with the real submit permission,
    // not HR-tier) only see their own direct reports' records.
    const { data: reports } = await globalDb.from("users").select("id").eq("manager_user_id", caller.id);
    const reportIds = (reports ?? []).map((r) => r.id as string);
    if (reportIds.length === 0) {
      return NextResponse.json({ success: true, records: [] });
    }
    query = query.in("user_id", reportIds);
  }

  const { data, error } = await query.order("review_date", { ascending: true }).returns<HrProbationRow[]>();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const peopleIds = Array.from(
    new Set(rows.flatMap((r) => [r.user_id, r.recommended_by, r.decided_by].filter((v): v is string => Boolean(v)))),
  );

  const namesById = new Map<string, string>();
  if (peopleIds.length > 0) {
    const { data: people } = await globalDb.from("users").select("id, full_name, email").in("id", peopleIds);
    for (const p of people ?? []) {
      namesById.set(p.id as string, (p.full_name as string | null) || (p.email as string));
    }
  }

  const records = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: namesById.get(r.user_id) ?? r.user_id,
    onboardingId: r.onboarding_id,
    previousProbationId: r.previous_probation_id,
    startDate: r.start_date,
    endDate: r.end_date,
    reviewDate: r.review_date,
    durationDays: r.probation_duration_days,
    extensionDurationDays: r.extension_duration_days,
    extensionReason: r.extension_reason,
    status: r.status,
    recommendation: r.recommendation,
    recommendationReason: r.recommendation_reason,
    recommendedByName: r.recommended_by ? namesById.get(r.recommended_by) ?? r.recommended_by : undefined,
    recommendedAt: r.recommended_at,
    finalDecision: r.final_decision,
    finalDecisionReason: r.final_decision_reason,
    decidedByName: r.decided_by ? namesById.get(r.decided_by) ?? r.decided_by : undefined,
    decidedAt: r.decided_at,
  }));

  return NextResponse.json({ success: true, records });
}
