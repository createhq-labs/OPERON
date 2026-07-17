import { workforceRpc } from "./client";
import type { UUID } from "./types";
export const listProbationDashboard = (status?: string, from?: string, to?: string) => workforceRpc<Record<string, unknown>[]>("list_probation_dashboard", { p_status: status ?? null, p_review_from: from ?? null, p_review_to: to ?? null });
export const addProbationNote = (id: UUID, note: string) => workforceRpc("add_probation_note", { p_probation_id: id, p_note: note });
export const submitProbationRecommendation = (id: UUID, recommendation: string, reason: string, extensionDays?: number) => workforceRpc("submit_probation_recommendation", { p_probation_id: id, p_recommendation: recommendation, p_reason: reason, p_extension_duration_days: extensionDays ?? null });
export const decideProbation = (id: UUID, decision: string, reason: string, extensionDays?: number) => workforceRpc("decide_probation", { p_probation_id: id, p_decision: decision, p_reason: reason, p_extension_duration_days: extensionDays ?? null });
export const cancelProbation = (id: UUID, reason: string) => workforceRpc("cancel_probation", { p_probation_id: id, p_reason: reason });
