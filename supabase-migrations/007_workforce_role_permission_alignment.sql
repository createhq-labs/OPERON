-- Align role permission JSON and flattened permission IDs with the current
-- Workforce permission model used by the app.

with role_updates(legacy_id, features, permission_ids) as (
  values
  ('role_cofounder',
    '{"viewActivity":true,"viewResources":true,"manageResources":true,"sendToAll":true,"viewHr":true,"viewOnboarding":true,"viewCreatorOps":true,"viewBrand":true,"viewOperations":true,"approveLeaveTl":true,"approveLeaveHr":true,"manageHrCalendar":true,"viewHrRecordsAll":true,"submitProbationReview":true,"decideProbationReview":true,"acknowledgeDeboarding":true,"approveDeboardingEmployeeTrack":true,"flagDeboardingAny":true,"viewTeamLeaveHistory":true,"managePeople":true,"manageOnboarding":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','delete_documents','manage_team_documents','manage_users','manage_roles','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_hr','view_onboarding','view_creator_ops','view_brand','view_operations','approve_leave_tl','approve_leave_hr','manage_hr_calendar','view_hr_records_all','submit_probation_review','decide_probation_review','acknowledge_deboarding','approve_deboarding_employee_track','flag_deboarding_any','view_team_leave_history','manage_people','manage_onboarding']),
  ('role_hr',
    '{"viewActivity":true,"viewHr":true,"viewOnboarding":true,"viewResources":true,"manageResources":true,"sendToAll":true,"approveLeaveTl":true,"approveLeaveHr":true,"manageHrCalendar":true,"viewHrRecordsAll":true,"submitProbationReview":true,"acknowledgeDeboarding":true,"flagDeboardingAny":true,"managePeople":true,"manageOnboarding":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','manage_team_documents','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_hr','view_onboarding','approve_leave_tl','approve_leave_hr','manage_hr_calendar','view_hr_records_all','submit_probation_review','acknowledge_deboarding','flag_deboarding_any','manage_people','manage_onboarding']),
  ('role_hr_executive',
    '{"viewHr":true,"viewOnboarding":true,"viewResources":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_hr','view_onboarding']),
  ('role_finance',
    '{"viewActivity":true,"viewOperations":true,"viewResources":true,"manageResources":true,"sendToAll":true,"approveLeaveTl":true,"viewTeamLeaveHistory":true,"managePeople":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','manage_team_documents','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_operations','approve_leave_tl','view_team_leave_history','manage_people']),
  ('role_finance_associate',
    '{"viewOperations":true,"viewResources":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_operations']),
  ('role_senior_tm',
    '{"viewActivity":true,"viewResources":true,"manageResources":true,"viewBrand":true,"viewOperations":true,"viewCreatorOps":true,"sendToAll":true,"approveLeaveTl":true,"viewTeamLeaveHistory":true,"managePeople":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','delete_documents','manage_team_documents','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_brand','view_operations','view_creator_ops','approve_leave_tl','view_team_leave_history','manage_people']),
  ('role_tm_team_lead',
    '{"viewActivity":true,"viewResources":true,"manageResources":true,"viewBrand":true,"viewOperations":true,"viewCreatorOps":false,"sendToAll":true,"approveLeaveTl":true,"viewTeamLeaveHistory":true,"managePeople":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','delete_documents','manage_team_documents','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_brand','view_operations','approve_leave_tl','view_team_leave_history','manage_people']),
  ('role_category_lead',
    '{"viewActivity":true,"viewResources":true,"manageResources":true,"viewBrand":true,"viewOperations":true,"viewCreatorOps":true,"sendToAll":true,"approveLeaveTl":true,"viewTeamLeaveHistory":true,"managePeople":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','delete_documents','manage_team_documents','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_brand','view_operations','view_creator_ops','approve_leave_tl','view_team_leave_history','manage_people']),
  ('role_creator_acquisition',
    '{"viewResources":true,"viewBrand":true,"viewCreatorOps":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_brand','view_creator_ops']),
  ('role_tm_associate',
    '{"viewResources":true,"viewBrand":true,"viewCreatorOps":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_brand','view_creator_ops']),
  ('role_im_team_lead',
    '{"viewActivity":true,"viewResources":true,"manageResources":true,"viewCreatorOps":true,"viewOperations":true,"viewBrand":false,"sendToAll":true,"approveLeaveTl":true,"viewTeamLeaveHistory":true,"managePeople":true}'::jsonb,
    array['view_library','view_documents','add_documents','edit_documents','delete_documents','manage_team_documents','manage_uploads','send_to_all','view_activity','view_resources','manage_resources','view_creator_ops','view_operations','approve_leave_tl','view_team_leave_history','manage_people']),
  ('role_im_executive',
    '{"viewResources":true,"viewCreatorOps":true,"viewOperations":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_creator_ops','view_operations']),
  ('role_im_associate',
    '{"viewResources":true,"viewCreatorOps":true,"viewOperations":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_creator_ops','view_operations']),
  ('role_sales_executive',
    '{"viewOperations":true,"viewResources":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_operations']),
  ('role_creator',
    '{"viewCreatorOps":true,"viewResources":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_creator_ops']),
  ('role_intern',
    '{"viewOnboarding":true,"viewResources":true}'::jsonb,
    array['view_library','view_documents','view_resources','view_onboarding'])
)
update roles
set
  permissions = jsonb_set(coalesce(roles.permissions, '{}'::jsonb), '{features}', role_updates.features, true),
  permission_ids = role_updates.permission_ids,
  updated_at = now()
from role_updates
where roles.legacy_id = role_updates.legacy_id;
