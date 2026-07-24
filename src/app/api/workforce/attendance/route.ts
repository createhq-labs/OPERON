import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canManageHrCalendar, canViewAllHrRecords } from "@/security/permissions";

export const runtime = "nodejs";

const RECENT_PAST_DAYS = 7;

interface AttendanceRow {
  user_id: string;
  attendance_date: string;
  status: string;
}

interface HolidayRow {
  id: string;
  holiday_date: string;
  name: string;
  description: string | null;
}

interface GlobalUserRow {
  id: string;
  full_name: string | null;
  email: string;
  department_id: string | null;
  manager_user_id: string | null;
  status: string;
  role: { name: string } | { name: string }[] | null;
  department: { name: string } | { name: string }[] | null;
}

function roleName(value: { name: string } | { name: string }[] | null): string {
  const row = Array.isArray(value) ? value[0] : value;
  return (row?.name ?? "").trim().toLowerCase();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });

  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });

  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ success: false, error: "A month (YYYY-MM) is required." }, { status: 400 });
  }

  const globalDb = supabaseAdmin.schema("global");
  const workforceDb = supabaseAdmin.schema("workforce");

  const isHrTier = canViewAllHrRecords(caller);

  let usersQuery = globalDb
    .from("users")
    .select("id, full_name, email, department_id, manager_user_id, status, role:roles(name), department:departments(name)")
    .eq("status", "active");
  if (!isHrTier) {
    usersQuery = usersQuery.or(`id.eq.${caller.id},manager_user_id.eq.${caller.id}`);
  }

  const { data: userRows, error: usersError } = await usersQuery.returns<GlobalUserRow[]>();
  if (usersError) return NextResponse.json({ success: false, error: usersError.message }, { status: 500 });

  const visibleUsers = (userRows ?? []).filter((u) => roleName(u.role) !== "creator");
  const userIds = visibleUsers.map((u) => u.id);

  const monthStart = `${month}-01`;
  const monthEndDate = new Date(`${month}-01T00:00:00Z`);
  monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
  monthEndDate.setUTCDate(monthEndDate.getUTCDate() - 1);
  const monthEnd = monthEndDate.toISOString().slice(0, 10);

  const [{ data: attendanceRows, error: attendanceError }, { data: holidayRows, error: holidayError }] = await Promise.all([
    userIds.length > 0
      ? workforceDb.from("hr_attendance").select("user_id, attendance_date, status").in("user_id", userIds).gte("attendance_date", monthStart).lte("attendance_date", monthEnd).returns<AttendanceRow[]>()
      : Promise.resolve({ data: [] as AttendanceRow[], error: null }),
    workforceDb.from("hr_holidays").select("id, holiday_date, name, description").order("holiday_date").returns<HolidayRow[]>(),
  ]);
  if (attendanceError) return NextResponse.json({ success: false, error: attendanceError.message }, { status: 500 });
  if (holidayError) return NextResponse.json({ success: false, error: holidayError.message }, { status: 500 });

  const daysByUser = new Map<string, Record<string, string>>();
  for (const row of attendanceRows ?? []) {
    if (!daysByUser.has(row.user_id)) daysByUser.set(row.user_id, {});
    const day = row.attendance_date.slice(8, 10);
    daysByUser.get(row.user_id)![day] = row.status;
  }

  const records = visibleUsers.map((u) => ({
    userId: u.id,
    month,
    days: daysByUser.get(u.id) ?? {},
  }));

  const users = visibleUsers.map((u) => ({
    id: u.id,
    name: u.full_name || u.email,
    email: u.email,
    departmentId: u.department_id ?? undefined,
    departmentName: (Array.isArray(u.department) ? u.department[0]?.name : u.department?.name) ?? undefined,
    supervisorId: u.manager_user_id ?? undefined,
    roleName: (Array.isArray(u.role) ? u.role[0]?.name : u.role?.name) ?? undefined,
  }));

  const holidays = (holidayRows ?? []).map((h) => ({ id: h.id, date: h.holiday_date, name: h.name, description: h.description ?? undefined }));

  return NextResponse.json({ success: true, records, users, holidays });
}

interface SetAttendanceBody {
  userId?: string;
  date?: string;
  status?: "present" | "wfh" | "leave" | "unmarked";
  note?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });

  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as SetAttendanceBody | null;
  const { userId, date, status } = body ?? {};
  if (!userId || !date || !status) {
    return NextResponse.json({ success: false, error: "A person, date, and status are required." }, { status: 400 });
  }
  if (!["present", "wfh", "leave", "unmarked"].includes(status)) {
    return NextResponse.json({ success: false, error: "Invalid attendance status." }, { status: 400 });
  }

  const isHr = canManageHrCalendar(caller);
  const isSelf = userId === caller.id;

  if (!isHr) {
    // Employees may only mark themselves present, for a recent-past working day.
    if (!isSelf || status !== "present") {
      return NextResponse.json({ success: false, error: "You may only mark yourself present. Use a Leave/WFH request for anything else." }, { status: 403 });
    }
    const today = new Date();
    const target = new Date(`${date}T00:00:00`);
    const diffDays = Math.round((today.setHours(0, 0, 0, 0) - target.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays > RECENT_PAST_DAYS) {
      return NextResponse.json({ success: false, error: "That date is outside the window you can self-mark." }, { status: 403 });
    }
  }

  const workforceDb = supabaseAdmin.schema("workforce");

  const { data: holidayRow } = await workforceDb.from("hr_holidays").select("id").eq("holiday_date", date).maybeSingle();
  const isSunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
  if (!isHr && (isSunday || holidayRow)) {
    return NextResponse.json({ success: false, error: "That day is a holiday and cannot be marked." }, { status: 400 });
  }

  const { error } = await workforceDb.from("hr_attendance").upsert(
    {
      user_id: userId,
      attendance_date: date,
      status,
      source_type: "manual",
      source_entity_id: null,
      note: body?.note ?? null,
      created_by: caller.id,
      updated_by: caller.id,
    },
    { onConflict: "user_id,attendance_date" },
  );
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
