import { supabase } from "@/lib/supabase";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface WorkforceLeaveRequest {
  id: string;
  userId: string;
  userName: string;
  requestType: "leave" | "wfh";
  dateFrom: string;
  dateTo: string;
  reason: string;
  status: string;
  currentApproverUserId?: string;
  currentApproverName?: string;
  createdAt: string;
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

/** Lists real workforce.hr_leave_requests visible to the caller (own + direct reports, or everyone for HR tier). */
export async function listWorkforceLeaveRequests(): Promise<WorkforceLeaveRequest[]> {
  const payload = await getJson("/api/workforce/leave");
  return (payload.requests as WorkforceLeaveRequest[]) ?? [];
}

/** Submits a Leave/WFH request — routing (manager / HR Manager / Co-Founder) is resolved server-side, same as workforce.submit_leave_request(). */
export async function submitWorkforceLeaveRequest(requestType: "leave" | "wfh", dateFrom: string, dateTo: string, reason: string): Promise<{ id: string; status: string }> {
  const headers = await authHeaders();
  const response = await fetch("/api/workforce/leave", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ requestType, dateFrom, dateTo, reason }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to submit request.");
  }
  return { id: payload.id, status: payload.status };
}

async function patchLeave(id: string, body: Record<string, unknown>): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(`/api/workforce/leave/${id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Request failed.");
  }
}

export async function managerDecideLeaveRequest(id: string, decision: "approved" | "rejected", reason?: string): Promise<void> {
  await patchLeave(id, { action: "manager_decide", decision, reason });
}

export async function hrDecideLeaveRequest(id: string, decision: "approved" | "rejected", reason?: string): Promise<void> {
  await patchLeave(id, { action: "hr_decide", decision, reason });
}

export async function cancelWorkforceLeaveRequest(id: string): Promise<void> {
  await patchLeave(id, { action: "cancel" });
}
