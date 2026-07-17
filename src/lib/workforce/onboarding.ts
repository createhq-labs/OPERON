import { workforceRpc } from "./client";
import type { UUID } from "./types";
export const updateJoiningDate = (userId: UUID, joinedAt: string, reason: string) => workforceRpc("update_joining_date", { p_user_id: userId, p_joined_at: joinedAt, p_reason: reason });
export const createOnboarding = (userId: UUID, joinedAt: string, managerId: UUID | null, probationRequired: boolean, probationDays: number | null) => workforceRpc("create_hr_onboarding", { p_user_id: userId, p_joined_at: joinedAt, p_manager_user_id: managerId, p_probation_required: probationRequired, p_probation_duration_days: probationDays });
export const startOnboarding = (id: UUID) => workforceRpc("start_hr_onboarding", { p_onboarding_id: id });
export const completeOnboarding = (id: UUID) => workforceRpc("complete_hr_onboarding", { p_onboarding_id: id });
export const cancelOnboarding = (id: UUID, reason: string) => workforceRpc("cancel_hr_onboarding", { p_onboarding_id: id, p_reason: reason });
