"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, ClipboardList, CheckCircle2, XCircle } from "lucide-react";
import { useSession } from "@/auth/useSession";
import { canSubmitProbationReview, canDecideProbationReview } from "@/security/permissions";
import {
  listWorkforceProbationRecords,
  submitProbationRecommendation,
  decideProbationRecord,
  type WorkforceProbationRecord,
} from "@/services/workforceProbation";
import { S } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";
import { StatusPill } from "@/features/workforce/StatusPill";

const OPEN_STATUSES = new Set(["active", "review_due", "recommendation_submitted"]);

export default function ProbationPage() {
  const { user } = useSession();
  const [records, setRecords] = useState<WorkforceProbationRecord[]>([]);
  const [loadError, setLoadError] = useState("");
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState("");

  const [recommendingId, setRecommendingId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<"confirm" | "extend" | "terminate">("confirm");
  const [recommendReason, setRecommendReason] = useState("");

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"confirmed" | "extended" | "terminated" | "cancelled">("confirmed");
  const [decideReason, setDecideReason] = useState("");
  const [extensionDays, setExtensionDays] = useState(30);

  const canSubmit = user ? canSubmitProbationReview(user) : false;
  const canDecide = user ? canDecideProbationReview(user) : false;

  useEffect(() => {
    let cancelled = false;
    listWorkforceProbationRecords()
      .then((rows) => { if (!cancelled) { setRecords(rows); setLoadError(""); } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load probation records."); });
    return () => { cancelled = true; };
  }, [version]);

  if (!user) return null;

  function refresh() {
    setVersion((v) => v + 1);
  }

  function startRecommend(id: string) {
    setRecommendingId(id);
    setRecommendation("confirm");
    setRecommendReason("");
    setDecidingId(null);
  }

  async function confirmRecommend(id: string) {
    if (!recommendReason.trim()) { setMessage("A reason is required."); return; }
    try {
      await submitProbationRecommendation(id, recommendation, recommendReason.trim());
      setRecommendingId(null);
      setMessage("Recommendation submitted.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to submit recommendation.");
    }
  }

  function startDecide(id: string) {
    setDecidingId(id);
    setDecision("confirmed");
    setDecideReason("");
    setExtensionDays(30);
    setRecommendingId(null);
  }

  async function confirmDecide(id: string) {
    if (!decideReason.trim()) { setMessage("A reason is required."); return; }
    try {
      await decideProbationRecord(id, decision, decideReason.trim(), decision === "extended" ? extensionDays : undefined);
      setDecidingId(null);
      setMessage("Decision recorded.");
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to record decision.");
    }
  }

  const openRecords = records.filter((r) => OPEN_STATUSES.has(r.status));
  const resolvedRecords = records.filter((r) => !OPEN_STATUSES.has(r.status));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <ShieldCheck size={18} color="var(--op-accent)" />
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Probation</h2>
        </div>
        <p style={{ ...S.sectionDesc, marginTop: "4px" }}>
          Records are created automatically when an employee with probation enabled is onboarded, using their
          real joining date. HR recommends an outcome; the Co-Founder makes the final decision.
        </p>
        {message && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--op-text-3)", marginTop: "10px" }}>{message}</p>}
        {loadError && <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-13)", color: "var(--color-error)", marginTop: "10px" }}>{loadError}</p>}
      </div>

      <div style={{ ...S.card, padding: "clamp(16px, 2.5vw, 28px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <ClipboardList size={18} color="var(--op-accent)" />
          <h2 style={{ ...S.sectionTitle, margin: 0 }}>Open records</h2>
        </div>
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {openRecords.length === 0 ? (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}><ClipboardList size={18} /></div>
              <div style={S.emptyTitle}>No open probation records</div>
              <div style={S.emptyDesc}>Records created automatically for new employees with probation enabled will appear here.</div>
            </div>
          ) : openRecords.map((r) => {
            const showRecommend = canSubmit && (r.status === "active" || r.status === "review_due");
            const showDecide = canDecide && r.status === "recommendation_submitted";
            return (
              <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ ...S.cardInner, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: "1px solid var(--op-border)", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-14)", fontWeight: 600, color: "var(--op-text)" }}>{r.userName}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-12)", color: "var(--op-text-3)", marginTop: "2px" }}>
                      Started {r.startDate} · Review due {r.reviewDate}
                      {r.recommendation && ` · HR recommends: ${r.recommendation}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <StatusPill status={r.status} />
                    {showRecommend && (
                      <button type="button" style={S.btnGhost} onClick={() => (recommendingId === r.id ? setRecommendingId(null) : startRecommend(r.id))}>
                        Recommend
                      </button>
                    )}
                    {showDecide && (
                      <button type="button" style={S.btnGhost} onClick={() => (decidingId === r.id ? setDecidingId(null) : startDecide(r.id))}>
                        Decide
                      </button>
                    )}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {recommendingId === r.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={motionPreset.fadeScale.transition} style={{ overflow: "hidden" }}>
                      <div style={{ ...S.card, padding: "16px 18px", border: "1px solid rgba(245,166,35,0.18)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                          <div>
                            <label style={S.label}>Recommendation</label>
                            <select style={S.select} value={recommendation} onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}>
                              <option value="confirm">Confirm</option>
                              <option value="extend">Extend</option>
                              <option value="terminate">Terminate</option>
                            </select>
                          </div>
                          <div>
                            <label style={S.label}>Reason</label>
                            <input style={S.input} value={recommendReason} onChange={(e) => setRecommendReason(e.target.value)} placeholder="Why?" />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                          <button type="button" style={S.btnPrimary} onClick={() => confirmRecommend(r.id)}>Submit Recommendation</button>
                          <button type="button" style={S.btnGhost} onClick={() => setRecommendingId(null)}>Cancel</button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {decidingId === r.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={motionPreset.fadeScale.transition} style={{ overflow: "hidden" }}>
                      <div style={{ ...S.card, padding: "16px 18px", border: "1px solid rgba(245,166,35,0.18)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                          <div>
                            <label style={S.label}>Decision</label>
                            <select style={S.select} value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
                              <option value="confirmed">Confirm</option>
                              <option value="extended">Extend</option>
                              <option value="terminated">Terminate</option>
                              <option value="cancelled">Cancel</option>
                            </select>
                          </div>
                          {decision === "extended" && (
                            <div>
                              <label style={S.label}>Extension Duration (days)</label>
                              <input type="number" min={1} style={S.input} value={extensionDays} onChange={(e) => setExtensionDays(Number(e.target.value) || 0)} />
                            </div>
                          )}
                          <div>
                            <label style={S.label}>Reason</label>
                            <input style={S.input} value={decideReason} onChange={(e) => setDecideReason(e.target.value)} placeholder="Why?" />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                          <button type="button" style={{ ...S.btnPrimary, display: "inline-flex", alignItems: "center", gap: "5px" }} onClick={() => confirmDecide(r.id)}>
                            <CheckCircle2 size={13} /> Confirm Decision
                          </button>
                          <button type="button" style={S.btnGhost} onClick={() => setDecidingId(null)}>
                            <XCircle size={13} /> Cancel
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                    {r.startDate} → {r.endDate}
                    {r.finalDecisionReason && ` · ${r.finalDecisionReason}`}
                    {r.decidedByName && ` · Decided by ${r.decidedByName}`}
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
