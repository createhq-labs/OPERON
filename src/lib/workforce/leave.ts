import { workforceRpc } from "./client";
import type { LeaveType, UUID } from "./types";
export const createLeaveRequest = (type: LeaveType, from: string, to: string, reason: string) => workforceRpc<UUID>("create_leave_request", { p_request_type: type, p_date_from: from, p_date_to: to, p_reason: reason });
export const updateLeaveDraft = (id: UUID, type: LeaveType, from: string, to: string, reason: string) => workforceRpc("update_leave_request_draft", { p_request_id: id, p_request_type: type, p_date_from: from, p_date_to: to, p_reason: reason });
export const submitLeaveRequest = (id: UUID) => workforceRpc("submit_leave_request", { p_request_id: id });
export const managerDecideLeave = (id: UUID, approved: boolean, reason?: string) => workforceRpc("manager_decide_leave_request", { p_request_id: id, p_approved: approved, p_reason: reason ?? null });
export const hrDecideLeave = (id: UUID, approved: boolean, reason?: string) => workforceRpc("hr_decide_leave_request", { p_request_id: id, p_approved: approved, p_reason: reason ?? null });
export const cancelLeaveRequest = (id: UUID, reason: string) => workforceRpc("cancel_leave_request", { p_request_id: id, p_reason: reason });
export const getLeaveRequest = (id: UUID) => workforceRpc<Record<string, unknown>>("get_leave_request", { p_request_id: id });
