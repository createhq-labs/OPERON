-- Operon — Supabase Schema
-- Apply this file first, then run supabase-migrations/001_service_account_drive_refactor.sql
-- All tables use UUID primary keys with legacy TEXT identifiers for frontend compatibility.

create extension if not exists "pgcrypto";

-- ============================================================
-- CORE DOMAIN
-- ============================================================

create table roles (
  id            uuid        primary key default gen_random_uuid(),
  legacy_id     text        not null unique,
  name          text        not null,
  description   text,
  user_type     text        not null,
  "group"       text,
  created_by_id text,
  permissions   jsonb       not null default '{}'::jsonb,
  permission_ids text[]     not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table departments (
  id          uuid        primary key default gen_random_uuid(),
  legacy_id   text        not null unique,
  name        text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table teams (
  id                   uuid        primary key default gen_random_uuid(),
  legacy_id            text        not null unique,
  name                 text        not null,
  department_legacy_id text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table users (
  id                   uuid        primary key default gen_random_uuid(),
  legacy_id            text        not null unique,
  auth_user_id         uuid        unique,
  name                 text        not null,
  email                text        not null unique,
  avatar               text,
  user_type            text        not null,
  role_legacy_id       text        not null,
  department_legacy_id text,
  team_legacy_id       text,
  supervisor_legacy_id text,
  permission_ids       text[]      not null default '{}',
  created_by_id        text,
  status               text        not null default 'active',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint chk_user_status check (status in ('active', 'invited', 'disabled'))
);

-- ============================================================
-- DOCUMENTS
-- ============================================================

create table documents (
  id                  uuid        primary key default gen_random_uuid(),
  legacy_id           text        not null unique,
  title               text        not null,
  description         text        not null default '',
  department_legacy_id text,
  tag                 text        not null default '',
  allowed_role_ids    text[]      not null default '{}',
  allowed_user_types  text[]      not null default '{}',
  allowed_team_ids    text[]      default null,
  assigned_user_ids   text[]      default null,
  allowed_departments text[]      default null,
  read_time           text,
  author_legacy_id    text,
  author              text,
  created_by_id       text,
  updated_by_id       text,
  version             text,
  pinned              boolean     not null default false,
  source              text,
  source_provider     text,
  raw_source_url      text,
  mime_type           text,
  storage_bucket      text,
  storage_path        text,
  storage_size        bigint,
  preview_url         text,
  uploaded_by         text,
  extracted_text      text,
  parsed_blocks       jsonb,
  parser_status       text,
  parser_version      text,
  lifecycle_state     text,
  visibility_scope    text        not null default 'global',
  toc                 jsonb,
  blocks              jsonb,
  -- Drive sync columns (added by migration 001)
  -- google_drive_file_id, google_drive_web_link, drive_sync_status, etc.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint chk_visibility_scope check (visibility_scope in ('global', 'department', 'private'))
);

create table document_blocks (
  id                   uuid        primary key default gen_random_uuid(),
  legacy_id            text        not null unique,
  document_legacy_id   text        not null,
  block_index          integer     not null,
  block_type           text        not null,
  block_data           jsonb       not null,
  created_at           timestamptz not null default now()
);

-- ============================================================
-- UPLOADS
-- ============================================================

create table uploads (
  id            uuid        primary key default gen_random_uuid(),
  legacy_id     text        not null unique,
  file_name     text        not null,
  storage_bucket text,
  storage_path  text        not null,
  file_url      text        not null,
  preview_url   text,
  mime_type     text,
  uploaded_by   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- RESOURCES
-- ============================================================

create table resources (
  id                 uuid        primary key default gen_random_uuid(),
  legacy_id          text        not null unique,
  title              text        not null,
  description        text        not null,
  category           text        not null,
  href               text        not null,
  external           boolean     not null default false,
  icon               text        not null,
  allowed_role_ids   text[]      not null default '{}',
  allowed_user_types text[]      not null default '{}',
  allowed_departments text[]     default null,
  allowed_team_ids   text[]      default null,
  visibility_scope   text        not null,
  created_by_id      text,
  pinned             boolean     not null default false,
  updated_at         timestamptz not null default now(),

  constraint chk_resource_visibility check (visibility_scope in ('global', 'department', 'private'))
);

-- ============================================================
-- VIDEOS
-- ============================================================

create table videos (
  id                   uuid        primary key default gen_random_uuid(),
  legacy_id            text        not null unique,
  title                text        not null,
  description          text        not null,
  provider             text        not null,
  embed_url            text        not null,
  thumbnail            text,
  timestamps           jsonb,
  transcript           text,
  related_resource_ids text[]      default null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint chk_video_provider check (provider in ('loom', 'vimeo', 'youtube', 'google_drive'))
);

-- ============================================================
-- QUICK ACTIONS
-- ============================================================

create table quick_actions (
  id            uuid        primary key default gen_random_uuid(),
  legacy_id     text        not null unique,
  label         text        not null,
  description   text        not null,
  category      text,
  visible       boolean     not null default true,
  created_by_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- INGESTION PIPELINE
-- ============================================================

create table ingestion_jobs (
  id            uuid        primary key default gen_random_uuid(),
  legacy_id     text        not null unique,
  upload_id     text,
  document_id   text        not null,
  source_type   text        not null,
  parser_type   text        not null,
  source_url    text,
  file_name     text,
  mime_type     text,
  metadata      jsonb,
  raw_payload   jsonb,
  checksum      text,
  status        text        not null default 'uploaded',
  retry_count   integer     not null default 0,
  progress      numeric,
  stage_history jsonb,
  last_error    text,
  started_at    timestamptz,
  completed_at  timestamptz,
  next_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint chk_ingestion_status check (status in ('uploaded', 'processing', 'completed', 'failed', 'retrying'))
);

create table ingestion_results (
  id                   uuid        primary key default gen_random_uuid(),
  legacy_id            text        not null unique,
  job_id               text        not null,
  document_id          text        not null,
  status               text        not null default 'completed',
  parser_confidence    numeric,
  warnings             text[]      not null default '{}',
  metadata             jsonb,
  semantic_chunk_count integer,
  indexed_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table ingestion_failures (
  id             uuid        primary key default gen_random_uuid(),
  legacy_id      text        not null unique,
  job_id         text        not null,
  document_id    text        not null,
  status         text        not null default 'failed',
  failure_reason text,
  attempt        integer     not null default 1,
  raw_error      text,
  failure_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- ACTIVITY
-- ============================================================

create table activity_logs (
  id               uuid        primary key default gen_random_uuid(),
  legacy_id        text        not null unique,
  user_legacy_id   text,
  action           text        not null,
  target_type      text,
  target_legacy_id text,
  metadata         jsonb,
  timestamp        timestamptz not null default now()
);

-- ============================================================
-- DRIVE (service account model)
-- drive_documents stores metadata for files owned by the company service account.
-- drive_accounts and drive_webhooks are the deprecated per-user OAuth tables.
-- They remain here for schema completeness but should be renamed to *_deprecated
-- once migration 001 is fully deployed and verified.
-- ============================================================

create table drive_documents (
  id                      uuid        primary key default gen_random_uuid(),
  legacy_id               text        not null unique,
  title                   text        not null,
  description             text        not null default '',
  department_legacy_id    text,
  tag                     text        not null default '',
  allowed_role_ids        text[]      not null default '{}',
  allowed_user_types      text[]      not null default '{}',
  allowed_team_ids        text[]      default null,
  assigned_user_ids       text[]      default null,
  allowed_departments     text[]      default null,
  read_time               text,
  author_legacy_id        text,
  author                  text,
  created_by_id           text,
  updated_by_id           text,
  version                 text,
  pinned                  boolean     not null default false,
  source                  text,
  source_provider         text,
  raw_source_url          text,
  mime_type               text,
  file_mime_type          text,
  lifecycle_state         text,
  visibility_scope        text        not null default 'global',
  google_file_id          text,
  google_doc_id           text,
  drive_url               text,
  web_view_link           text,
  folder_id               text,
  folder_name             text,
  linked_document_legacy_id text,
  uploaded_by             text,
  owner_email             text,
  permission_summary      jsonb,
  sync_status             text,
  last_synced_at          timestamptz,
  last_drive_modified_at  timestamptz,
  extracted_text          text,
  parsed_blocks           jsonb,
  parser_status           text,
  parser_version          text,
  toc                     jsonb,
  blocks                  jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint chk_drive_doc_visibility check (visibility_scope in ('global', 'department', 'private'))
);

-- Deprecated: per-user OAuth tables. Rename to *_deprecated after migration 001.
create table drive_accounts (
  id                      uuid        primary key default gen_random_uuid(),
  legacy_id               text        not null unique,
  user_legacy_id          text        not null,
  google_account_id       text        not null,
  email                   text        not null,
  display_name            text,
  access_token_encrypted  text        not null,
  refresh_token_encrypted text,
  scopes                  text[]      not null default '{}',
  expires_at              timestamptz,
  active                  boolean     not null default true,
  last_refreshed_at       timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table drive_webhooks (
  id                       uuid        primary key default gen_random_uuid(),
  legacy_id                text        not null unique,
  drive_account_legacy_id  text        not null,
  drive_file_id            text        not null,
  channel_id               text        not null,
  resource_id              text        not null,
  resource_uri             text        not null,
  expiration               timestamptz,
  active                   boolean     not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_users_auth_user_id         on users (auth_user_id);
create index if not exists idx_users_role_legacy_id        on users (role_legacy_id);
create index if not exists idx_users_department_legacy_id  on users (department_legacy_id);

create index if not exists idx_documents_department        on documents (department_legacy_id);
create index if not exists idx_documents_author            on documents (author_legacy_id);
create index if not exists idx_documents_visibility        on documents (visibility_scope);
create index if not exists idx_documents_storage_bucket    on documents (storage_bucket);
create index if not exists idx_documents_storage_path      on documents (storage_path);
create index if not exists idx_documents_allowed_roles     on documents using gin (allowed_role_ids);
create index if not exists idx_documents_allowed_teams     on documents using gin (allowed_team_ids);
create index if not exists idx_documents_assigned_users    on documents using gin (assigned_user_ids);

create index if not exists idx_uploads_uploaded_by         on uploads (uploaded_by);
create index if not exists idx_uploads_storage_bucket      on uploads (storage_bucket);
create index if not exists idx_uploads_storage_path        on uploads (storage_path);

create index if not exists idx_resources_allowed_roles     on resources using gin (allowed_role_ids);
create index if not exists idx_resources_allowed_depts     on resources using gin (allowed_departments);
create index if not exists idx_resources_allowed_teams     on resources using gin (allowed_team_ids);

create index if not exists idx_drive_docs_google_file_id   on drive_documents (google_file_id);
create index if not exists idx_drive_docs_folder_id        on drive_documents (folder_id);
create index if not exists idx_drive_docs_department       on drive_documents (department_legacy_id);
create index if not exists idx_drive_docs_allowed_roles    on drive_documents using gin (allowed_role_ids);
create index if not exists idx_drive_docs_allowed_teams    on drive_documents using gin (allowed_team_ids);
create index if not exists idx_drive_docs_assigned_users   on drive_documents using gin (assigned_user_ids);

create index if not exists idx_drive_accounts_user         on drive_accounts (user_legacy_id);
create index if not exists idx_drive_webhooks_file         on drive_webhooks (drive_file_id);

create index if not exists idx_ingestion_jobs_document     on ingestion_jobs (document_id);
create index if not exists idx_ingestion_results_job       on ingestion_results (job_id);
create index if not exists idx_ingestion_results_document  on ingestion_results (document_id);
create index if not exists idx_ingestion_failures_job      on ingestion_failures (job_id);
create index if not exists idx_ingestion_failures_document on ingestion_failures (document_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- Use the dedicated policy files in supabase/policies/ for the
-- complete, authoritative policy set. The policies below are the
-- base schema policies; the policy files extend and override them.
-- ============================================================

-- roles: admins and cofounders only
alter table roles enable row level security;
create policy "cofounder admin select roles" on roles
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_admin', 'role_cofounder')
    )
  );

-- departments: any authenticated user may read
alter table departments enable row level security;
create policy "authenticated select departments" on departments
  for select using (auth.uid() is not null);

-- teams: any authenticated user may read
alter table teams enable row level security;
create policy "authenticated select teams" on teams
  for select using (auth.uid() is not null);

-- users: see supabase/policies/users.sql
alter table users enable row level security;

-- documents: see supabase/policies/documents.sql
alter table documents enable row level security;

-- uploads: see supabase/policies/uploads.sql
alter table uploads enable row level security;

-- resources: see supabase/policies/resources.sql
alter table resources enable row level security;

-- activity_logs: see supabase/policies/activity.sql
alter table activity_logs enable row level security;

-- drive_documents: see supabase/policies/drive_documents.sql
alter table drive_documents enable row level security;

-- drive_accounts: see supabase/policies/drive_accounts.sql (deprecated)
alter table drive_accounts enable row level security;

-- videos: any authenticated user may read
alter table videos enable row level security;
create policy "authenticated select videos" on videos
  for select using (auth.uid() is not null);

-- quick_actions: any authenticated user may read visible ones
alter table quick_actions enable row level security;
create policy "authenticated select quick actions" on quick_actions
  for select using (auth.uid() is not null and visible = true);

-- ingestion tables: admins and cofounders only
alter table ingestion_jobs     enable row level security;
alter table ingestion_results  enable row level security;
alter table ingestion_failures enable row level security;

create policy "admin select ingestion jobs" on ingestion_jobs
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_admin', 'role_cofounder')
    )
  );

create policy "admin select ingestion results" on ingestion_results
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_admin', 'role_cofounder')
    )
  );

create policy "admin select ingestion failures" on ingestion_failures
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id in ('role_admin', 'role_cofounder')
    )
  );