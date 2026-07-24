import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canManageHrCalendar } from "@/security/permissions";

export const runtime = "nodejs";

interface CreateHolidayBody {
  date?: string;
  name?: string;
  description?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });

  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  if (!canManageHrCalendar(caller)) return NextResponse.json({ success: false, error: "You do not have permission to manage the holiday calendar." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as CreateHolidayBody | null;
  const date = body?.date;
  const name = body?.name?.trim();
  if (!date || !name) return NextResponse.json({ success: false, error: "A date and name are required." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .schema("workforce")
    .from("hr_holidays")
    .insert({ holiday_date: date, name, description: body?.description?.trim() || null, created_by: caller.id })
    .select("id, holiday_date, name, description")
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, holiday: { id: data.id, date: data.holiday_date, name: data.name, description: data.description ?? undefined } });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });

  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  if (!canManageHrCalendar(caller)) return NextResponse.json({ success: false, error: "You do not have permission to manage the holiday calendar." }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "A holiday id is required." }, { status: 400 });

  const { error } = await supabaseAdmin.schema("workforce").from("hr_holidays").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
