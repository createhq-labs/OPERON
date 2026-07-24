"use client";

import { useEffect, useState } from "react";
import { UserMinus2, ClipboardList, CheckCircle2, XCircle } from "lucide-react";
import { useSession } from "@/auth/useSession";
import {
  canApproveCreatorDeboarding,
  canInitiateEmployeeDeboarding,
  canSubmitCreatorDeboarding,
} from "@/security/permissions";
import {
  listWorkforceDeboardingRecords,
  initiateWorkforceDeboarding,
  decideCreatorDeboarding,
  setDeboardingChecklistItem,
  completeWorkforceDeboarding,
  cancelWorkforceDeboarding,
  type WorkforceDeboardingRecord,
} from "@/services/workforceDeboarding";
import { listWorkforceEmployees, type WorkforceEmployee } from "@/services/workforceEmployees";
import { S } from "@/styles/sharedUi";
import { StatusPill } from "@/features/workforce/StatusPill";

const OPEN_STATUSES = new Set(["pending_approval", "approved", "checklist_in_progress"]);

export default function DeboardingPage() {
  const { user } = useSession();
  const [records, setRecords] = useState<WorkforceDeboardingRecord[]>([]);
  const [people, setPeople] = useState<WorkforceEmployee[]>([]);
  const [loadError, setLoadError] = useState("");
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");

  const [showInitiate, setShowInitiate] = useState(false);
  const [initiateUserId, setInitiateUserId] = useState("");
  const [initiateReason, setInitiateReason] = useState("");

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const canInitiateEmployee = user ? canInitiateEmployeeDeboarding(user) : false;
  const canInitiateCreator = user ? canSubmitCreatorDeboarding(user) : false;
  const canApproveCreator = user ? canApproveCreatorDeboarding(user) : false;

  useEffect(() => {
    let cancelled = false;
    listWorkforceDeboardingRecords()
      .then((rows) => { if (!cancelled) { setRecords(rows); setLoadError(""); } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load deboarding records."); });
    if (canInitiateEmployee || canInitiateCreator) {
      listWorkforceEmployees().then((rows) => { if (!cancelled) setPeople(rows); }).catch(() => undefined);
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!user) return null;

  function refresh() {
    setVersion((v) => v + 1);
  }

  async function handleInitiate() {
    if (!initiateUserId) { setMessage("Select a person."); return; }
    if (!initiateReason.trim()) { setMessage("A reason is required."); return; }
    try {
      await initiateWorkforceDeboarding(initiateUserId, initiateReason.trim());
      setShowInitiate(false);
      setInitiateUserId("");
      setInitiateReason("");
      setMessage("Deboarding initiated.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to initiate deboarding.");
    }
  }

  async function handleApprove(id: string) {
    try {
      await decideCreatorDeboarding(id, "approved");
      setMessage("Deboarding approved.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to approve.");
    }
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) { setMessage("A rejection reason is required."); return; }
    try {
      await decideCreatorDeboarding(id, "rejected", rejectReason.trim());
      setRejectingId(null);
      setMessage("Deboarding rejected.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to reject.");
    }
  }

  async function handleToggleItem(record: WorkforceDeboardingRecord, itemId: string, isCompleted: boolean) {
    try {
      await setDeboardingChecklistItem(record.id, itemId, isCompleted);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update checklist item.");
    }
  }

  async function handleComplete(id: string) {
    try {
      await completeWorkforceDeboarding(id);
      setMessage("Deboarding completed.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to complete deboarding.");
    }
  }

  async function handleCancel(id: string) {
    if (!cancelReason.trim()) { setMessage("A cancellation reason is required."); return; }
    try {
      await cancelWorkforceDeboarding(id, cancelReason.trim());
      setCancellingId(null);
      setMessage("Deboarding cancelled.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to cancel.");
    }
  }

  function canManageRecord(record: WorkforceDeboardingRecord): boolean {
    return record.deboardingType === "creator" ? canApproveCreator : canInitiateEmployee;
  }

  const openRecords = records.filter((r) => OPEN_STATUSES.has(r.status));
  const resolvedRecords = records.filter((r) => !OPEN_STATUSES.has(r.status));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <UserMinus2 size={18} color="var(--op-accent)" />
              <h2 style={{ ...S.sectionTitle, margin: 0 }}>Deboarding</h2>
            </div>
            <p style={{ ...S.sectionDesc, marginTop: "4px" }}>
              Employee-track deboarding is auto-approved on initiation; creator-track requires a separate
              approval step before the checklist can start.
            </p>
          </div>
          {(canInitiateEmployee || canInitiateCreator) && (
            <button type="button" style={S.btnPrimary} onClick={() => setShowInitiate((v) => !v)}>
              {showInitiate ? "Cancel" : "Initiate Deboarding"}
            </button>
          )}
        </div>
        {message && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-3)", marginTop: "10px" }}>{message}</p>}
        {loadError && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--color-error)", marginTop: "10px" }}>{loadError}</p>}
      </div>

      {showInitiate && (
        <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            <div>
              <label style={S.label}>Person</label>
              <select style={S.select} value={initiateUserId} onChange={(e) => setInitiateUserId(e.target.value)}>
                <option value="">Select…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.userType})</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Reason</label>
              <input style={S.input} value={initiateReason} onChange={(e) => setInitiateReason(e.target.value)} placeholder="Why is this person being offboarded?" />
            </div>
          </div>
          <div style={{ marginTop: "14px" }}>
            <button type="button" style={S.btnPrimary} onClick={handleInitiate}>Initiate Deboarding</button>
          </div>
        </div>
      )}

      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <ClipboardList size={18} color="var(--op-accent)" />
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Open cases</h2>
        </div>
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {openRecords.length === 0 ? (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}><ClipboardList size={18} /></div>
              <div style={S.emptyTitle}>No open deboarding cases</div>
              <div style={S.emptyDesc}>Initiated cases will appear here.</div>
            </div>
          ) : openRecords.map((r) => {
            const showApproveReject = r.deboardingType === "creator" && r.status === "pending_approval" && canApproveCreator;
            const showChecklist = ["approved", "checklist_in_progress"].includes(r.status) && canManageRecord(r);
            const allRequiredDone = r.checklist.filter((c) => c.isRequired).every((c) => c.isCompleted);
            return (
              <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ ...S.cardInner, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: "1px solid var(--op-border)", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>
                      {r.userName} <span style={{ ...S.badge, marginLeft: "8px" }}>{r.deboardingType}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                      {r.reason} · Initiated by {r.initiatedByName}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <StatusPill status={r.status} />
                    {showApproveReject && (
                      <>
                        <button type="button" style={{ ...S.btnGhost, display: "inline-flex", alignItems: "center", gap: "5px" }} onClick={() => handleApprove(r.id)}>
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button type="button" style={{ ...S.btnGhost, color: "#e5484d", borderColor: "#e5484d" }} onClick={() => (rejectingId === r.id ? setRejectingId(null) : (setRejectingId(r.id), setRejectReason("")))}>
                          <XCircle size={13} /> Reject
                        </button>
                      </>
                    )}
                    {canManageRecord(r) && !["completed", "cancelled", "rejected"].includes(r.status) && (
                      <button type="button" style={S.btnGhost} onClick={() => (cancellingId === r.id ? setCancellingId(null) : (setCancellingId(r.id), setCancelReason("")))}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {rejectingId === r.id && (
                  <div style={{ ...S.card, padding: "14px 16px", border: "1px solid rgba(229,72,77,0.2)", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <input style={{ ...S.input, flex: "1 1 220px" }} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason" />
                    <button type="button" style={S.btnPrimary} onClick={() => handleReject(r.id)}>Confirm Reject</button>
                    <button type="button" style={S.btnGhost} onClick={() => setRejectingId(null)}>Cancel</button>
                  </div>
                )}

                {cancellingId === r.id && (
                  <div style={{ ...S.card, padding: "14px 16px", border: "1px solid var(--op-border)", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <input style={{ ...S.input, flex: "1 1 220px" }} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Cancellation reason" />
                    <button type="button" style={S.btnPrimary} onClick={() => handleCancel(r.id)}>Confirm Cancel</button>
                    <button type="button" style={S.btnGhost} onClick={() => setCancellingId(null)}>Back</button>
                  </div>
                )}

                {showChecklist && (
                  <div style={{ ...S.cardInner, padding: "14px 18px", border: "1px solid var(--op-border)", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {r.checklist.map((item) => (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <input type="checkbox" checked={item.isCompleted} onChange={(e) => handleToggleItem(r, item.id, e.target.checked)} />
                        <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: item.isCompleted ? "var(--op-text-3)" : "var(--op-text)", textDecoration: item.isCompleted ? "line-through" : "none" }}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                    <div style={{ marginTop: "8px" }}>
                      <button
                        type="button"
                        disabled={!allRequiredDone}
                        style={{ ...S.btnPrimary, opacity: allRequiredDone ? 1 : 0.4, cursor: allRequiredDone ? "pointer" : "not-allowed" }}
                        onClick={() => handleComplete(r.id)}
                      >
                        Mark Offboarded
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {resolvedRecords.length > 0 && (
        <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <ClipboardList size={18} color="var(--op-accent)" />
            <h2 style={{ ...S.sectionTitle, margin: 0 }}>Resolved</h2>
          </div>
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {resolvedRecords.map((r) => (
              <div key={r.id} style={{ ...S.cardInner, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: "1px solid var(--op-border)", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{r.userName}</div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                    {r.rejectionReason || r.cancellationReason || r.reason}
                    {r.completedByName && ` · Completed by ${r.completedByName}`}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
