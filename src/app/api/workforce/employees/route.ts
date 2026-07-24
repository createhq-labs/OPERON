import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canAccessWorkforce, canManagePeople, canUploadDocument, canViewAllHrRecords } from "@/security/permissions";

export const runtime = "nodejs";

interface GlobalUserJoinRow {
  id: string;
  full_name: string | null;
  email: string;
  department_id: string | null;
  designation_id: string | null;
  role_id: string;
  manager_user_id: string | null;
  status: string;
  joined_at: string | null;
  role: { name: string } | { name: string }[] | null;
  department: { name: string } | { name: string }[] | null;
  designation: { name: string } | { name: string }[] | null;
}

function joinedName(value: { name: string } | { name: string }[] | null): string | undefined {
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name;
}

function mapEmployeeRow(row: GlobalUserJoinRow) {
  return {
    id: row.id,
    name: row.full_name || row.email,
    email: row.email,
    roleId: row.role_id,
    roleName: joinedName(row.role),
    departmentId: row.department_id ?? undefined,
    departmentName: joinedName(row.department),
    designationId: row.designation_id ?? undefined,
    designationName: joinedName(row.designation),
    supervisorId: row.manager_user_id ?? undefined,
    status: row.status,
    dateJoined: row.joined_at ?? undefined,
  };
}

const EMPLOYEE_SELECT =
  "id, full_name, email, department_id, designation_id, role_id, manager_user_id, status, joined_at, role:roles(name), department:departments(name), designation:designations(name)";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  const caller = await resolveRequestUser(request);
  if (!caller) {
    return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  }
  if (!canAccessWorkforce(caller)) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const globalDb = supabaseAdmin.schema("global");

  if (request.nextUrl.searchParams.get("options") === "true") {
    // Consumed both by the People module's New Employee form (canManagePeople)
    // and the document upload/edit "Visible to" role+department pickers
    // (canUploadDocument) — the real global.roles/global.departments catalog
    // is needed by anyone who can do either, not just people-management.
    if (!canManagePeople(caller) && !canUploadDocument(caller)) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const [rolesRes, departmentsRes, designationsRes, managersRes] = await Promise.all([
      globalDb.from("roles").select("id, name").order("name"),
      globalDb.from("departments").select("id, name").order("name"),
      globalDb.from("designations").select("id, name, department_id").order("name"),
      globalDb
        .from("users")
        .select(EMPLOYEE_SELECT)
        .eq("status", "active")
        .order("full_name")
        .returns<GlobalUserJoinRow[]>(),
    ]);

    if (rolesRes.error || departmentsRes.error || designationsRes.error || managersRes.error) {
      return NextResponse.json(
        { success: false, error: rolesRes.error?.message ?? departmentsRes.error?.message ?? designationsRes.error?.message ?? managersRes.error?.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      roles: rolesRes.data ?? [],
      departments: departmentsRes.data ?? [],
      designations: (designationsRes.data ?? []).map((row) => ({ id: row.id, name: row.name, departmentId: row.department_id })),
      managers: (managersRes.data ?? []).map((row) => ({ id: row.id, name: row.full_name || row.email, email: row.email })),
    });
  }

  let query = globalDb.from("users").select(EMPLOYEE_SELECT).eq("status", "active");
  if (!canViewAllHrRecords(caller)) {
    query = query.eq("manager_user_id", caller.id);
  }

  const { data, error } = await query.order("full_name").returns<GlobalUserJoinRow[]>();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, employees: (data ?? []).map(mapEmployeeRow) });
}

interface CreateEmployeeBody {
  fullName?: string;
  email?: string;
  roleId?: string;
  departmentId?: string;
  designationId?: string;
  managerUserId?: string;
  joinedAt?: string;
  temporaryPassword?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  const caller = await resolveRequestUser(request);
  if (!caller) {
    return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  }
  if (!canManagePeople(caller)) {
    return NextResponse.json({ success: false, error: "Your role does not have permission to create employees." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as CreateEmployeeBody | null;
  if (!body) {
    return NextResponse.json({ success: false, error: "Malformed request." }, { status: 400 });
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const { roleId, departmentId, joinedAt, temporaryPassword } = body;

  if (!fullName || !email || !roleId || !departmentId || !joinedAt || !temporaryPassword) {
    return NextResponse.json({ success: false, error: "Full name, email, role, department, joined date, and a temporary password are all required." }, { status: 400 });
  }
  if (temporaryPassword.length < 6) {
    return NextResponse.json({ success: false, error: "Temporary password must be at least 6 characters." }, { status: 400 });
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created?.user) {
    return NextResponse.json({ success: false, error: createError?.message ?? "Failed to create the account." }, { status: 400 });
  }

  const { data: row, error: insertError } = await supabaseAdmin
    .schema("global")
    .from("users")
    .insert({
      id: created.user.id,
      full_name: fullName,
      email,
      department_id: departmentId,
      designation_id: body.designationId || null,
      role_id: roleId,
      manager_user_id: body.managerUserId || null,
      status: "active",
      joined_at: joinedAt,
    })
    .select(EMPLOYEE_SELECT)
    .single<GlobalUserJoinRow>();

  if (insertError || !row) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ success: false, error: insertError?.message ?? "Failed to provision the employee record." }, { status: 500 });
  }

  return NextResponse.json({ success: true, employee: mapEmployeeRow(row) });
}
