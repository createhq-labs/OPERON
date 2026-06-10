-- Migration: Convert Drive from User OAuth to Company Service Account
-- Transforms Drive integration from per-user OAuth to a single company
-- service account that operates invisibly as infrastructure.
--
-- Prerequisites:
--   - documents table exists
--   - users table exists with auth_user_id, role_legacy_id columns
-- Run order: this migration must complete before deploying Drive v2 service code.

-- ============================================================
-- 1. Drive sync columns on documents
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS google_drive_file_id  TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS google_drive_web_link TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_sync_status     TEXT        NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_synced_at       TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_sync_error      TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_last_error_at   TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS drive_version         INTEGER     NOT NULL DEFAULT 1;

-- Constrain drive_sync_status to known values so application bugs surface as
-- DB errors rather than silent bad state.
ALTER TABLE documents
  ADD CONSTRAINT chk_drive_sync_status
  CHECK (drive_sync_status IN ('pending', 'synced', 'failed'));

-- ============================================================
-- 2. Company Drive service account configuration
-- ============================================================
-- Single-row table keyed by config_key. Only Co-Founders may read or write.

CREATE TABLE IF NOT EXISTS drive_service_account_config (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key            TEXT        NOT NULL UNIQUE,
  service_account_email TEXT,
  drive_folder_id       TEXT        NOT NULL,
  configured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_tested_at        TIMESTAMPTZ,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  test_status           TEXT,
  test_error            TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_test_status CHECK (test_status IN ('success', 'failed', 'untested') OR test_status IS NULL)
);

-- ============================================================
-- 3. Drive sync jobs (background upload / version / metadata work)
-- ============================================================

CREATE TABLE IF NOT EXISTS drive_sync_jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type     TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending',
  drive_file_id TEXT,
  error_message TEXT,
  retry_count  INTEGER     NOT NULL DEFAULT 0,
  max_retries  INTEGER     NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_sync_job_type   CHECK (job_type IN ('initial_upload', 'version_update', 'metadata_sync', 'webhook_sync')),
  CONSTRAINT chk_sync_job_status CHECK (status   IN ('pending', 'processing', 'completed', 'failed'))
);

-- ============================================================
-- 4. Drive webhook subscriptions (real-time Drive → Operon sync)
-- ============================================================

CREATE TABLE IF NOT EXISTS drive_webhook_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id           TEXT        NOT NULL UNIQUE,
  channel_id              TEXT        NOT NULL,
  resource_id             TEXT        NOT NULL,
  resource_uri            TEXT        NOT NULL,
  subscription_expiration TIMESTAMPTZ NOT NULL,
  next_renewal_at         TIMESTAMPTZ NOT NULL,
  is_active               BOOLEAN     NOT NULL DEFAULT true,
  renewal_failure_count   INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. Drive sync audit log
-- ============================================================

CREATE TABLE IF NOT EXISTS drive_sync_audit (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        REFERENCES documents(id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  drive_file_id TEXT,
  status       TEXT,
  details      JSONB,
  error_message TEXT,
  triggered_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_audit_action      CHECK (action      IN ('upload', 'replace', 'delete', 'webhook_received', 'sync_triggered')),
  CONSTRAINT chk_audit_status      CHECK (status      IN ('success', 'failed') OR status IS NULL),
  CONSTRAINT chk_audit_triggered_by CHECK (triggered_by IN ('user_upload', 'webhook', 'background_job', 'manual_sync') OR triggered_by IS NULL)
);

-- ============================================================
-- 6. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_documents_drive_file_id
  ON documents(google_drive_file_id);

CREATE INDEX IF NOT EXISTS idx_documents_drive_sync_status
  ON documents(drive_sync_status);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_document_id
  ON drive_sync_jobs(document_id);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
  ON drive_sync_jobs(status);

-- Partial index: only pending jobs need to be polled for retry scheduling.
CREATE INDEX IF NOT EXISTS idx_sync_jobs_next_retry
  ON drive_sync_jobs(next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_subs_drive_file_id
  ON drive_webhook_subscriptions(drive_file_id);

-- Partial index: only active subscriptions need renewal checks.
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active
  ON drive_webhook_subscriptions(subscription_expiration)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_audit_document_id
  ON drive_sync_audit(document_id);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON drive_sync_audit(created_at DESC);

-- ============================================================
-- 7. Row-Level Security
-- ============================================================

-- drive_service_account_config
-- Only Co-Founders may view or manage the service account configuration.
-- Writes from the application backend use the service_role key which bypasses RLS;
-- this select policy protects the UI admin surface.

ALTER TABLE drive_service_account_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cofounder select service account config"
  ON drive_service_account_config
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role_legacy_id = 'role_cofounder'
    )
  );

CREATE POLICY "cofounder update service account config"
  ON drive_service_account_config
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role_legacy_id = 'role_cofounder'
    )
  ) WITH CHECK (auth.uid() IS NOT NULL);

-- drive_sync_jobs
-- Any authenticated user may see sync job status for documents they can access.
-- Writes are performed exclusively via the service_role key (bypasses RLS).
-- NOTE: The original "allow all authenticated" select is tightened here —
-- users should only see jobs for documents they are authorised to view.

ALTER TABLE drive_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated select own document sync jobs"
  ON drive_sync_jobs
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM documents d
      JOIN users u ON u.auth_user_id = auth.uid()
      WHERE d.id = drive_sync_jobs.document_id
        AND (
          d.visibility_scope = 'global'
          OR (d.visibility_scope = 'department' AND u.department_legacy_id = d.department_legacy_id)
          OR (d.visibility_scope = 'private'    AND d.author_legacy_id = u.legacy_id)
          OR d.allowed_user_types  && array[u.user_type]
          OR d.allowed_role_ids    && array[u.role_legacy_id]
          OR d.allowed_team_ids    && array[u.team_legacy_id]
          OR d.assigned_user_ids   && array[u.legacy_id]
        )
    )
  );

-- drive_webhook_subscriptions
-- Webhook subscription management is a backend concern only.
-- All mutations use the service_role key and bypass RLS.
-- No authenticated-user read access is intentional — this is internal state.

ALTER TABLE drive_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

-- No client-side policies. Backend exclusively uses service_role.
-- If a diagnostic read is ever needed, scope it to role_cofounder only.

-- drive_sync_audit
-- Admins and Co-Founders may read the full audit log.
-- All other authenticated users may read audit entries for their own documents.

ALTER TABLE drive_sync_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin select drive sync audit"
  ON drive_sync_audit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
        AND role_legacy_id IN ('role_admin', 'role_cofounder')
    )
  );

CREATE POLICY "authenticated select own document audit"
  ON drive_sync_audit
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM documents d
      JOIN users u ON u.auth_user_id = auth.uid()
      WHERE d.id = drive_sync_audit.document_id
        AND d.author_legacy_id = u.legacy_id
    )
  );

-- ============================================================
-- 8. Deprecation of per-user OAuth tables (run separately when ready)
-- ============================================================
-- Do not run this block in the same migration as the above.
-- Verify service account Drive is fully operational first.
-- Then run as a standalone migration:
--
--   ALTER TABLE drive_accounts RENAME TO drive_accounts_deprecated;
--   ALTER TABLE drive_webhooks RENAME TO drive_webhooks_deprecated;
--   DROP POLICY IF EXISTS "select drive accounts for owner"            ON drive_accounts_deprecated;
--   DROP POLICY IF EXISTS "insert drive accounts for authenticated owner" ON drive_accounts_deprecated;
--   DROP POLICY IF EXISTS "update drive accounts for owner"            ON drive_accounts_deprecated;
--   DROP POLICY IF EXISTS "delete drive accounts for owner"            ON drive_accounts_deprecated;