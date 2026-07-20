import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCompanyDriveFileMetadata, isServiceAccountConfigured } from "@/services/googleDriveServiceAccount";

// Long-running (iterates every stored document); not edge-compatible
// (service-account JWT signing needs Node crypto).
export const runtime = "nodejs";
export const maxDuration = 60;

interface SyncTargetRow {
  id: string;
  current_version: number;
  storage_path: string;
}

/**
 * Vercel Cron target — detects files edited directly in the central Drive
 * folder (outside the app) and refreshes the app's copy of their metadata.
 * Always re-fetches and overwrites file_name/mime_type/file_size_bytes on
 * every run (no modifiedTime tracking column) — cheap, idempotent, and
 * simpler than change-detection for a 15-minute cron. Metadata-only:
 * updates the current version in place, never creates a new
 * document_versions row, and never touches app-only fields (title,
 * description, category, visibility, allowed roles) that Drive has no
 * concept of.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Server is not configured." }, { status: 503 });
  }
  if (!isServiceAccountConfigured()) {
    return NextResponse.json({ success: false, error: "Central Drive storage is not configured." }, { status: 503 });
  }

  const db = supabaseAdmin.schema("workforce");

  const { data: docs, error } = await db
    .from("documents")
    .select("id, current_version, storage_path")
    .eq("is_active", true)
    .not("storage_path", "is", null)
    .returns<SyncTargetRow[]>();

  if (error || !docs) {
    return NextResponse.json({ success: false, error: error?.message ?? "Failed to load documents." }, { status: 500 });
  }

  let checked = 0;
  let updated = 0;
  let failed = 0;

  for (const doc of docs) {
    checked++;
    try {
      const metadata = await getCompanyDriveFileMetadata(doc.storage_path);
      const fileName = (metadata.name as string | undefined) ?? undefined;
      const mimeType = (metadata.mimeType as string | undefined) ?? undefined;
      const rawSize = metadata.size as string | number | undefined;
      const fileSizeBytes = rawSize !== undefined ? Number(rawSize) : undefined;

      await db
        .from("documents")
        .update({ file_name: fileName, mime_type: mimeType, file_size_bytes: fileSizeBytes })
        .eq("id", doc.id);

      const { data: versionRow } = await db
        .from("document_versions")
        .select("id")
        .eq("document_id", doc.id)
        .eq("version_number", doc.current_version)
        .maybeSingle<{ id: string }>();

      if (versionRow) {
        await db
          .from("document_versions")
          .update({ file_name: fileName, mime_type: mimeType, file_size_bytes: fileSizeBytes })
          .eq("id", versionRow.id);
      }

      updated++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success: true, checked, updated, failed });
}
