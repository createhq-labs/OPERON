import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRequestUser } from "@/app/api/documents/identity";
import { canEditDocument, canPublishGlobally } from "@/security/permissions";
import { resolveCategoryId, resolveCategoryTag } from "@/app/api/documents/categories";
import { replaceAllowedRoles, fetchRoleNames } from "@/app/api/documents/joins";
import { documentRowToDocument, toWorkforceVisibilityScope, type DocumentRow } from "@/app/api/documents/mapping";
import type { DocTag, RoleId, VisibilityScope } from "@/core/types";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

interface DocumentPatchBody {
  title?: string;
  description?: string;
  tag?: DocTag;
  visibilityScope?: VisibilityScope;
  allowedRoleIds?: RoleId[];
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  if (!supabaseAdmin) {
    return errorResponse("Server is not configured.", 503);
  }

  const user = await resolveRequestUser(request);
  if (!user) {
    return errorResponse("Unauthorized: sign in required.", 401);
  }
  if (!canEditDocument(user)) {
    return errorResponse("Your role does not have permission to edit documents.", 403);
  }

  const body = (await request.json().catch(() => null)) as DocumentPatchBody | null;
  if (!body) {
    return errorResponse("Malformed request body.", 400);
  }
  if (body.allowedRoleIds && body.allowedRoleIds.length === 0) {
    return errorResponse("A document must have at least one allowed role.", 400);
  }
  if (body.visibilityScope === "global" && !canPublishGlobally(user)) {
    return errorResponse("You are not authorized to publish documents globally.", 403);
  }

  const db = supabaseAdmin.schema("workforce");
  const globalDb = supabaseAdmin.schema("global");

  const { data: existing, error: fetchError } = await db
    .from("documents")
    .select("*")
    .eq("id", params.id)
    .single<DocumentRow>();

  if (fetchError || !existing) {
    return errorResponse("Document not found.", 404);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description.trim();
  if (body.visibilityScope !== undefined) updates.visibility_scope = toWorkforceVisibilityScope(body.visibilityScope);
  if (body.tag !== undefined) updates.category_id = await resolveCategoryId(db, body.tag);

  const { data: updated, error: updateError } = await db
    .from("documents")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .single<DocumentRow>();

  if (updateError || !updated) {
    return errorResponse(`Failed to update document: ${updateError?.message ?? "unknown error"}`, 500);
  }

  if (body.allowedRoleIds !== undefined) {
    await replaceAllowedRoles(db, params.id, body.allowedRoleIds);
  }

  const [versionRow, roleRows, deptRow] = await Promise.all([
    db.from("document_versions").select("id").eq("document_id", updated.id).eq("version_number", updated.current_version).maybeSingle<{ id: string }>(),
    db.from("document_allowed_roles").select("role_id").eq("document_id", params.id).returns<Array<{ role_id: string }>>(),
    db.from("document_allowed_departments").select("department_id").eq("document_id", params.id).maybeSingle<{ department_id: string }>(),
  ]);

  const allowedRoleIds = (roleRows.data ?? []).map((r) => r.role_id);
  const roleNames = await fetchRoleNames(globalDb, allowedRoleIds);
  const tag = await resolveCategoryTag(db, updated.category_id);

  const document = documentRowToDocument(updated, {
    currentVersionId: versionRow.data?.id ?? "",
    tag,
    departmentId: deptRow.data?.department_id,
    allowedRoleNames: allowedRoleIds.map((id) => roleNames.get(id) ?? id),
  });

  return NextResponse.json({ success: true, document });
}
