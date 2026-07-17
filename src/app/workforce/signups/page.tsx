"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UserCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useSession } from "@/auth/useSession";
import { capabilitiesFor } from "@/lib/workforce/capabilities";
import {
  listPendingSignups,
  decidePendingSignup,
  listAssignableRoles,
  listAssignableDepartments,
  listAssignableManagers,
  listAssignableDesignations,
  type PendingSignup,
  type AssignmentOption,
  type DesignationOption,
} from "@/lib/workforce/signups";
import { S, T } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";

const EMPLOYMENT_STATUS_OPTIONS = ["active", "on_leave", "pending"] as const;

export default function SignupsPage() {
  const { user } = useSession();
  const canReview = user
    ? capabilitiesFor({ id: user.id, roleName: user.roleName ?? user.roleId, managerUserId: user.supervisorId }).canManageOnboarding
    : false;

  const [signups, setSignups] = useState<PendingSignup[]>([]);
  const [roles, setRoles] = useState<AssignmentOption[]>([]);
  const [departments, setDepartments] = useState<AssignmentOption[]>([]);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);
  const [managers, setManagers] = useState<AssignmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const [signupsList, roleOptions, departmentOptions, designationOptions, managerOptions] = await Promise.all([
        listPendingSignups(),
        listAssignableRoles(),
        listAssignableDepartments(),
        listAssignableDesignations(),
        listAssignableManagers(),
      ]);
      setSignups(signupsList);
      setRoles(roleOptions);
      setDepartments(departmentOptions);
      setDesignations(designationOptions);
      setManagers(managerOptions);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load signup requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canReview) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview]);

  if (!user) return null;

  if (!canReview) {
    return (
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={S.emptyState}>
          <div style={S.emptyIcon}><UserCheck size={18} /></div>
          <div style={S.emptyTitle}>No access</div>
          <div style={S.emptyDesc}>Only HR can review pending sign-in verification requests.</div>
        </div>
      </div>
    );
  }

  const pending = signups.filter((s) => s.status === "pending");
  const decided = signups.filter((s) => s.status !== "pending");

  async function handleDecision(id: string, input: Parameters<typeof decidePendingSignup>[0]) {
    try {
      await decidePendingSignup(input);
      setExpandedId(null);
      setMessage("");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to record decision.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <Clock size={18} color="var(--op-accent)" />
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Sign-in verification requests</h2>
        </div>
        <p style={{ ...S.sectionDesc, marginTop: "4px" }}>
          Google sign-in never grants Workforce access by itself. Review each request below and assign a role,
          department, and joining date to provision access — or reject it.
        </p>

        {loading ? (
          <div style={{ marginTop: "16px", ...T.bodySmall }}>Loading…</div>
        ) : loadError ? (
          <div style={{ marginTop: "16px", ...S.errorText }}>{loadError}</div>
        ) : (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {pending.length === 0 ? (
              <div style={S.emptyState}>
                <div style={S.emptyIcon}><CheckCircle2 size={18} /></div>
                <div style={S.emptyTitle}>Nothing awaiting review</div>
                <div style={S.emptyDesc}>New Google sign-ins that need HR verification will show up here.</div>
              </div>
            ) : (
              pending.map((s) => (
                <SignupRow
                  key={s.id}
                  signup={s}
                  roles={roles}
                  departments={departments}
                  designations={designations}
                  managers={managers}
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  onDecide={(input) => handleDecision(s.id, input)}
                />
              ))
            )}
            {message && <div style={S.errorText}>{message}</div>}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Past decisions</h2>
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {decided.map((s) => (
              <div
                key={s.id}
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
                    {s.full_name || s.email}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                    {s.email}
                  </div>
                </div>
                <span
                  style={{
                    ...S.badge,
                    color: s.status === "approved" ? "var(--op-accent)" : "var(--color-error)",
                    borderColor: s.status === "approved" ? "rgba(245,166,35,0.25)" : "var(--color-error)",
                  }}
                >
                  {s.status === "approved" ? "Approved" : `Rejected — ${s.rejection_reason ?? ""}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SignupRow({
  signup,
  roles,
  departments,
  designations,
  managers,
  expanded,
  onToggle,
  onDecide,
}: {
  signup: PendingSignup;
  roles: AssignmentOption[];
  departments: AssignmentOption[];
  designations: DesignationOption[];
  managers: AssignmentOption[];
  expanded: boolean;
  onToggle: () => void;
  onDecide: (input: Parameters<typeof decidePendingSignup>[0]) => void;
}) {
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [joinedAt, setJoinedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [employmentStatus, setEmploymentStatus] = useState<(typeof EMPLOYMENT_STATUS_OPTIONS)[number]>("active");
  const [rejectReason, setRejectReason] = useState("");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  const designationsForDepartment = departmentId ? designations.filter((d) => d.departmentId === departmentId) : designations;

  function submitApprove() {
    if (!roleId || !departmentId || !designationId || !joinedAt) {
      setError("Role, department, designation, and joining date are required to approve.");
      return;
    }
    setError("");
    onDecide({
      requestId: signup.id,
      approved: true,
      roleId,
      departmentId,
      designationId,
      managerUserId: managerUserId || undefined,
      joinedAt,
      employmentStatus,
    });
  }

  function submitReject() {
    if (!rejectReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setError("");
    onDecide({ requestId: signup.id, approved: false, reason: rejectReason.trim() });
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
          border: `1px solid ${expanded ? "rgba(245,166,35,0.3)" : "var(--op-border)"}`,
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>
            {signup.full_name || signup.email}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
            {signup.email} · Requested {new Date(signup.requested_at).toLocaleDateString()}
          </div>
        </div>
        <button type="button" style={{ ...S.btnGhost, height: "30px", padding: "0 12px", fontSize: "var(--text-12)" }} onClick={onToggle}>
          Review
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, height: 0 }}
            animate={{ opacity: 1, scale: 1, height: "auto" }}
            exit={{ opacity: 0, scale: 0.97, height: 0 }}
            transition={motionPreset.fadeScale.transition}
            style={{ overflow: "hidden" }}
          >
            <div style={{ ...S.card, marginTop: "6px", padding: "16px 18px", border: "1px solid rgba(245,166,35,0.18)" }}>
              <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                <button type="button" style={S.pill(mode === "approve") as React.CSSProperties} onClick={() => setMode("approve")}>
                  Approve
                </button>
                <button type="button" style={S.pill(mode === "reject") as React.CSSProperties} onClick={() => setMode("reject")}>
                  Reject
                </button>
              </div>

              {mode === "approve" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
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
              )}

              {mode === "reject" && (
                <div>
                  <label style={S.label}>Rejection reason</label>
                  <input style={S.input} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this request being rejected?" />
                </div>
              )}

              {mode && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px" }}>
                  {mode === "approve" ? (
                    <button type="button" style={S.btnPrimary} onClick={submitApprove}>Confirm Approval</button>
                  ) : (
                    <button type="button" style={{ ...S.btnPrimary, background: "#e5484d" }} onClick={submitReject}>
                      <XCircle size={13} style={{ marginRight: "5px" }} /> Confirm Rejection
                    </button>
                  )}
                  <button type="button" style={S.btnGhost} onClick={onToggle}>Cancel</button>
                  {error && <span style={S.errorText}>{error}</span>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
