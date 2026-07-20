import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "./identity";
import { canManageDrive } from "@/security/permissions";
import { isServiceAccountConfigured, getServiceAccountAccessToken } from "@/services/googleDriveServiceAccount";
import { getCategoryTagMap } from "./categories";
import { fetchAllowedRolesByDocument, fetchHomeDepartmentByDocument, fetchRoleNames } from "./joins";
import { canViewWorkforceDocument } from "./access";
import { documentRowToDocument, fromWorkforceVisibilityScope, type DocumentRow, type DocumentVersionRow } from "./mapping";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }

  const user = await resolveRequestUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized: sign in required." }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("diagnostics") === "true") {
    if (!canManageDrive(user)) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }
    const configured = isServiceAccountConfigured();
    let tokenAcquisitionOk = false;
    if (configured) {
      try {
        await getServiceAccountAccessToken();
        tokenAcquisitionOk = true;
      } catch {
        tokenAcquisitionOk = false;
      }
    }
    return NextResponse.json({
      success: true,
      diagnostics: { configured, tokenAcquisitionOk, connected: configured && tokenAcquisitionOk },
    });
  }

  const db = supabaseAdmin.schema("workforce");
  const globalDb = supabaseAdmin.schema("global");

  const { data: rows, error } = await db
    .from("documents")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .returns<DocumentRow[]>();

  if (error || !rows) {
    return NextResponse.json({ success: false, error: error?.message ?? "Failed to load documents." }, { status: 500 });
  }

  const documentIds = rows.map((r) => r.id);

  const [versionRows, allowedRolesByDoc, homeDeptByDoc, categoryTagMap] = await Promise.all([
    db
      .from("document_versions")
      .select("id, document_id, version_number")
      .in("document_id", documentIds)
      .returns<Pick<DocumentVersionRow, "id" | "document_id" | "version_number">[]>()
      .then((r) => r.data ?? []),
    fetchAllowedRolesByDocument(db, documentIds),
    fetchHomeDepartmentByDocument(db, documentIds),
    getCategoryTagMap(db),
  ]);

  const currentVersionIdByDocId = new Map<string, string>();
  for (const row of rows) {
    const match = versionRows.find((v) => v.document_id === row.id && v.version_number === row.current_version);
    if (match) currentVersionIdByDocId.set(row.id, match.id);
  }

  const visible = rows.filter((row) =>
    canViewWorkforceDocument(user, {
      visibilityScope: fromWorkforceVisibilityScope(row.visibility_scope),
      homeDepartmentId: homeDeptByDoc.get(row.id),
      allowedRoleIds: allowedRolesByDoc.get(row.id) ?? [],
    })
  );

  const allVisibleRoleIds = visible.flatMap((row) => allowedRolesByDoc.get(row.id) ?? []);
  const roleNames = await fetchRoleNames(globalDb, allVisibleRoleIds);

  const documents = visible.map((row) =>
    documentRowToDocument(row, {
      currentVersionId: currentVersionIdByDocId.get(row.id) ?? "",
      tag: categoryTagMap.get(row.category_id ?? "") ?? "internal",
      departmentId: homeDeptByDoc.get(row.id),
      allowedRoleNames: (allowedRolesByDoc.get(row.id) ?? []).map((id) => roleNames.get(id) ?? id),
    })
  );

  return NextResponse.json({ success: true, documents });
}
