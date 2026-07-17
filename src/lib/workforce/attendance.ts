import { workforceRpc } from "./client";
import type { AttendanceStatus, UUID } from "./types";
export const attendanceByPreset = (userId: UUID, preset: string, from?: string, to?: string) => workforceRpc<Record<string, unknown>[]>("get_attendance_calendar_by_preset", { p_user_id: userId, p_preset: preset, p_date_from: from ?? null, p_date_to: to ?? null });
export const attendanceMatrix = (from: string, to: string, departmentId?: UUID) => workforceRpc<Record<string, unknown>[]>("get_attendance_matrix", { p_date_from: from, p_date_to: to, p_department_id: departmentId ?? null });
export const setAttendance = (userId: UUID, date: string, status: Exclude<AttendanceStatus, "unmarked">, reason: string) => workforceRpc("set_attendance", { p_user_id: userId, p_attendance_date: date, p_status: status, p_reason: reason });
export const createHoliday = (date: string, name: string, description?: string) => workforceRpc("create_hr_holiday", { p_holiday_date: date, p_name: name, p_description: description ?? null });
