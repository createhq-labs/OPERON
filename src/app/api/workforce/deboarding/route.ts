import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import {
  canApproveCreatorDeboarding,
  canInitiateEmployeeDeboarding,
  canSubmitCreatorDeboarding,
  canViewAllHrRecords,
} from "@/security/permissions";

export const runtime = "nodejs";

interface HrDeboardingRow {
  id: string;
  user_id: string;
  deboarding_type: string;
  source_type: string;
  source_entity_id: string | null;
  status: string;
  reason: string;
  initiated_by: string;
  initiated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  completed_by: string | null;
  completed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

interface ChecklistItemRow {
  id: string;
  deboarding_id: string;
  item_key: string;
  label: string;
  sort_order: number;
  is_required: boolean;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  note: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  const caller = await resolveRequestUser(request);
  if (!caller) {
    return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  }

  const canView =
    canViewAllHrRecords(caller) ||
    canInitiateEmployeeDeboarding(caller) ||
    canSubmitCreatorDeboarding(caller) ||
    canApproveCreatorDeboarding(caller);
  if (!canView) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const workforceDb = supabaseAdmin.schema("workforce");
  const globalDb = supabaseAdmin.schema("global");

  const { data: rows, error } = await workforceDb
    .from("hr_deboarding")
    .select("*")
    .order("initiated_at", { ascending: false })
    .returns<HrDeboardingRow[]>();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const records = rows ?? [];
  const ids = records.map((r) => r.id);

  const [{ data: checklistRows }, { data: people }] = await Promise.all([
    ids.length > 0
      ? workforceDb.from("hr_deboarding_checklist_items").select("*").in("deboarding_id", ids).order("sort_order").returns<ChecklistItemRow[]>()
      : Promise.resolve({ data: [] as ChecklistItemRow[] }),
    globalDb.from("users").select("id, full_name, email").in(
      "id",
      Array.from(new Set(records.flatMap((r) => [r.user_id, r.initiated_by, r.approved_by, r.completed_by].filter((v): v is string => Boolean(v))))),
    ),
  ]);

  const namesById = new Map<string, string>();
  for (const p of people ?? []) {
    namesById.set(p.id as string, (p.full_name as string | null) || (p.email as string));
  }

  const checklistByDeboarding = new Map<string, ChecklistItemRow[]>();
  for (const item of checklistRows ?? []) {
    if (!checklistByDeboarding.has(item.deboarding_id)) checklistByDeboarding.set(item.deboarding_id, []);
    checklistByDeboarding.get(item.deboarding_id)!.push(item);
  }

  const mapped = records.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: namesById.get(r.user_id) ?? r.user_id,
    deboardingType: r.deboarding_type,
    sourceType: r.source_type,
    status: r.status,
    reason: r.reason,
    initiatedByName: namesById.get(r.initiated_by) ?? r.initiated_by,
    initiatedAt: r.initiated_at,
    approvedByName: r.approved_by ? namesById.get(r.approved_by) ?? r.approved_by : undefined,
    approvedAt: r.approved_at,
    rejectedAt: r.rejected_at,
    rejectionReason: r.rejection_reason,
    completedByName: r.completed_by ? namesById.get(r.completed_by) ?? r.completed_by : undefined,
    completedAt: r.completed_at,
    cancelledAt: r.cancelled_at,
    cancellationReason: r.cancellation_reason,
    checklist: (checklistByDeboarding.get(r.id) ?? []).map((c) => ({
      id: c.id,
      itemKey: c.item_key,
      label: c.label,
      isRequired: c.is_required,
      isCompleted: c.is_completed,
      note: c.note,
    })),
  }));

  return NextResponse.json({ success: true, records: mapped });
}

interface InitiateBody {
  action?: "initiate";
  userId?: string;
  reason?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  const caller = await resolveRequestUser(request);
  if (!caller) {
    return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as InitiateBody | null;
  const userId = body?.userId;
  const reason = body?.reason?.trim();
  if (!userId || !reason) {
    return NextResponse.json({ success: false, error: "An employee/creator and a reason are required." }, { status: 400 });
  }

  const globalDb = supabaseAdmin.schema("global");
  const workforceDb = supabaseAdmin.schema("workforce");

  const { data: targetRow, error: targetError } = await globalDb
    .from("users")
    .select("id, role:roles(name)")
    .eq("id", userId)
    .maybeSingle<{ id: string; role: { name: string } | { name: string }[] | null }>();
  if (targetError || !targetRow) {
    return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
  }
  const roleField = targetRow.role;
  const roleName = (Array.isArray(roleField) ? roleField[0]?.name : roleField?.name) ?? "";
  const isCreator = roleName.trim().toLowerCase() === "creator";

  if (isCreator) {
    if (!canSubmitCreatorDeboarding(caller)) {
      return NextResponse.json({ success: false, error: "You do not have permission to initiate creator deboarding." }, { status: 403 });
    }
    const { data: created, error: insertError } = await workforceDb
      .from("hr_deboarding")
      .insert({
        user_id: userId,
        deboarding_type: "creator",
        source_type: "manual",
        status: "pending_approval",
        reason,
        initiated_by: caller.id,
      })
      .select("id")
      .single<{ id: string }>();
    if (insertError || !created) {
      return NextResponse.json({ success: false, error: insertError?.message ?? "Failed to initiate deboarding." }, { status: 500 });
    }
    await workforceDb.from("hr_deboarding_checklist_items").insert(defaultChecklistRows(created.id));
    return NextResponse.json({ success: true, id: created.id });
  }

  if (!canInitiateEmployeeDeboarding(caller)) {
    return NextResponse.json({ success: false, error: "You do not have permission to initiate employee deboarding." }, { status: 403 });
  }
  const nowIso = new Date().toISOString();
  const { data: created, error: insertError } = await workforceDb
    .from("hr_deboarding")
    .insert({
      user_id: userId,
      deboarding_type: "employee",
      source_type: "manual",
      status: "approved",
      reason,
      initiated_by: caller.id,
      approved_by: caller.id,
      approved_at: nowIso,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !created) {
    return NextResponse.json({ success: false, error: insertError?.message ?? "Failed to initiate deboarding." }, { status: 500 });
  }
  await workforceDb.from("hr_deboarding_checklist_items").insert(defaultChecklistRows(created.id));
  await workforceDb
    .from("employment_details")
    .update({ employment_status: "offboarding", updated_by: caller.id, updated_at: nowIso })
    .eq("user_id", userId);

  return NextResponse.json({ success: true, id: created.id });
}

/** Mirrors workforce.create_default_deboarding_checklist()'s seed set exactly. */
function defaultChecklistRows(deboardingId: string) {
  return [
    { deboarding_id: deboardingId, item_key: "groups_access_removed", label: "Groups access removed", sort_order: 10, is_required: true },
    { deboarding_id: deboardingId, item_key: "document_access_removed", label: "Document access removed", sort_order: 20, is_required: true },
    { deboarding_id: deboardingId, item_key: "email_access_removed", label: "Email access removed", sort_order: 30, is_required: true },
    { deboarding_id: deboardingId, item_key: "drive_access_removed", label: "Drive access removed", sort_order: 40, is_required: true },
    { deboarding_id: deboardingId, item_key: "company_accounts_removed", label: "Company accounts removed", sort_order: 50, is_required: true },
    { deboarding_id: deboardingId, item_key: "assets_data_returned", label: "Assets/data returned", sort_order: 60, is_required: true },
  ];
}
