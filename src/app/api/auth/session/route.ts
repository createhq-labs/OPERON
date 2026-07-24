import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { mapGlobalUserRow, type IdentityResult } from "@/auth/authAdapter";
import { fetchRolePermissionNames } from "@/lib/workforcePermissionLookup";
import type { PermissionId } from "@/core/types";

// Reads global.users — needs the service-role client, which isn't
// edge-compatible.
export const runtime = "nodejs";
// A GET handler with no searchParams usage would otherwise be a candidate
// for static optimization — every request here is per-user (keyed on the
// bearer token), so it must never be cached/statically generated.
export const dynamic = "force-dynamic";

async function lookupActiveProfile(authUserId: string) {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .schema("global")
    .from("users")
    .select("*, role:roles(name)")
    .eq("id", authUserId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    // Surfaced in Vercel's function logs — a query error here was
    // previously indistinguishable from "no matching row," which masked
    // real failures as a plain "not provisioned" denial.
    console.error("[api/auth/session] global.users lookup failed", error);
  }

  if (!data) return null;

  const user = mapGlobalUserRow(data as Record<string, unknown>);
  const permissionIds = user.globalRoleId
    ? await fetchRolePermissionNames(supabaseAdmin.schema("global"), user.globalRoleId)
    : [];

  return { ...user, permissionIds: permissionIds as PermissionId[] };
}

/**
 * The single, trusted place identity actually gets resolved. The browser
 * never queries global.users directly — see the comment on
 * authAdapter.ts's resolveIdentity() for why. Runs as the service role,
 * which bypasses grants/RLS safely here since the row is filtered to the
 * token's own verified id, never a client-supplied one.
 *
 * There is no self-service provisioning path: a global.users row must
 * already exist (HR creates it directly, alongside the person's
 * auth.users entry, before their first login) — anyone without a
 * matching row gets a hard "not_invited" denial.
 */
export async function GET(request: NextRequest): Promise<NextResponse<IdentityResult>> {
  if (!supabaseAdmin) {
    return NextResponse.json({ kind: "none" });
  }

  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
  if (!token) {
    return NextResponse.json({ kind: "none" });
  }

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ kind: "none" });
    }

    const existing = await lookupActiveProfile(authData.user.id);
    if (existing) {
      return NextResponse.json({ kind: "authenticated", user: existing });
    }

    const email = authData.user.email?.trim().toLowerCase() ?? "";
    return NextResponse.json({ kind: "not_invited", email });
  } catch {
    return NextResponse.json({ kind: "none" });
  }
}
