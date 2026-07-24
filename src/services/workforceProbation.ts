import { supabase } from "@/lib/supabase";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface WorkforceProbationRecord {
  id: string;
  userId: string;
  userName: string;
  onboardingId: string | null;
  previousProbationId: string | null;
  startDate: string;
  endDate: string;
  reviewDate: string;
  durationDays: number;
  extensionDurationDays: number | null;
  extensionReason: string | null;
  status: string;
  recommendation: string | null;
  recommendationReason: string | null;
  recommendedByName?: string;
  recommendedAt: string | null;
  finalDecision: string | null;
  finalDecisionReason: string | null;
  decidedByName?: string;
  decidedAt: string | null;
}

/** Lists real workforce.hr_probation records visible to the caller. */
export async function listWorkforceProbationRecords(): Promise<WorkforceProbationRecord[]> {
  const headers = await authHeaders();
  const response = await fetch("/api/workforce/probation", { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to load probation records.");
  }
  return (payload.records as WorkforceProbationRecord[]) ?? [];
}

async function patchProbation(id: string, body: Record<string, unknown>): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(`/api/workforce/probation/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Request failed.");
  }
}

/** HR submits confirm/extend/terminate for a Co-Founder to finalize. */
export async function submitProbationRecommendation(
  id: string,
  recommendation: "confirm" | "extend" | "terminate",
  reason: string,
): Promise<void> {
  await patchProbation(id, { action: "recommend", recommendation, reason });
}

/** Co-Founder-only final decision. Extending creates a new linked probation record. */
export async function decideProbationRecord(
  id: string,
  decision: "confirmed" | "extended" | "terminated" | "cancelled",
  reason: string,
  extensionDurationDays?: number,
): Promise<void> {
  await patchProbation(id, { action: "decide", decision, reason, extensionDurationDays });
}
