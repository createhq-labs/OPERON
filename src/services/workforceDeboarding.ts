import { supabase } from "@/lib/supabase";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface WorkforceDeboardingChecklistItem {
  id: string;
  itemKey: string;
  label: string;
  isRequired: boolean;
  isCompleted: boolean;
  note: string | null;
}

export interface WorkforceDeboardingRecord {
  id: string;
  userId: string;
  userName: string;
  deboardingType: "employee" | "creator";
  sourceType: string;
  status: string;
  reason: string;
  initiatedByName: string;
  initiatedAt: string;
  approvedByName?: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  completedByName?: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  checklist: WorkforceDeboardingChecklistItem[];
}

async function getJson(url: string) {
  const headers = await authHeaders();
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Request failed.");
  }
  return payload;
}

async function postJson(url: string, body: Record<string, unknown>) {
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Request failed.");
  }
  return payload;
}

async function patchJson(id: string, body: Record<string, unknown>) {
  const headers = await authHeaders();
  const response = await fetch(`/api/workforce/deboarding/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Request failed.");
  }
}

/** Lists real workforce.hr_deboarding records (both employee and creator tracks) visible to the caller. */
export async function listWorkforceDeboardingRecords(): Promise<WorkforceDeboardingRecord[]> {
  const payload = await getJson("/api/workforce/deboarding");
  return (payload.records as WorkforceDeboardingRecord[]) ?? [];
}

/** Initiates deboarding for a person — server infers employee vs. creator track from their real role. */
export async function initiateWorkforceDeboarding(userId: string, reason: string): Promise<void> {
  await postJson("/api/workforce/deboarding", { userId, reason });
}

/** Creator-track only: Content Lead/Co-Founder approves or rejects a pending request. */
export async function decideCreatorDeboarding(id: string, decision: "approved" | "rejected", reason?: string): Promise<void> {
  await patchJson(id, { action: "decide", decision, reason });
}

export async function startDeboardingChecklist(id: string): Promise<void> {
  await patchJson(id, { action: "start_checklist" });
}

export async function setDeboardingChecklistItem(id: string, itemId: string, isCompleted: boolean, note?: string): Promise<void> {
  await patchJson(id, { action: "set_checklist_item", itemId, isCompleted, note });
}

export async function completeWorkforceDeboarding(id: string): Promise<void> {
  await patchJson(id, { action: "complete" });
}

export async function cancelWorkforceDeboarding(id: string, reason: string): Promise<void> {
  await patchJson(id, { action: "cancel", reason });
}
