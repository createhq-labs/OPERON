"use client";

import { useEffect, useState } from "react";
import { UserPlus2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useSession } from "@/auth/useSession";
import { capabilitiesFor } from "@/lib/workforce/capabilities";
import {
  listEmployeeInvitations,
  createEmployeeInvitation,
  revokeEmployeeInvitation,
  listAssignableRoles,
  listAssignableDepartments,
  listAssignableDesignations,
  listAssignableManagers,
  type EmployeeInvitation,
  type AssignmentOption,
  type DesignationOption,
} from "@/lib/workforce/invitations";
import { S, T } from "@/styles/sharedUi";

const EMPLOYMENT_STATUS_OPTIONS = ["active", "on_leave", "pending"] as const;

export default function InvitationsPage() {
  const { user } = useSession();
  const canManage = user
    ? capabilitiesFor({ id: user.id, roleName: user.roleName ?? user.roleId, managerUserId: user.supervisorId }).canManageOnboarding
    : false;

  const [invitations, setInvitations] = useState<EmployeeInvitation[]>([]);
  const [roles, setRoles] = useState<AssignmentOption[]>([]);
  const [departments, setDepartments] = useState<AssignmentOption[]>([]);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);
  const [managers, setManagers] = useState<AssignmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const [invitationList, roleOptions, departmentOptions, designationOptions, managerOptions] = await Promise.all([
        listEmployeeInvitations(),
        listAssignableRoles(),
        listAssignableDepartments(),
        listAssignableDesignations(),
        listAssignableManagers(),
      ]);
      setInvitations(invitationList);
      setRoles(roleOptions);
      setDepartments(departmentOptions);
      setDesignations(designationOptions);
      setManagers(managerOptions);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load invitations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canManage) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  if (!user) return null;

  if (!canManage) {
    return (
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><UserPlus2 size={18} /></div>
          <div style={S.emptyTitle}>No access</div>
          <div style={S.emptyDesc}>Only HR can create or manage employee invitations.</div>
        </div>
      </div>
    );
  }

  const pending = invitations.filter((i) => i.status === "pending");
  const decided = invitations.filter((i) => i.status !== "pending");

  async function handleRevoke(id: string, reason: string) {
    await revokeEmployeeInvitation(id, reason);
    await refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h2 style={S.sectionTitle}>Employee invitations</h2>
            <p style={S.sectionDesc}>
              Self-signup is disabled. Create an employee&apos;s full record here — role, department, designation, manager,
              joining date, and employment status — before they ever log in. On their first sign-in with this email
              (Google or password), access is granted automatically using what you enter below.
            </p>
          </div>
          <button type="button" style={S.btnPrimary} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "New Invitation"}
          </button>
        </div>

        {showForm && (
          <InvitationForm
            roles={roles}
            departments={departments}
            designations={designations}
            managers={managers}
            onCreate={async (input) => {
              await createEmployeeInvitation(input);
              setShowForm(false);
              await refresh();
            }}
          />
        )}
      </div>

      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <Clock size={18} color="var(--op-accent)" />
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Pending invitations</h2>
        </div>

        {loading ? (
          <div style={{ marginTop: "16px", ...T.bodySmall }}>Loading…</div>
        ) : loadError ? (
          <div style={{ marginTop: "16px", ...S.errorText }}>{loadError}</div>
        ) : (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {pending.length === 0 ? (
              <div style={S.emptyState}>
                <div style={S.emptyIcon}><CheckCircle2 size={18} /></div>
                <div style={S.emptyTitle}>No pending invitations</div>
                <div style={S.emptyDesc}>Invitations you create will appear here until the person logs in or you revoke them.</div>
              </div>
            ) : (
              pending.map((i) => <InvitationRow key={i.id} invitation={i} onRevoke={(reason) => handleRevoke(i.id, reason)} />)
            )}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Past invitations</h2>
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {decided.map((i) => (
              <div
                key={i.id}
                style={{
                  ...S.cardInner,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>
                    {i.full_name || i.email}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                    {i.email}
                  </div>
                </div>
                <span
                  style={{
                    ...S.badge,
                    color: i.status === "consumed" ? "var(--op-accent)" : "var(--color-error)",
                    borderColor: i.status === "consumed" ? "rgba(245,166,35,0.25)" : "var(--color-error)",
                  }}
                >
                  {i.status === "consumed" ? "Joined" : `Revoked${i.revoked_reason ? ` — ${i.revoked_reason}` : ""}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvitationForm({
  roles,
  departments,
  designations,
  managers,
  onCreate,
}: {
  roles: AssignmentOption[];
  departments: AssignmentOption[];
  designations: DesignationOption[];
  managers: AssignmentOption[];
  onCreate: (input: Parameters<typeof createEmployeeInvitation>[0]) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [joinedAt, setJoinedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [employmentStatus, setEmploymentStatus] = useState<(typeof EMPLOYMENT_STATUS_OPTIONS)[number]>("active");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const designationsForDepartment = departmentId ? designations.filter((d) => d.departmentId === departmentId) : designations;

  async function submit() {
    if (!email.trim() || !roleId || !departmentId || !designationId || !joinedAt) {
      setError("Email, role, department, designation, and joining date are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onCreate({
        email: email.trim(),
        fullName: fullName.trim() || undefined,
        roleId,
        departmentId,
        designationId,
        managerUserId: managerUserId || undefined,
        joinedAt,
        employmentStatus,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ ...S.cardInner, marginTop: "18px", padding: "16px 18px", border: "1px solid rgba(245,166,35,0.18)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
        <div>
          <label style={S.label}>Email</label>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@company.com" />
        </div>
        <div>
          <label style={S.label}>Full Name (optional)</label>
          <input style={S.input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" />
        </div>
        <div>
          <label style={S.label}>Role</label>
          <select style={S.select} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Select…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Department</label>
          <select
            style={S.select}
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setDesignationId(""); }}
          >
            <option value="">Select…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Designation</label>
          <select style={S.select} value={designationId} onChange={(e) => setDesignationId(e.target.value)}>
            <option value="">Select…</option>
            {designationsForDepartment.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Reporting Manager</label>
          <select style={S.select} value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
            <option value="">No manager</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Joining Date</label>
          <input type="date" style={S.input} value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Employment Status</label>
          <select style={S.select} value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value as typeof employmentStatus)}>
            {EMPLOYMENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px" }}>
        <button type="button" style={S.btnPrimary} disabled={submitting} onClick={submit}>
          {submitting ? "Sending…" : "Send Invitation"}
        </button>
        {error && <span style={S.errorText}>{error}</span>}
      </div>
    </div>
  );
}

function InvitationRow({ invitation, onRevoke }: { invitation: EmployeeInvitation; onRevoke: (reason: string) => Promise<void> }) {
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function confirmRevoke() {
    if (!reason.trim()) {
      setError("A reason is required to revoke an invitation.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await onRevoke(reason.trim());
      setRevoking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div
        style={{
          ...S.cardInner,
          padding: "13px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          border: `1px solid ${revoking ? "rgba(229,72,77,0.3)" : "var(--op-border)"}`,
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>
            {invitation.full_name || invitation.email}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
            {invitation.email} · Invited {new Date(invitation.created_at).toLocaleDateString()} · Joins {invitation.joined_at}
          </div>
        </div>
        <button
          type="button"
          style={{ ...S.btnGhost, height: "30px", padding: "0 12px", fontSize: "var(--text-12)", color: revoking ? "#e5484d" : undefined, borderColor: revoking ? "rgba(229,72,77,0.4)" : undefined }}
          onClick={() => setRevoking((v) => !v)}
        >
          {revoking ? "Cancel" : "Revoke"}
        </button>
      </div>

      {revoking && (
        <div style={{ ...S.card, marginTop: "6px", padding: "14px 16px", border: "1px solid rgba(229,72,77,0.18)" }}>
          <label style={S.label}>Reason</label>
          <input style={S.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this invitation being revoked?" />
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
            <button type="button" style={{ ...S.btnPrimary, background: "#e5484d" }} disabled={submitting} onClick={confirmRevoke}>
              <XCircle size={13} style={{ marginRight: "5px" }} /> Confirm Revoke
            </button>
            {error && <span style={S.errorText}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
