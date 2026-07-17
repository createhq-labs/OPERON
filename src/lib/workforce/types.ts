export type UUID = string;
export type VisibilityScope = "global" | "team" | "role" | "private";
export type RenderStatus = "pending" | "processing" | "ready_for_review" | "published" | "failed";
export type AttendanceStatus = "present" | "wfh" | "leave" | "unmarked";
export type LeaveType = "leave" | "wfh";
export type LeaveStatus = "draft" | "pending_manager" | "manager_approved" | "pending_hr" | "approved" | "rejected" | "cancelled";
export type OnboardingStatus = "draft" | "in_progress" | "completed" | "cancelled";
export type ProbationStatus = "active" | "review_due" | "recommendation_submitted" | "extended" | "confirmed" | "terminated" | "cancelled";

export interface GlobalUser {
  id: UUID; employee_code: string | null; full_name: string; email: string;
  phone: string | null; department_id: UUID | null; designation_id: UUID | null;
  role_id: UUID; manager_user_id: UUID | null; status: string; joined_at: string | null;
  role?: { id?: UUID; name: string } | Array<{ id?: UUID; name: string }>;
  department?: { id: UUID; name: string } | null;
  designation?: { id: UUID; name: string } | null;
}

export interface AccessibleDocument {
  document_id: UUID; title: string; description: string | null; category_id: UUID | null;
  visibility_scope: VisibilityScope; current_version: number; requires_acknowledgement: boolean;
  file_name: string | null; mime_type: string | null; updated_at: string; is_active?: boolean;
}

export interface AccessibleResource {
  resource_id: UUID; title: string; description: string | null; category_id: UUID | null;
  url: string; visibility_scope: VisibilityScope; created_at: string; updated_at: string;
}

export interface WorkforceNotification {
  notification_id: UUID; notification_type: string; title: string; message: string;
  target_path: string | null; created_at: string; read_at: string | null;
}

export interface SearchResult {
  content_type: "document" | "resource"; content_id: UUID; title: string;
  description: string | null; category_id: UUID | null; file_name: string | null;
  url: string | null; published_at: string | null; relevance: number;
}
