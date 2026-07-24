import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Mirrors workforce.apply_approved_request_attendance()/sync_attendance_from_request() — skips Sundays/holidays. */
export async function syncApprovedAttendance(
  workforceDb: ReturnType<SupabaseClient["schema"]>,
  requestId: string,
  requesterId: string,
  actorId: string,
  dateFrom: string,
  dateTo: string,
  status: string,
): Promise<void> {
  const { data: holidayRows } = await workforceDb.from("hr_holidays").select("holiday_date").gte("holiday_date", dateFrom).lte("holiday_date", dateTo);
  const holidaySet = new Set((holidayRows ?? []).map((h) => h.holiday_date as string));

  const rows: Array<Record<string, unknown>> = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() !== 0 && !holidaySet.has(iso)) {
      rows.push({
        user_id: requesterId,
        attendance_date: iso,
        status,
        source_type: status === "leave" ? "leave_request" : "wfh_request",
        source_entity_id: requestId,
        note: null,
        created_by: actorId,
        updated_by: actorId,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const row of rows) {
    await workforceDb.from("hr_attendance").upsert(row, { onConflict: "user_id,attendance_date" });
  }
}
