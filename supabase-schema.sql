-- Supabase schema for the current operational document platform
-- This schema uses UUID primary keys while preserving legacy string IDs for frontend compatibility.

create extension if not exists "pgcrypto";

create table roles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  description text,
  user_type text not null,
  group text,
  created_by_id text,
  permissions jsonb not null default '{}'::jsonb,
  permission_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  name text not null,
  department_legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  auth_user_id uuid unique,
  name text not null,
  email text not null unique,
  avatar text,
  user_type text not null,
  role_legacy_id text not null,
  department_legacy_id text,
  team_legacy_id text,
  supervisor_legacy_id text,
  permission_ids text[] not null default '{}',
  created_by_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  title text not null,
  description text not null,
  department_legacy_id text,
  dept text,
  tag text not null,
  allowed_role_ids text[] not null default '{}',
  allowed_user_types text[] not null default '{}',
  assigned_user_ids text[] default null,
  read_time text,
  author_legacy_id text,
  author text,
  created_by_id text,
  updated_at timestamptz not null default now(),
  updated_by_id text,
  version text,
  pinned boolean not null default false,
  source text,
  source_provider text,
  raw_source_url text,
  mime_type text,
  storage_bucket text,
  storage_path text,
  storage_size bigint,
  preview_url text,
  uploaded_by text,
  extracted_text text,
  parsed_blocks jsonb,
  parser_status text,
  parser_version text,
  lifecycle_state text,
  visibility_scope text,
  allowed_departments text[] default null,
  toc jsonb,
  blocks jsonb,
  created_at timestamptz not null default now()
);

create table document_blocks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  document_legacy_id text not null,
  block_index integer not null,
  block_type text not null,
  block_data jsonb not null,
  created_at timestamptz not null default now()
);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  file_name text not null,
  storage_bucket text,
  storage_path text not null,
  file_url text not null,
  preview_url text,
  mime_type text,
  author_legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  title text not null,
  description text not null,
  category text not null,
  href text not null,
  external boolean not null default false,
  icon text not null,
  allowed_role_ids text[] not null default '{}',
  allowed_user_types text[] not null default '{}',
  allowed_departments text[] default null,
  visibility_scope text not null,
  created_by_id text,
  updated_at timestamptz not null default now(),
  pinned boolean not null default false
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  title text not null,
  description text not null,
  provider text not null,
  embed_url text not null,
  thumbnail text,
  timestamps jsonb,
  transcript text,
  related_resource_ids text[] default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quick_actions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  label text not null,
  description text not null,
  category text,
  visible boolean not null default true,
  created_by_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  upload_id text,
  document_id text not null,
  source_type text not null,
  parser_type text not null,
  source_url text,
  file_name text,
  mime_type text,
  metadata jsonb,
  raw_payload jsonb,
  checksum text,
  status text not null default 'uploaded',
  retry_count integer not null default 0,
  progress numeric,
  stage_history jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingestion_results (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  job_id text not null,
  document_id text not null,
  status text not null default 'completed',
  parser_confidence numeric,
  warnings text[] not null default '{}',
  metadata jsonb,
  semantic_chunk_count integer,
  indexed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ingestion_failures (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  job_id text not null,
  document_id text not null,
  status text not null default 'failed',
  failure_reason text,
  attempt integer not null default 1,
  raw_error text,
  failure_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ingestion_jobs_document_id on ingestion_jobs (document_id);
create index if not exists idx_ingestion_results_job_id on ingestion_results (job_id);
create index if not exists idx_ingestion_results_document_id on ingestion_results (document_id);
create index if not exists idx_ingestion_failures_job_id on ingestion_failures (job_id);
create index if not exists idx_ingestion_failures_document_id on ingestion_failures (document_id);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  user_legacy_id text,
  action text not null,
  target_type text,
  target_legacy_id text,
  metadata jsonb,
  timestamp timestamptz not null default now()
);

create table drive_documents (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  title text not null,
  description text not null,
  department_legacy_id text,
  dept text,
  tag text not null,
  allowed_role_ids text[] not null default '{}',
  allowed_user_types text[] not null default '{}',
  assigned_user_ids text[] default null,
  read_time text,
  author_legacy_id text,
  author text,
  created_by_id text,
  updated_at timestamptz not null default now(),
  updated_by_id text,
  version text,
  pinned boolean not null default false,
  source text,
  source_provider text,
  raw_source_url text,
  mime_type text,
  lifecycle_state text,
  visibility_scope text,
  allowed_departments text[] default null,
  google_file_id text,
  google_doc_id text,
  drive_url text,
  folder_id text,
  folder_name text,
  linked_document_legacy_id text,
  uploaded_by text,
  allowed_department_ids text[] default null,
  web_view_link text,
  file_mime_type text,
  owner_email text,
  permission_summary jsonb,
  sync_status text,
  last_synced_at timestamptz,
  last_drive_modified_at timestamptz,
  extracted_text text,
  parsed_blocks jsonb,
  parser_status text,
  parser_version text,
  toc jsonb,
  blocks jsonb,
  created_at timestamptz not null default now()
);

create table drive_accounts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  user_legacy_id text not null,
  google_account_id text not null,
  email text not null,
  display_name text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  active boolean not null default true,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table drive_webhooks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  drive_account_legacy_id text not null,
  drive_file_id text not null,
  channel_id text not null,
  resource_id text not null,
  resource_uri text not null,
  expiration timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drive_documents_google_file_id on drive_documents (google_file_id);
create index if not exists idx_drive_documents_folder_id on drive_documents (folder_id);
create index if not exists idx_drive_documents_allowed_department_ids on drive_documents using gin (allowed_department_ids);
create index if not exists idx_drive_accounts_user_legacy_id on drive_accounts (user_legacy_id);
create index if not exists idx_drive_webhooks_drive_file_id on drive_webhooks (drive_file_id);
create index if not exists idx_uploads_storage_bucket on uploads (storage_bucket);
create index if not exists idx_uploads_storage_path on uploads (storage_path);
create index if not exists idx_documents_storage_bucket on documents (storage_bucket);
create index if not exists idx_documents_storage_path on documents (storage_path);

-- Row-level security policy examples for server-side enforcement.
alter table documents enable row level security;
create policy "Allow authenticated document selects" on documents
  for select using (
    auth.uid() is not null
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and (
          documents.visibility_scope = 'global'
          or documents.allowed_user_types && array[u.user_type]
          or documents.allowed_role_ids && array[u.role_legacy_id]
          or documents.assigned_user_ids && array[u.legacy_id]
          or (documents.visibility_scope = 'department' and u.department_legacy_id = documents.department_legacy_id)
        )
    )
  );

create policy "Allow document management for allowed roles" on documents
  for insert, update, delete using (
    auth.uid() is not null
    and exists (
      select 1 from users u
      where u.auth_user_id = auth.uid()
        and u.role_legacy_id = any(array['role_cofounder','role_admin','role_hr','role_finance','role_im_team_lead','role_tm_team_lead'])
    )
  );

alter table users enable row level security;
create policy "Allow authenticated user reads" on users
  for select using (auth.uid() is not null);

alter table uploads enable row level security;
create policy "Allow uploads for authenticated users" on uploads
  for insert, select using (auth.uid() is not null);
