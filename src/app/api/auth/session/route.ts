import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createUserScopedClient } from "@/lib/supabaseUserScoped";
import { mapGlobalUserRow, type IdentityResult } from "@/auth/authAdapter";

// Reads global.users/workforce.* — needs the service-role client, which
// isn't edge-compatible.
export const runtime = "nodejs";
// A GET handler with no searchParams usage would otherwise be a candidate
// for static optimization — every request here is per-user (keyed on the
// bearer token), so it must never be cached/statically generated.
export const dynamic = "force-dynamic";

async function lookupActiveProfile(authUserId: string) {
  if (!supabaseAdmin) return null;

  const { data } = await supabaseAdmin
    .schema("global")
    .from("users")
    .select("*, role:roles(name)")
    .eq("id", authUserId)
    .eq("status", "active")
    .maybeSingle();

  return data ? mapGlobalUserRow(data as Record<string, unknown>) : null;
}

/**
 * The single, trusted place identity actually gets resolved. The browser
 * never queries global.users or calls consume_employee_invitation()
 * directly — see the comment on authAdapter.ts's resolveIdentity() for why.
 * Two different privilege levels are needed here, not one:
 *   - the profile lookup runs as the service role (bypasses grants/RLS,
 *     safe because the row is filtered to the token's own verified id)
 *   - consume_employee_invitation() must run as the real user, since its
 *     SECURITY DEFINER body reads auth.uid() to know who's calling it —
 *     a service-role call has no per-user identity to give it.
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

    // No global.users row yet. Self-signup isn't supported — the only way
    // in is a matching HR-created invitation. This is the ONLY code path
    // that ever writes to global.users, and it only ever acts on the
    // caller's own identity (auth.uid()), never a client-supplied target.
    const userScoped = createUserScopedClient(token);
    const linked = userScoped
      ? (await userScoped.schema("workforce").rpc("consume_employee_invitation")).data
      : null;

    if (linked) {
      const provisioned = await lookupActiveProfile(authData.user.id);
      if (provisioned) {
        return NextResponse.json({ kind: "authenticated", user: provisioned });
      }
    }

    const email = authData.user.email?.trim().toLowerCase() ?? "";
    return NextResponse.json({ kind: "not_invited", email });
  } catch {
    return NextResponse.json({ kind: "none" });
  }
}
