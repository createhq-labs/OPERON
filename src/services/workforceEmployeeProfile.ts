import { supabase } from "@/lib/supabase";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface WorkforceProfileAttendanceDay {
  date: string;
  status: string;
}

export interface WorkforceProfileHoliday {
  id: string;
  date: string;
  name: string;
  description?: string;
}

export interface WorkforceProfileLeaveRequest {
  id: string;
  requestType: "leave" | "wfh";
  dateFrom: string;
  dateTo: string;
  reason: string;
  status: string;
  createdAt: string;
  decidedByName?: string;
  decidedAt?: string;
  rejectionReason?: string;
}

export interface WorkforceProfileProbationRecord {
  id: string;
  startDate: string;
  endDate: string;
  reviewDate: string;
  durationDays: number;
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

export interface WorkforceProfileActivityEntry {
  id: string;
  timestamp: string;
  actorName: string;
  kind: "onboarding" | "probation" | "leave" | "deboarding" | "attendance" | "joining_date";
  label: string;
}

export interface WorkforceEmployeeProfile {
  supervisorName?: string;
  attendance: WorkforceProfileAttendanceDay[];
  holidays: WorkforceProfileHoliday[];
  leaveRequests: WorkforceProfileLeaveRequest[];
  probationRecords: WorkforceProfileProbationRecord[];
  activity: WorkforceProfileActivityEntry[];
}

/**
 * Aggregated real-data profile for one employee: attendance for [from, to],
 * full leave history, the full holiday calendar, every probation cycle, and
 * a merged activity feed from the real status-history/audit tables. Scoped
 * server-side to HR tier, the person themselves, or their direct manager.
 */
export async function getWorkforceEmployeeProfile(userId: string, from: string, to: string): Promise<WorkforceEmployeeProfile> {
  const headers = await authHeaders();
  const response = await fetch(`/api/workforce/employees/${userId}/profile?from=${from}&to=${to}`, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to load this employee's profile.");
  }
  return {
    supervisorName: payload.supervisorName ?? undefined,
    attendance: payload.attendance ?? [],
    holidays: payload.holidays ?? [],
    leaveRequests: payload.leaveRequests ?? [],
    probationRecords: payload.probationRecords ?? [],
    activity: payload.activity ?? [],
  };
}
