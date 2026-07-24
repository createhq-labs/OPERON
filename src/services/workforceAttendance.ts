import { supabase } from "@/lib/supabase";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface WorkforceAttendanceRecord {
  userId: string;
  month: string;
  days: Record<string, string>;
}

export interface WorkforceAttendanceUser {
  id: string;
  name: string;
  email: string;
  departmentId?: string;
  departmentName?: string;
  supervisorId?: string;
  roleName?: string;
}

export interface WorkforceHoliday {
  id: string;
  date: string;
  name: string;
  description?: string;
}

export interface WorkforceAttendanceMonth {
  records: WorkforceAttendanceRecord[];
  users: WorkforceAttendanceUser[];
  holidays: WorkforceHoliday[];
}

/** Real workforce.hr_attendance, aggregated per-day rows into month-shaped records for the existing calendar UI. */
export async function getWorkforceAttendanceMonth(month: string): Promise<WorkforceAttendanceMonth> {
  const headers = await authHeaders();
  const response = await fetch(`/api/workforce/attendance?month=${month}`, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to load attendance.");
  }
  return { records: payload.records ?? [], users: payload.users ?? [], holidays: payload.holidays ?? [] };
}

/** HR/Co-Founder may set any day; anyone else may only mark themselves "present" within the recent-past window. */
export async function setWorkforceAttendanceDay(userId: string, date: string, status: "present" | "wfh" | "leave" | "unmarked", note?: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch("/api/workforce/attendance", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, date, status, note }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to update attendance.");
  }
}

export async function createWorkforceHoliday(date: string, name: string, description?: string): Promise<WorkforceHoliday> {
  const headers = await authHeaders();
  const response = await fetch("/api/workforce/holidays", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ date, name, description }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to add holiday.");
  }
  return payload.holiday as WorkforceHoliday;
}

export async function deleteWorkforceHoliday(id: string): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch(`/api/workforce/holidays?id=${id}`, { method: "DELETE", headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Failed to delete holiday.");
  }
}
