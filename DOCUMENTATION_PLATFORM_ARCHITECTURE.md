# Documentation Platform — Database Architecture Specification

A dedicated `documentation` schema that plugs into the Finance Dashboard's existing `public` identity model — reusing `public.users` as the single source of truth for people, and touching nothing else in `public`.

**Scope:** Library and Resources modules, plus the identity, notification, and audit plumbing they need. People/Onboarding, Deboarding, Attendance, Leave/WFH, Probation, and Holidays are **out of scope** — see §10.

No SQL included by design — this is a design document for another developer to implement.

---

## 1. Existing Public Schema Reused

What Documentation depends on and will never write DDL against. Columns marked *(inferred)* are reconstructed from application code in this repo, not a verified `pg_dump` — confirm before implementing (see §10).

### `public.users` — confirmed columns

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key. Every Documentation FK to a person targets this column. |
| `supabase_auth_id` | uuid | Links to `auth.users`. Used by every RLS helper to resolve "who is asking". |
| `email` | text | Unique. |
| `full_name` | text | Display name. |
| `role` | `public.user_role` (enum) | Coarse tier — see below. Not the 16-title list; see §10. |
| `team_name` | text | Free text, not a FK to a `teams` table. Drives `visibility_scope = 'team'`. |

### `public.user_role` — confirmed enum values

`employee` · `team_lead` · `finance` · `admin` · `developer` — five values. This is the only role signal Documentation can trust from `public` without a supporting mapping table.

### Other public tables — reused as-is, never modified

- `public.notifications` — exists; its `type` enum is Finance-workflow-specific (`new_submission`, `pending_master_data_review`, …). Documentation does **not** insert into it — see §3 Module D.
- `public.activity_log` — exists; exact column shape unverified — see §10.
- `public.brands`, `creators`, `deliverables`, `intake_submissions`, `intake_line_items`, `master_data_reviews`, `team_lead_members`, `submission_attachments`, `pi_number_counters` — Finance-only, no Documentation dependency.

> **Not present in public:** There is no `public.roles`, `public.teams`, or `public.departments` table in the Finance Dashboard — team is a free-text column on `users`, and role is a 5-value enum. The 16-title org chart in the brief (Co-Founder, HR Executive, Senior TM, …) has no home in `public` today; Documentation supplies one (§3 Module A) rather than asking Finance to add it.

---

## 2. Documentation Schema Overview

Everything below lives in `CREATE SCHEMA documentation`. Nothing here is a person, a team, or a department — those stay in `public`.

| Group | Tables |
|---|---|
| Identity bridge | `role_catalog`, `user_roles` |
| Library | `document_categories`, `document_tags`, `documents`, `document_versions`, `document_tag_map`, `document_allowed_roles`, `document_assigned_users`, `user_document_reads`, `document_acknowledgements` |
| Resources | `resource_categories`, `resources`, `resource_allowed_roles`, `resource_assigned_users`, `resource_access_logs` |
| Notifications | `notifications`, `notification_recipients`, `notification_reads` |
| Audit | `activity_log` *(conditional — see §3 Module E)* |

Nineteen tables, none of which duplicate `public.users`, roles, teams, or departments. Every table that needs "who" references `public.users(id)`; every table that needs "what title" references `documentation.role_catalog(id)` — never `public.user_role` directly, since that enum is too coarse for the visibility rules in the brief.

---

## 3. Module-by-Module Database Design

People, Onboarding, Deboarding, Attendance, Leave/WFH, Probation, and Holidays are intentionally excluded — equivalent `hr_*` tables already exist for the legacy identity model in this repo's `supabase-schema.sql`, and porting them onto the Finance Dashboard is a separate engagement. Module A below is deliberately designed so those future modules could reference `role_catalog` without rework.

### Module A — Identity & Role Bridge (`documentation`)

**Purpose.** `public.user_role` has five values; the Library/Resources visibility and upload rules in the brief are written against sixteen operational titles (Co-Founder, HR, HR Executive, Finance Manager, …). Rather than asking Finance to widen its enum, Documentation owns a small catalog of those titles and a one-row-per-person mapping back to `public.users`. Every role-aware policy in Library/Resources reads this mapping, never `public.user_role`.

- **Tables required:** `role_catalog`, `user_roles`.
- **Relationships.** `user_roles.user_id` → `public.users.id` (one-to-one: a person has exactly one current title). `user_roles.role_id` → `role_catalog.id` (many-to-one). `role_catalog` has no upstream FK — a closed catalog seeded once.
- **Constraints.** `user_roles.user_id` is unique — a person cannot hold two titles at once. `role_catalog.code` is unique and immutable in practice.
- **Department values (grouping only, not a permission dimension):** `leadership` · `hr` · `finance` · `talent_management` · `influencer_marketing` · `sales` · `creators` · `interns`.
- **Permissions.** Create/Update/Delete on `role_catalog`: Co-Founder only. Read: any authenticated user. Create/Update on `user_roles`: Co-Founder or HR. Read: the row's own user, plus Co-Founder/HR. No Delete — reassign instead, paired with an `activity_log` entry.

> **Open question:** This brief asks for one title per person with no history. If title changes need an audit trail beyond the activity log, `user_roles` should become append-only with an `is_current` flag instead of update-in-place.

### Module B — Documentation Library (`documentation`)

**Purpose.** Upload, version, categorize, tag, and gate visibility on internal documents; track who has opened and who has formally acknowledged each one.

- **Tables required:** `document_categories`, `document_tags`, `documents`, `document_versions`, `document_tag_map`, `document_allowed_roles`, `document_assigned_users`, `user_document_reads`, `document_acknowledgements`.
- **Visibility (`documents.visibility_scope`):** `global` (everyone) · `team` (matches viewer's `public.users.team_name` against `allowed_team_names`) · `role` (viewer's title is in `document_allowed_roles`) · `private` (viewer's id is in `document_assigned_users`).
- **Lifecycle flags:** `is_pinned` (surfaced first, no visibility effect), `is_archived` (hidden from default lists, still readable if linked directly), `deleted_at` (soft delete — null = live).
- **Search.** A generated `tsvector` column over title + description (weighted A/B), GIN-indexed.
- **Drive source metadata.** `source_type` distinguishes `upload` / `google_drive` / `external_link`; `google_drive_file_id` and `google_drive_web_link` populated only when relevant.
- **Mandatory reads & per-version acknowledgement.** `documents.is_mandatory` flags the document as requiring acknowledgement at all; `document_versions.requires_acknowledgement` lets a specific republish re-trigger it; `document_acknowledgements.version_id` records exactly which version was acknowledged.
- **Permissions.** Upload/manage: Co-Founder, HR, Finance Manager, Senior TM, TM Team Lead, Category Lead, IM Team Lead (the seven `role_catalog.can_manage_library = true` titles). Everyone else, including Employees, Interns, and Creators: read only, gated by `visibility_scope`. Read/acknowledge tracking rows: any authenticated user may insert/read their own; a document's manager/Co-Founder may read all rows for that document.

### Module C — Resources (`documentation`)

**Purpose.** A lighter sibling of Library for links/tools rather than versioned files — same visibility model, no version history, plus a private-assignment table the original migration was missing.

- **Tables required:** `resource_categories`, `resources`, `resource_allowed_roles`, `resource_assigned_users`, `resource_access_logs`.
- **Visibility.** Identical four-value scope to documents, reusing the same `role_catalog`/`allowed_team_names`/assigned-users pattern.
- **Usage tracking.** `resource_access_logs` is an append-only event log — a resource can be opened many times by the same person, unlike document reads.
- **Permissions.** Same seven-title manage tier as Library for Create/Update/Delete on `resources`; everyone else read-only per visibility scope; access-log inserts are self-only.

### Module D — Notifications (`documentation`, scoped)

**Purpose.** Cover exactly the Library/Resources events in scope: document published, a new version added, a document assigned as mandatory reading, an acknowledgement requested, a resource published. HR/workforce notification events are out of scope.

- **Tables required:** `notifications`, `notification_recipients`, `notification_reads` — normalized recipient/read rows, no user-id arrays.
- **Recipient fan-out.** A notification carries an `audience_type` (`global`/`team`/`role`/`user`) plus the matching filter column; a `SECURITY DEFINER` function materializes that audience into explicit `notification_recipients` rows at creation time.
- **Permissions.** Insert: the same manage-tier roles that can publish the underlying document/resource, plus the system itself. Read: recipients see only their own notifications. Mark-read: a recipient may only mark their own row.

> **Efficiency note:** `notification_recipients` and `notification_reads` are always 1:1 per (notification, user) in this design. A leaner variant folds them into one table (`notification_recipients.read_at` nullable), saving a join on every unread-count query. Kept as three tables here to match the brief literally.

### Module E — Activity & Audit (`documentation`, conditional)

**Purpose.** Append-only record of who did what to which document/resource/role-assignment, and when.

- **Preferred design: reuse `public.activity_log`.** If it has generic `actor`/`action`/`entity_type`/`entity_id`/`metadata` columns (unverified — §10), Documentation should write to it directly with `entity_type` values like `documentation.document`.
- **Fallback: `documentation.activity_log`.** If Finance's table is shaped specifically for Finance workflows, Documentation owns a narrow, structurally identical table scoped to its own events only.
- **Retention.** No stated limit; recommend indefinite retention with no delete/update grant to any application role.
- **Permissions.** Insert: system-only, via triggers or the functions that perform publish/acknowledge/reassign actions. Read: Co-Founder and HR (org-wide); everyone else may read only rows where they are the actor.

---

## 4. Table Specifications

### `role_catalog` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | Surrogate key. |
| `code` (UQ) | text | Yes | — | Stable slug, e.g. `im_team_lead`. |
| `title` | text | Yes | — | Display label, e.g. "IM Team Lead". |
| `department` | text (check) | Yes | — | Grouping only — see §3 for allowed values. |
| `rank` | smallint | Yes | 0 | Display/seniority ordering within a department. |
| `can_manage_library` | boolean | Yes | false | Grants upload/manage rights on Library + Resources. |
| `is_active` | boolean | Yes | true | Soft-disable a title without breaking history. |
| `created_at` | timestamptz | Yes | `now()` | — |

### `user_roles` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `user_id` (UQ, FK) | uuid → `public.users.id` | Yes | — | One current title per person. ON DELETE CASCADE. |
| `role_id` (FK) | uuid → `role_catalog.id` | Yes | — | ON DELETE RESTRICT. |
| `assigned_by` (FK) | uuid → `public.users.id` | No | — | ON DELETE SET NULL. |
| `assigned_at` | timestamptz | Yes | `now()` | — |
| `notes` | text | No | — | Free-text context. |

### `documents` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `title` | text | Yes | — | — |
| `description` | text | No | — | — |
| `category_id` (FK) | uuid → `document_categories.id` | No | — | ON DELETE SET NULL. |
| `visibility_scope` | text (check) | Yes | 'team' | `global` / `team` / `role` / `private`. |
| `allowed_team_names` | text[] | Yes | `{}` | Matched against `public.users.team_name`. |
| `is_pinned` | boolean | Yes | false | Surface first; no visibility effect. |
| `is_mandatory` | boolean | Yes | false | Requires acknowledgement (whole document). |
| `is_archived` | boolean | Yes | false | Hidden from default lists. |
| `deleted_at` | timestamptz | No | null | Soft delete. |
| `source_type` | text (check) | Yes | 'upload' | `upload` / `google_drive` / `external_link`. |
| `google_drive_file_id` | text | No | — | Set when source_type = google_drive. |
| `google_drive_web_link` | text | No | — | — |
| `current_version_id` (FK) | uuid → `document_versions.id` | No | — | ON DELETE SET NULL; nullable to break create-time circularity. |
| `search_vector` | tsvector, generated | Yes | generated | Weighted title (A) + description (B), GIN-indexed. |
| `created_by` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE RESTRICT. |
| `updated_by` (FK) | uuid → `public.users.id` | No | — | ON DELETE SET NULL. |
| `created_at` / `updated_at` | timestamptz | Yes | `now()` | `updated_at` trigger-maintained. |

### `document_versions` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `document_id` (FK) | uuid → `documents.id` | Yes | — | ON DELETE CASCADE. |
| `version_number` | integer (check > 0) | Yes | — | UNIQUE with document_id. |
| `storage_path` / `file_name` / `file_size_bytes` / `mime_type` | text / text / bigint / text | No | — | Null for Drive-sourced documents. |
| `google_drive_file_id` | text | No | — | Version-specific Drive revision, if tracked. |
| `changelog` | text | No | — | — |
| `requires_acknowledgement` | boolean | Yes | false | Lets this version re-trigger mandatory ack. |
| `created_by` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE RESTRICT. |
| `created_at` | timestamptz | Yes | `now()` | Append-only — no updated_at. |

### `document_categories` · `resource_categories` *(new, same shape ×2)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `name` (UQ) | text | Yes | — | — |
| `slug` (UQ) | text | Yes | — | URL-safe identifier. |
| `sort_order` | smallint | Yes | 0 | — |
| `is_active` | boolean | Yes | true | Soft-retire without breaking FKs. |
| `created_by` (FK) | uuid → `public.users.id` | No | — | ON DELETE SET NULL. |
| `created_at` / `updated_at` | timestamptz | Yes | `now()` | — |

### `document_tags` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `name` (UQ) | text | Yes | — | — |
| `slug` (UQ) | text | No | — | — |
| `created_by` (FK) | uuid → `public.users.id` | No | — | ON DELETE SET NULL. |
| `created_at` | timestamptz | Yes | `now()` | — |

### Join tables *(new)*

| Table | Columns | Primary key |
|---|---|---|
| `document_tag_map` | `document_id` FK→documents.id CASCADE, `tag_id` FK→document_tags.id CASCADE | (document_id, tag_id) |
| `document_allowed_roles` | `document_id` FK→documents.id CASCADE, `role_id` FK→role_catalog.id CASCADE | (document_id, role_id) |
| `document_assigned_users` | `document_id` FK→documents.id CASCADE, `user_id` FK→public.users.id CASCADE | (document_id, user_id) |
| `resource_allowed_roles` | `resource_id` FK→resources.id CASCADE, `role_id` FK→role_catalog.id CASCADE | (resource_id, role_id) |
| `resource_assigned_users` | `resource_id` FK→resources.id CASCADE, `user_id` FK→public.users.id CASCADE | (resource_id, user_id) |

### `user_document_reads` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `document_id` (FK) | uuid → `documents.id` | Yes | — | ON DELETE CASCADE. |
| `version_id` (FK) | uuid → `document_versions.id` | No | — | Which version they opened. ON DELETE SET NULL. |
| `user_id` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE CASCADE. |
| `read_type` | text (check) | Yes | 'viewed' | `viewed` / `downloaded`. |
| `read_at` | timestamptz | Yes | `now()` | Upserted on conflict. |

Unique on `(document_id, user_id, read_type)`.

### `document_acknowledgements` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `document_id` (FK) | uuid → `documents.id` | Yes | — | ON DELETE CASCADE. |
| `version_id` (FK) | uuid → `document_versions.id` | No | — | Null = document-level ack. ON DELETE SET NULL. |
| `user_id` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE CASCADE. |
| `acknowledged_at` | timestamptz | Yes | `now()` | — |
| `note` | text | No | — | — |

Unique on `(document_id, user_id, version_id)` via a null-safe expression index.

### `resources` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `title` / `description` | text / text | Yes / No | — | — |
| `category_id` (FK) | uuid → `resource_categories.id` | No | — | ON DELETE SET NULL. |
| `url` | text | Yes | — | — |
| `external` | boolean | Yes | true | — |
| `visibility_scope` | text (check) | Yes | 'team' | Same four values as documents. |
| `allowed_team_names` | text[] | Yes | `{}` | — |
| `is_pinned` / `is_archived` | boolean | Yes | false | — |
| `deleted_at` | timestamptz | No | null | Soft delete. |
| `search_vector` | tsvector, generated | Yes | generated | Title (A) + description (B). |
| `created_by` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE RESTRICT. |
| `updated_by` (FK) | uuid → `public.users.id` | No | — | ON DELETE SET NULL. |
| `created_at` / `updated_at` | timestamptz | Yes | `now()` | — |

### `resource_access_logs` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `resource_id` (FK) | uuid → `resources.id` | Yes | — | ON DELETE CASCADE. |
| `user_id` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE CASCADE. |
| `accessed_at` | timestamptz | Yes | `now()` | Append-only. |

### `notifications` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `actor_user_id` (FK) | uuid → `public.users.id` | No | — | Who triggered it. ON DELETE SET NULL. |
| `notification_type` | text (check) | Yes | — | document_published / document_version_added / mandatory_document_assigned / document_acknowledgement_requested / resource_published. |
| `title` / `body` | text / text | Yes | — | — |
| `entity_type` | text (check) | Yes | — | document / resource. |
| `entity_id` | uuid | Yes | — | Polymorphic target — no FK; app validates against entity_type. |
| `action_url` | text | No | — | Deep link. |
| `audience_type` | text (check) | Yes | — | global / team / role / user. |
| `audience_team_name` | text | No | — | Set when audience_type = team. |
| `audience_role_id` (FK) | uuid → `role_catalog.id` | No | — | Set when audience_type = role. ON DELETE SET NULL. |
| `created_at` / `expires_at` | timestamptz | Yes / No | `now()` / — | — |

### `notification_recipients` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `notification_id` (FK) | uuid → `notifications.id` | Yes | — | ON DELETE CASCADE. |
| `user_id` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE CASCADE. Materialized by the fan-out function. |
| `created_at` | timestamptz | Yes | `now()` | — |

### `notification_reads` *(new)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `notification_id` (FK) | uuid → `notifications.id` | Yes | — | ON DELETE CASCADE. |
| `user_id` (FK) | uuid → `public.users.id` | Yes | — | ON DELETE CASCADE. |
| `read_at` | timestamptz | Yes | `now()` | PK (notification_id, user_id). |

### `activity_log` *(conditional — see Module E)*

| Column | Type | Req. | Default | Purpose |
|---|---|---|---|---|
| `id` (PK) | uuid | Yes | `gen_random_uuid()` | — |
| `actor_user_id` (FK) | uuid → `public.users.id` | No | — | ON DELETE SET NULL. |
| `action` | text | Yes | — | e.g. document.published, resource.archived. |
| `entity_type` / `entity_id` | text / uuid | Yes | — | — |
| `old_value` / `new_value` | jsonb / jsonb | No | — | — |
| `metadata` | jsonb | No | — | — |
| `created_at` | timestamptz | Yes | `now()` | Append-only. |

---

## 5. Relationships

| From | To | Cardinality | On delete |
|---|---|---|---|
| `user_roles.user_id` | `public.users.id` | 1:1 | CASCADE |
| `user_roles.role_id` | `role_catalog.id` | N:1 | RESTRICT |
| `documents.category_id` | `document_categories.id` | N:1 | SET NULL |
| `documents.current_version_id` | `document_versions.id` | 1:1 | SET NULL |
| `documents.created_by` / `updated_by` | `public.users.id` | N:1 | RESTRICT / SET NULL |
| `document_versions.document_id` | `documents.id` | N:1 | CASCADE |
| `document_versions.created_by` | `public.users.id` | N:1 | RESTRICT |
| `document_tag_map.*` | `documents.id` / `document_tags.id` | M:N join | CASCADE / CASCADE |
| `document_allowed_roles.*` | `documents.id` / `role_catalog.id` | M:N join | CASCADE / CASCADE |
| `document_assigned_users.*` | `documents.id` / `public.users.id` | M:N join | CASCADE / CASCADE |
| `user_document_reads.*` | `documents.id` / `document_versions.id` / `public.users.id` | N:1 each | CASCADE / SET NULL / CASCADE |
| `document_acknowledgements.*` | `documents.id` / `document_versions.id` / `public.users.id` | N:1 each | CASCADE / SET NULL / CASCADE |
| `resources.category_id` | `resource_categories.id` | N:1 | SET NULL |
| `resources.created_by` / `updated_by` | `public.users.id` | N:1 | RESTRICT / SET NULL |
| `resource_allowed_roles.*` | `resources.id` / `role_catalog.id` | M:N join | CASCADE / CASCADE |
| `resource_assigned_users.*` | `resources.id` / `public.users.id` | M:N join | CASCADE / CASCADE |
| `resource_access_logs.*` | `resources.id` / `public.users.id` | N:1 each | CASCADE / CASCADE |
| `notifications.actor_user_id` | `public.users.id` | N:1 | SET NULL |
| `notifications.audience_role_id` | `role_catalog.id` | N:1 | SET NULL |
| `notification_recipients.*` | `notifications.id` / `public.users.id` | N:1 each | CASCADE / CASCADE |
| `notification_reads.*` | `notifications.id` / `public.users.id` | N:1 each | CASCADE / CASCADE |
| `activity_log.actor_user_id` | `public.users.id` | N:1 | SET NULL |

---

## 6. Permission Matrix

Three tiers, derived from `role_catalog`:
- **Leadership** — Co-Founder
- **Manage** — HR, Finance Manager, Senior TM, TM Team Lead, Category Lead, IM Team Lead (`can_manage_library = true`)
- **Standard** — HR Executive, Finance Associate, Creator Acquisition, TM Associate, IM Executive, IM Associate, Sales Executive, Creator, Intern (read-only)

| Table | Leadership | Manage tier | Standard tier |
|---|---|---|---|
| role_catalog | CRUD | Read | Read |
| user_roles | CRUD | Read own; HR: CRUD | Read own |
| document_categories / tags / resource_categories | CRUD | Read; propose new | Read |
| documents / resources | CRUD | Create, Update/Delete own or any if manage-tier | Read (per visibility_scope) |
| document_versions | CRUD | Create on documents they manage | Read (wherever parent document is visible) |
| document_tag_map / allowed_roles / assigned_users | CRUD | Write on documents they manage | Read |
| resource_allowed_roles / assigned_users | CRUD | Write on resources they manage | Read |
| user_document_reads / resource_access_logs | Read all | Read all for owned content | Insert / read own only |
| document_acknowledgements | Read all | Read all for owned content | Insert / read own only |
| notifications | Create any | Create for owned content | — |
| notification_recipients / reads | Read all | Read own | Read own; mark own read |
| activity_log | Read all | Read own actions | Read own actions |

---

## 7. Workflow Diagrams

**Document publish**
```
Manage-tier user uploads file, sets title / category / tags / visibility
  ↓
documents row created — status: live, current_version_id: null
  ↓
document_versions row 1 created
  ↓
documents.current_version_id set to version 1
  ↓
notifications: document_published fanned out to visibility_scope audience
  ↓
activity_log: document.published
```

**New version (with mandatory re-acknowledgement)**
```
Manage-tier user uploads replacement file, flags requires_acknowledgement
  ↓
document_versions row N+1 created; documents.current_version_id updated
  ↓
notifications: document_version_added → all with prior read/ack on this document
  if requires_acknowledgement: notifications: document_acknowledgement_requested
  ↓
activity_log: document.version_added
```

**Mandatory read → acknowledgement**
```
Reader opens document → user_document_reads upserted (read_type = viewed)
  ↓
if documents.is_mandatory or current version.requires_acknowledgement:
  UI blocks "done" until acknowledgement submitted
  ↓
document_acknowledgements row inserted (document_id, version_id, user_id)
  ↓
activity_log: document.acknowledged
```

**Resource publish**
```
Manage-tier user adds URL, category, visibility
  ↓
resources row created
  ↓
notifications: resource_published fanned out to visibility_scope audience
  ↓
activity_log: resource.published
```

**Notification fan-out (shared by all event types above)**
```
Event occurs → notifications row inserted with audience_type + filter
  ↓
  global → every active public.users row
  team   → public.users where team_name = audience_team_name
  role   → user_roles joined to role_id = audience_role_id
  user   → the single named recipient
  ↓
notification_recipients materialized, one row per resolved user
  ↓
recipient opens notification → notification_reads row inserted
```

---

## 8. Notification Matrix

| Event | Trigger condition | Recipients | notification_type |
|---|---|---|---|
| Document published | First version of a new document created | Everyone matching the document's visibility_scope | `document_published` |
| New version added | document_versions insert on an existing document | Everyone with an existing read or acknowledgement on the document | `document_version_added` |
| Mandatory document assigned | documents.is_mandatory set true, or a private assignment added to a mandatory doc | The newly assigned user(s) | `mandatory_document_assigned` |
| Acknowledgement requested | New version created with requires_acknowledgement = true | Everyone in the document's visibility audience | `document_acknowledgement_requested` |
| Resource published | New resources row created | Everyone matching the resource's visibility_scope | `resource_published` |

HR/workforce notification events (leave submitted, probation decided, deboarding steps, …) are out of scope.

---

## 9. Cross-Schema Relationship Map

Every arrow below crosses from `documentation` into `public`. Nothing crosses the other direction — `public` has zero awareness of `documentation`, which is what makes this genuinely plug-and-play.

```
documentation.user_roles.user_id                    ──▶  public.users.id
documentation.user_roles.assigned_by                ──▶  public.users.id
documentation.documents.created_by / updated_by     ──▶  public.users.id
documentation.document_versions.created_by          ──▶  public.users.id
documentation.document_assigned_users.user_id       ──▶  public.users.id
documentation.user_document_reads.user_id           ──▶  public.users.id
documentation.document_acknowledgements.user_id     ──▶  public.users.id
documentation.resources.created_by / updated_by     ──▶  public.users.id
documentation.resource_assigned_users.user_id       ──▶  public.users.id
documentation.resource_access_logs.user_id          ──▶  public.users.id
documentation.notifications.actor_user_id           ──▶  public.users.id
documentation.notification_recipients.user_id       ──▶  public.users.id
documentation.notification_reads.user_id            ──▶  public.users.id
documentation.activity_log.actor_user_id            ──▶  public.users.id

documentation.*.role  (where visibility needs a title)  ──▶  documentation.role_catalog.id
  (never public.user_role — see §3 Module A)
```

---

## 10. Assumptions & Open Questions

**Conflict — role model.** The 16-title list in the brief (Co-Founder … Intern) is not present in `public.user_role` (5 values: employee/team_lead/finance/admin/developer) and does not appear anywhere in the Finance Dashboard's schema as represented in this repo. It is, however, an exact match for `src/core/roles.ts` in the *other*, legacy_id-based schema. This design resolves the conflict with `documentation.role_catalog` + `user_roles` rather than altering Finance's enum. Confirm this is the desired resolution before implementation.

**Open — public.users full column list.** Only `id`, `supabase_auth_id`, `email`, `full_name`, `role`, `team_name` are confirmed (from app code). Whether `created_at`, a `status`/active flag, or a department column exist is unverified. If a real department column exists, `allowed_team_names`/`team_name`-matching in this design may be redundant with it — worth reconciling.

**Open — public.activity_log shape.** Module E's preferred design (reuse directly) depends on this table having generic actor/action/entity/metadata columns. Unverified in this repo. If its shape is Finance-specific, fall back to `documentation.activity_log` as specified.

**Open — public.notifications enum.** Confirmed NOT reusable directly (its `type` enum is Finance-workflow-specific and NOT NULL). Documentation owns its own `notifications` table for this reason. If Finance later widens that enum to include document/resource events, migrating onto it is a follow-up, not a blocker today.

**Assumption — role history.** `user_roles` is designed as one current row per person, overwritten on reassignment, with the change captured in `activity_log`. If point-in-time role history needs to be queryable directly (not just via the log), this becomes an append-only table with an `is_current` flag instead.

**Out of scope by decision.** People/Onboarding, Deboarding (creator + employee), Attendance, Leave/WFH, Probation, and Holidays are excluded from this document. Equivalent `hr_*` tables already exist for the legacy schema in `supabase-schema.sql`; whether those get ported onto the Finance Dashboard's `public.users` or remain on the legacy identity model is a separate decision. `role_catalog` is designed so those future modules could reference it (e.g. a probation reviewer's title) without rework.

**Assumption — search.** Full-text search is implemented as a generated `tsvector` column per table (title + description) rather than a shared cross-entity search index. If a unified search box across both is required, a lightweight `documentation.search_index` view (not a table) over both `tsvector` columns is a straightforward addition.
