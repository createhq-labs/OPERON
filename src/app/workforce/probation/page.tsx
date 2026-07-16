"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, ClipboardList, CheckCircle2, CalendarClock, XCircle } from "lucide-react";
import {
  getRosterUsers,
  getProbationRecordsForReview,
  submitProbationReview,
  decideProbationReview,
  checkProbationReviewReminders,
  getUserById,
} from "@/core/operon";
import { useSession } from "@/auth/useSession";
import { canSubmitProbationReview, canDecideProbationReview, canViewAllHrRecords } from "@/security/permissions";
import { S } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";
import { StatusPill } from "@/features/workforce/StatusPill";
import { ProbationTimeline, ProbationReviewBanner } from "@/features/workforce/ProbationTimeline";

export default function ProbationPage() {
  const { user } = useSession();
  const [, forceRefresh] = useState(0);
  const [employeeId, setEmployeeId] = useState("");
  const [notes, setNotes] = useState("");
  const [durationDays, setDurationDays] = useState(90);
  const [durationUnit, setDurationUnit] = useState<"days" | "months">("days");
  const [message, setMessage] = useState("");

  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [extendReason, setExtendReason] = useState("");
  const [extendNewReviewDate, setExtendNewReviewDate] = useState("");

  const canSubmit = user ? canSubmitProbationReview(user) : false;
  const canDecide = user ? canDecideProbationReview(user) : false;

  const employees = useMemo(() => getRosterUsers(), []);
  const records      = useMemo(() => (user ? getProbationRecordsForReview(user) : []), [user]);

  useEffect(() => {
    if (user && canViewAllHrRecords(user)) checkProbationReviewReminders(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) return null;

  function refresh() {
    forceRefresh((n) => n + 1);
  }

  function handleSubmit() {
    if (!employeeId) {
      setMessage("Select an employee.");
      return;
    }
    try {
      submitProbationReview(user!, employeeId, { notes: notes || undefined, durationDays, durationUnit });
      setEmployeeId("");
      setNotes("");
      setDurationDays(90);
      setDurationUnit("days");
      setMessage("Probation review submitted.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to submit.");
    }
  }

  function handleDecide(id: string, outcome: "confirmed" | "terminated") {
    try {
      decideProbationReview(user!, id, outcome);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to decide.");
    }
  }

  // Local getters only — never .toISOString() here. Converting a locally-
  // constructed date to UTC shifts the calendar day in positive-UTC-offset
  // timezones (e.g. midnight IST becomes the previous day in UTC).
  function toIsoDateLocal(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function startExtend(record: { id: string; expectedReviewDate: string }) {
    setExtendingId(record.id);
    setExtendDays(30);
    setExtendReason("");
    const base = new Date(`${record.expectedReviewDate}T00:00:00`);
    base.setDate(base.getDate() + 30);
    setExtendNewReviewDate(toIsoDateLocal(base));
  }

  function updateExtendDays(record: { expectedReviewDate: string }, days: number) {
    setExtendDays(days);
    const base = new Date(`${record.expectedReviewDate}T00:00:00`);
    base.setDate(base.getDate() + days);
    setExtendNewReviewDate(toIsoDateLocal(base));
  }

  function confirmExtend(id: string) {
    if (!extendReason.trim()) {
      setMessage("A reason is required to extend probation.");
      return;
    }
    try {
      decideProbationReview(user!, id, "extended", extendReason, {
        extensionDurationDays: extendDays,
        newReviewDate: extendNewReviewDate,
      });
      setExtendingId(null);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to extend.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {canSubmit && (
        <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <ShieldCheck size={18} color="var(--op-accent)" />
            <h2 style={{ ...S.sectionTitle, margin: 0 }}>Submit a probation review</h2>
          </div>
          <p style={{ ...S.sectionDesc, marginTop: "4px" }}>Join date is pulled from onboarding automatically; founders decide the outcome.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginTop: "18px", marginBottom: "14px" }}>
            <div>
              <label style={S.label}>Employee</label>
              <select style={S.select} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Select…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Notes</label>
              <input style={S.input} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Probation Duration</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="number"
                  min={1}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value) || 0)}
                  style={{ ...S.input, width: "90px" }}
                />
                <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "days" | "months")} style={S.select}>
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button type="button" style={S.btnPrimary} onClick={handleSubmit}>Submit</button>
            {message && <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-3)" }}>{message}</span>}
          </div>
        </div>
      )}

      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <ClipboardList size={18} color="var(--op-accent)" />
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Probation records</h2>
        </div>
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {records.length === 0 ? (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}><ClipboardList size={18} /></div>
              <div style={S.emptyTitle}>No probation records</div>
              <div style={S.emptyDesc}>Records submitted above, or created automatically when hiring an employee, will appear here.</div>
            </div>
          ) : records.map((r) => (
            <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ ...S.cardInner, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: "1px solid var(--op-border)", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>
                    {getUserById(r.userId)?.name ?? r.userId}
                  </div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                    Joined {r.dateJoined} · Review due {r.expectedReviewDate}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <StatusPill status={r.status} />
                  {canDecide && (r.status === "pending" || r.status === "under_review") && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" style={{ ...S.btnGhost, display: "inline-flex", alignItems: "center", gap: "5px" }} onClick={() => handleDecide(r.id, "confirmed")}>
                        <CheckCircle2 size={13} /> Confirm
                      </button>
                      <button
                        type="button"
                        style={{ ...S.btnGhost, display: "inline-flex", alignItems: "center", gap: "5px", color: extendingId === r.id ? "#a78bfa" : undefined, borderColor: extendingId === r.id ? "rgba(167,139,250,0.4)" : undefined }}
                        onClick={() => (extendingId === r.id ? setExtendingId(null) : startExtend(r))}
                      >
                        <CalendarClock size={13} /> Extend
                      </button>
                      <button type="button" style={{ ...S.btnGhost, display: "inline-flex", alignItems: "center", gap: "5px", color: "#e5484d", borderColor: "#e5484d" }} onClick={() => handleDecide(r.id, "terminated")}>
                        <XCircle size={13} /> Terminate
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <ProbationReviewBanner record={r} />
              <ProbationTimeline dateJoined={getUserById(r.userId)?.dateJoined ?? r.dateJoined} record={r} />

              <AnimatePresence initial={false}>
                {extendingId === r.id && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97, height: 0 }}
                    animate={{ opacity: 1, scale: 1, height: "auto" }}
                    exit={{ opacity: 0, scale: 0.97, height: 0 }}
                    transition={motionPreset.fadeScale.transition}
                    style={{ overflow: "hidden" }}
                  >
                    <div style={{ ...S.card, padding: "16px 18px", border: "1px solid rgba(245,166,35,0.18)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                        <div>
                          <label style={S.label}>Extension Duration (days)</label>
                          <input
                            type="number"
                            min={1}
                            value={extendDays}
                            onChange={(e) => updateExtendDays(r, Number(e.target.value) || 0)}
                            style={S.input}
                          />
                        </div>
                        <div>
                          <label style={S.label}>New Review Date</label>
                          <input type="date" value={extendNewReviewDate} onChange={(e) => setExtendNewReviewDate(e.target.value)} style={S.input} />
                        </div>
                        <div>
                          <label style={S.label}>Reason</label>
                          <input value={extendReason} onChange={(e) => setExtendReason(e.target.value)} style={S.input} placeholder="Why is this being extended?" />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                        <button type="button" style={S.btnPrimary} onClick={() => confirmExtend(r.id)}>Confirm Extension</button>
                        <button type="button" style={S.btnGhost} onClick={() => setExtendingId(null)}>Cancel</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
