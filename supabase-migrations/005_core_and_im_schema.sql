-- ============================================================
-- Migration 005: Core Access System + IM Module Schema
-- Date: 2026-06-23
--
-- Adds:
--   · modules, permissions, role_permissions, user_module_roles
--   · notifications table (CREATE IF NOT EXISTS — covers fresh installs;
--     existing Supabase deployments that already have this table are safe)
--   · notification_reads (replaces unread_by[] array pattern)
--   · All im_* tables for Influencer Marketing module
--   · Helper functions for RLS
--   · Indexes and RLS policies for all new tables
--   · Seed data: modules, permissions, role_permissions
--
-- Does NOT modify existing tables: roles, departments, teams, users,
-- documents, resources, videos, quick_actions, activity_logs, drive_*.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS HELPER FUNCTIONS
-- Marked SECURITY DEFINER + SET search_path = public so they
-- cannot be hijacked by a search_path attack.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_legacy_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT legacy_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role_legacy_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION has_permission(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   users u
    JOIN   role_permissions rp ON rp.role_legacy_id = u.role_legacy_id
    WHERE  u.auth_user_id = auth.uid()
      AND  rp.permission_legacy_id = p_perm
  );
$$;

CREATE OR REPLACE FUNCTION is_founder()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() = 'role_cofounder';
$$;

CREATE OR REPLACE FUNCTION is_hr_tier()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('role_hr', 'role_cofounder');
$$;

CREATE OR REPLACE FUNCTION is_im_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN (
    'role_im_team_lead', 'role_im_executive', 'role_im_associate',
    'role_cofounder'
  );
$$;

CREATE OR REPLACE FUNCTION is_im_lead_or_above()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('role_im_team_lead', 'role_cofounder');
$$;

CREATE OR REPLACE FUNCTION is_finance_tier()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT get_my_role() IN ('role_finance', 'role_finance_associate', 'role_cofounder');
$$;

-- ─────────────────────────────────────────────────────────────
-- MODULES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS modules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id   text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text,
  route       text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- PERMISSIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS permissions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        text        NOT NULL UNIQUE,
  name             text        NOT NULL,
  description      text,
  module_legacy_id text        REFERENCES modules(legacy_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- ROLE PERMISSIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_legacy_id       text        NOT NULL REFERENCES roles(legacy_id) ON DELETE CASCADE,
  permission_legacy_id text        NOT NULL REFERENCES permissions(legacy_id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_legacy_id, permission_legacy_id)
);

-- ─────────────────────────────────────────────────────────────
-- USER MODULE ROLES
-- Controls per-user access at the module level.
-- A user's default access comes from their role in users.role_legacy_id.
-- user_module_roles allows overriding per module (e.g., IM Associate
-- elevated to IM Lead on a specific module).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_module_roles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_legacy_id   text        NOT NULL REFERENCES users(legacy_id) ON DELETE CASCADE,
  module_legacy_id text        NOT NULL REFERENCES modules(legacy_id) ON DELETE CASCADE,
  role_legacy_id   text        NOT NULL REFERENCES roles(legacy_id) ON DELETE RESTRICT,
  granted_by_id    text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_legacy_id, module_legacy_id)
);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- CREATE IF NOT EXISTS covers fresh installs.
-- Existing Supabase deployments that already have this table are safe.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id         text        NOT NULL UNIQUE,
  title             text        NOT NULL,
  body              text        NOT NULL,
  notification_type text        NOT NULL
                    CHECK (notification_type IN ('system','document','resource','user')),
  audience          text        NOT NULL
                    CHECK (audience IN ('all','department','role','user')),
  department_ids    text[]      DEFAULT NULL,
  role_ids          text[]      DEFAULT NULL,
  user_ids          text[]      DEFAULT NULL,
  actor_id          text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  entity_type       text,
  entity_id         text,
  metadata          jsonb,
  unread_by         text[]      NOT NULL DEFAULT '{}',
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATION READS
-- Scalable alternative to updating the unread_by[] array.
-- A notification is unread if no row exists for (notification_id, user).
-- Both patterns coexist during migration; pick one per feature.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_reads (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_legacy_id  text        NOT NULL REFERENCES users(legacy_id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_legacy_id)
);

-- ─────────────────────────────────────────────────────────────
-- IM: BRANDS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_brands (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id     text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  industry      text,
  website       text,
  logo_url      text,
  status        text        NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive','archived')),
  notes         text,
  created_by_id text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_brands_updated_at
  BEFORE UPDATE ON im_brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: BRAND CONTACTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_brand_contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text        NOT NULL UNIQUE,
  brand_legacy_id text        NOT NULL REFERENCES im_brands(legacy_id) ON DELETE CASCADE,
  name            text        NOT NULL,
  email           text,
  phone           text,
  role            text        CHECK (role IN ('primary','billing','ops','general')),
  is_primary      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_brand_contacts_updated_at
  BEFORE UPDATE ON im_brand_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CREATORS
-- Influencer roster. Not the same as platform users in `users`.
-- Linked to a platform user via user_legacy_id when the creator
-- has a login (rare — most creators are external contacts only).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_creators (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id         text        NOT NULL UNIQUE,
  name              text        NOT NULL,
  email             text,
  phone             text,
  user_legacy_id    text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','blacklisted')),
  location_city     text,
  location_state    text,
  location_country  text        NOT NULL DEFAULT 'India',
  bio               text,
  profile_photo_url text,
  notes             text,
  managed_by_id     text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_by_id     text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_creators_updated_at
  BEFORE UPDATE ON im_creators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CREATOR PLATFORMS (social media handles + stats)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_creator_platforms (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_legacy_id   text        NOT NULL REFERENCES im_creators(legacy_id) ON DELETE CASCADE,
  platform            text        NOT NULL
                      CHECK (platform IN (
                        'instagram','youtube','linkedin','twitter',
                        'facebook','tiktok','snapchat','threads','other'
                      )),
  handle              text        NOT NULL,
  profile_url         text,
  followers_count     bigint      NOT NULL DEFAULT 0,
  avg_views           bigint,
  avg_reach           bigint,
  avg_engagement_rate numeric(6,3),
  verified            boolean     NOT NULL DEFAULT false,
  last_synced_at      timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_legacy_id, platform)
);

CREATE TRIGGER trg_im_creator_platforms_updated_at
  BEFORE UPDATE ON im_creator_platforms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CREATOR GENRES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_creator_genres (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_legacy_id text        NOT NULL REFERENCES im_creators(legacy_id) ON DELETE CASCADE,
  genre             text        NOT NULL
                    CHECK (genre IN (
                      'lifestyle','fashion','food','travel','fitness','tech',
                      'gaming','beauty','business','entertainment',
                      'education','finance','parenting','other'
                    )),
  is_primary        boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_legacy_id, genre)
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGNS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaigns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       text        NOT NULL UNIQUE,
  name            text        NOT NULL,
  brand_legacy_id text        NOT NULL REFERENCES im_brands(legacy_id) ON DELETE RESTRICT,
  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN (
                    'draft','planning','creator_selection','costing',
                    'client_review','approved','active','execution',
                    'completed','cancelled','on_hold'
                  )),
  campaign_type   text        CHECK (campaign_type IN ('one_time','retainer','event')),
  start_date      date,
  end_date        date,
  budget_total    numeric(14,2),
  budget_currency text        NOT NULL DEFAULT 'INR',
  objective       text,
  assigned_to_id  text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_by_id   text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_campaign_dates CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  )
);

CREATE TRIGGER trg_im_campaigns_updated_at
  BEFORE UPDATE ON im_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN BRIEFS (one per campaign)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_briefs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id              text        NOT NULL UNIQUE,
  campaign_legacy_id     text        NOT NULL UNIQUE REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  messaging              text,
  dos                    text[]      NOT NULL DEFAULT '{}',
  donts                  text[]      NOT NULL DEFAULT '{}',
  brand_guidelines_url   text,
  mood_board_urls        text[]      NOT NULL DEFAULT '{}',
  talking_points         text[]      NOT NULL DEFAULT '{}',
  hashtags               text[]      NOT NULL DEFAULT '{}',
  mentions               text[]      NOT NULL DEFAULT '{}',
  reference_content_urls text[]      NOT NULL DEFAULT '{}',
  approval_deadline      date,
  go_live_deadline       date,
  created_by_id          text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_campaign_briefs_updated_at
  BEFORE UPDATE ON im_campaign_briefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN REQUIRED PLATFORMS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_required_platforms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_legacy_id text NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  platform           text NOT NULL
                     CHECK (platform IN (
                       'instagram','youtube','linkedin','twitter',
                       'facebook','tiktok','snapchat','threads','other'
                     )),
  UNIQUE (campaign_legacy_id, platform)
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN REQUIRED GENRES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_required_genres (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_legacy_id text NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  genre              text NOT NULL
                     CHECK (genre IN (
                       'lifestyle','fashion','food','travel','fitness','tech',
                       'gaming','beauty','business','entertainment',
                       'education','finance','parenting','other'
                     )),
  UNIQUE (campaign_legacy_id, genre)
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN TARGET LOCATIONS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_target_locations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_legacy_id text NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  city               text,
  state              text,
  country            text NOT NULL DEFAULT 'India'
);

-- Unique index using COALESCE so NULL city/state are not treated as
-- always-distinct by the standard UNIQUE constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_im_ctl_unique
  ON im_campaign_target_locations (
    campaign_legacy_id,
    COALESCE(city,  ''),
    COALESCE(state, ''),
    country
  );

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN REQUIRED DELIVERABLES (brief-level template)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_required_deliverables (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_legacy_id text    NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  platform           text    NOT NULL,
  content_type       text    NOT NULL
                     CHECK (content_type IN (
                       'reel','post','story','video','shorts','live','carousel','thread'
                     )),
  quantity           integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes              text
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN ASSIGNMENTS (team members on a campaign)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_assignments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_legacy_id text        NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  user_legacy_id     text        NOT NULL REFERENCES users(legacy_id) ON DELETE CASCADE,
  role_in_campaign   text        NOT NULL CHECK (role_in_campaign IN ('lead','associate','support')),
  assigned_by_id     text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_legacy_id, user_legacy_id)
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN CREATORS (creator↔campaign join)
-- status drives the creator selection workflow:
--   shortlisted → internally_approved → sent_to_client
--   → client_approved → contracted   (success path)
--   → client_rejected | dropped       (exit paths)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_creators (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                 text        NOT NULL UNIQUE,
  campaign_legacy_id        text        NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  creator_legacy_id         text        NOT NULL REFERENCES im_creators(legacy_id) ON DELETE RESTRICT,
  status                    text        NOT NULL DEFAULT 'shortlisted'
                            CHECK (status IN (
                              'shortlisted','internally_approved','sent_to_client',
                              'client_approved','client_rejected','contracted','dropped'
                            )),
  shortlisted_by_id         text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  shortlisted_at            timestamptz,
  internally_approved_by_id text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  internally_approved_at    timestamptz,
  sent_to_client_at         timestamptz,
  client_decision_at        timestamptz,
  client_rejection_reason   text,
  contracted_at             timestamptz,
  dropped_reason            text,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_legacy_id, creator_legacy_id)
);

CREATE TRIGGER trg_im_campaign_creators_updated_at
  BEFORE UPDATE ON im_campaign_creators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN CREATOR COSTING (one active record per creator-campaign)
-- margin is a stored generated column: client_cost - internal_cost.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_creator_costing (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                  text        NOT NULL UNIQUE,
  campaign_creator_legacy_id text        NOT NULL UNIQUE
                             REFERENCES im_campaign_creators(legacy_id) ON DELETE CASCADE,
  internal_cost              numeric(12,2) CHECK (internal_cost >= 0),
  client_cost                numeric(12,2) CHECK (client_cost >= 0),
  margin                     numeric(12,2) GENERATED ALWAYS AS (
                               CASE
                                 WHEN client_cost IS NOT NULL AND internal_cost IS NOT NULL
                                 THEN client_cost - internal_cost
                                 ELSE NULL
                               END
                             ) STORED,
  currency                   text        NOT NULL DEFAULT 'INR',
  payment_terms              text,
  payment_status             text        NOT NULL DEFAULT 'pending'
                             CHECK (payment_status IN ('pending','advance_paid','completed','overdue')),
  notes                      text,
  created_by_id              text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_campaign_creator_costing_updated_at
  BEFORE UPDATE ON im_campaign_creator_costing
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN CREATOR COSTING HISTORY (append-only audit log)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_creator_costing_history (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  costing_legacy_id      text        NOT NULL REFERENCES im_campaign_creator_costing(legacy_id) ON DELETE CASCADE,
  changed_by_id          text        NOT NULL REFERENCES users(legacy_id) ON DELETE RESTRICT,
  previous_internal_cost numeric(12,2),
  previous_client_cost   numeric(12,2),
  new_internal_cost      numeric(12,2),
  new_client_cost        numeric(12,2),
  change_reason          text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN CREATOR DELIVERABLES (per-creator content plan)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_creator_deliverables (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                  text        NOT NULL UNIQUE,
  campaign_creator_legacy_id text        NOT NULL REFERENCES im_campaign_creators(legacy_id) ON DELETE CASCADE,
  platform                   text        NOT NULL,
  content_type               text        NOT NULL
                             CHECK (content_type IN (
                               'reel','post','story','video','shorts','live','carousel','thread'
                             )),
  quantity                   integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  due_date                   date,
  status                     text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN (
                               'pending','in_progress','submitted','approved','live','overdue'
                             )),
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_ccd_updated_at
  BEFORE UPDATE ON im_campaign_creator_deliverables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: BRAND EXPORTS (Google Sheet snapshots sent to client)
-- status: 'active' = current export; 'superseded' = replaced by newer;
--         'archived' = manually closed.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_brand_exports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id          text        NOT NULL UNIQUE,
  campaign_legacy_id text        NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE RESTRICT,
  brand_legacy_id    text        NOT NULL REFERENCES im_brands(legacy_id) ON DELETE RESTRICT,
  sheet_name         text        NOT NULL,
  sheet_url          text,
  google_sheet_id    text,
  exported_by_id     text        NOT NULL REFERENCES users(legacy_id) ON DELETE RESTRICT,
  exported_at        timestamptz NOT NULL DEFAULT now(),
  row_count          integer     NOT NULL DEFAULT 0,
  status             text        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','superseded','archived')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: BRAND EXPORT ROWS (one row per creator in an export)
-- snapshot stores the full creator+costing data at export time,
-- so brand edits can be diff'd against the original values.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_brand_export_rows (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  export_legacy_id           text        NOT NULL REFERENCES im_brand_exports(legacy_id) ON DELETE CASCADE,
  campaign_creator_legacy_id text        NOT NULL REFERENCES im_campaign_creators(legacy_id) ON DELETE RESTRICT,
  row_index                  integer     NOT NULL,
  snapshot                   jsonb       NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (export_legacy_id, campaign_creator_legacy_id)
);

-- ─────────────────────────────────────────────────────────────
-- IM: BRAND IMPORT CHANGES (brand edits pulled from Google Sheets)
-- Brands edit the sheet; this table captures pending changes.
-- Internal team reviews each change: accept applies it, reject discards it.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_brand_import_changes (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                  text        NOT NULL UNIQUE,
  export_legacy_id           text        NOT NULL REFERENCES im_brand_exports(legacy_id) ON DELETE CASCADE,
  campaign_creator_legacy_id text        REFERENCES im_campaign_creators(legacy_id) ON DELETE SET NULL,
  row_index                  integer,
  field_changes              jsonb       NOT NULL DEFAULT '[]',
  source                     text        NOT NULL DEFAULT 'brand'
                             CHECK (source IN ('brand','system')),
  review_status              text        NOT NULL DEFAULT 'pending'
                             CHECK (review_status IN ('pending','accepted','rejected')),
  reviewed_by_id             text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  reviewed_at                timestamptz,
  rejection_reason           text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_brand_import_changes_updated_at
  BEFORE UPDATE ON im_brand_import_changes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: SHEET SYNC LOGS (append-only audit of push/pull operations)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_sheet_sync_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  export_legacy_id text        NOT NULL REFERENCES im_brand_exports(legacy_id) ON DELETE CASCADE,
  synced_by_id     text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  sync_type        text        NOT NULL CHECK (sync_type IN ('push','pull')),
  status           text        NOT NULL CHECK (status IN ('success','partial','failed')),
  rows_pushed      integer     NOT NULL DEFAULT 0,
  rows_pulled      integer     NOT NULL DEFAULT 0,
  changes_detected integer     NOT NULL DEFAULT 0,
  error_message    text,
  synced_at        timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: CONTENT SUBMISSIONS (pre-live drafts submitted by creators)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_content_submissions (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                  text        NOT NULL UNIQUE,
  campaign_creator_legacy_id text        NOT NULL REFERENCES im_campaign_creators(legacy_id) ON DELETE CASCADE,
  deliverable_legacy_id      text        REFERENCES im_campaign_creator_deliverables(legacy_id) ON DELETE SET NULL,
  submission_url             text        NOT NULL,
  submission_type            text        NOT NULL
                             CHECK (submission_type IN ('draft','revision','final')),
  caption                    text,
  notes_from_creator         text,
  submitted_at               timestamptz NOT NULL DEFAULT now(),
  review_status              text        NOT NULL DEFAULT 'pending'
                             CHECK (review_status IN ('pending','approved','revision_requested')),
  reviewed_by_id             text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  reviewed_at                timestamptz,
  review_notes               text,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: CONTENT LIVE LINKS (published content URLs)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_content_live_links (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                  text        NOT NULL UNIQUE,
  campaign_creator_legacy_id text        NOT NULL REFERENCES im_campaign_creators(legacy_id) ON DELETE CASCADE,
  deliverable_legacy_id      text        REFERENCES im_campaign_creator_deliverables(legacy_id) ON DELETE SET NULL,
  platform                   text        NOT NULL,
  content_type               text        NOT NULL,
  live_url                   text        NOT NULL,
  went_live_at               timestamptz NOT NULL,
  caption                    text,
  verified                   boolean     NOT NULL DEFAULT false,
  verified_by_id             text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  verified_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: CONTENT INSIGHTS (performance metrics per live link)
-- Multiple snapshots per live link are allowed (tracked over time).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_content_insights (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  live_link_legacy_id text        NOT NULL REFERENCES im_content_live_links(legacy_id) ON DELETE CASCADE,
  platform            text        NOT NULL,
  views               bigint      NOT NULL DEFAULT 0,
  reach               bigint      NOT NULL DEFAULT 0,
  impressions         bigint      NOT NULL DEFAULT 0,
  likes               bigint      NOT NULL DEFAULT 0,
  comments            bigint      NOT NULL DEFAULT 0,
  shares              bigint      NOT NULL DEFAULT 0,
  saves               bigint      NOT NULL DEFAULT 0,
  engagement_rate     numeric(6,3),
  link_clicks         bigint      NOT NULL DEFAULT 0,
  screenshot_url      text,
  recorded_at         timestamptz NOT NULL,
  recorded_by_id      text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: CAMPAIGN PERFORMANCE SUMMARIES (cached aggregate)
-- Recomputed by a server function after any insight update.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_campaign_performance_summaries (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_legacy_id     text        NOT NULL UNIQUE REFERENCES im_campaigns(legacy_id) ON DELETE CASCADE,
  total_creators         integer     NOT NULL DEFAULT 0,
  creators_contracted    integer     NOT NULL DEFAULT 0,
  creators_live          integer     NOT NULL DEFAULT 0,
  total_deliverables     integer     NOT NULL DEFAULT 0,
  deliverables_completed integer     NOT NULL DEFAULT 0,
  total_views            bigint      NOT NULL DEFAULT 0,
  total_reach            bigint      NOT NULL DEFAULT 0,
  total_impressions      bigint      NOT NULL DEFAULT 0,
  total_engagement       bigint      NOT NULL DEFAULT 0,
  avg_engagement_rate    numeric(6,3),
  total_internal_cost    numeric(14,2) NOT NULL DEFAULT 0,
  total_client_cost      numeric(14,2) NOT NULL DEFAULT 0,
  total_margin           numeric(14,2) NOT NULL DEFAULT 0,
  last_computed_at       timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- IM: CREATOR PERFORMANCE SUMMARIES (cached aggregate per period)
-- period: 'all_time' | 'YYYY' | 'YYYY-Q1' … 'YYYY-Q4'
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_creator_performance_summaries (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_legacy_id      text        NOT NULL REFERENCES im_creators(legacy_id) ON DELETE CASCADE,
  period                 text        NOT NULL,
  campaigns_participated integer     NOT NULL DEFAULT 0,
  deliverables_completed integer     NOT NULL DEFAULT 0,
  avg_views              bigint,
  avg_engagement_rate    numeric(6,3),
  total_earned           numeric(14,2) NOT NULL DEFAULT 0,
  last_computed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creator_legacy_id, period)
);

-- ─────────────────────────────────────────────────────────────
-- IM: BILLING HANDOFFS (campaign billing handed to Finance)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_billing_handoffs (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id            text        NOT NULL UNIQUE,
  campaign_legacy_id   text        NOT NULL REFERENCES im_campaigns(legacy_id) ON DELETE RESTRICT,
  brand_legacy_id      text        NOT NULL REFERENCES im_brands(legacy_id) ON DELETE RESTRICT,
  total_client_amount  numeric(14,2) NOT NULL,
  total_creator_amount numeric(14,2) NOT NULL,
  currency             text        NOT NULL DEFAULT 'INR',
  handoff_status       text        NOT NULL DEFAULT 'pending'
                       CHECK (handoff_status IN (
                         'pending','invoiced','paid','disputed','written_off'
                       )),
  invoice_number       text,
  invoice_url          text,
  invoiced_at          timestamptz,
  paid_at              timestamptz,
  notes                text,
  created_by_id        text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_billing_handoffs_updated_at
  BEFORE UPDATE ON im_billing_handoffs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- IM: TASKS
-- campaign_legacy_id and creator_legacy_id are both optional —
-- tasks can be generic (no campaign), campaign-level, or creator-level.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS im_tasks (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id          text        NOT NULL UNIQUE,
  campaign_legacy_id text        REFERENCES im_campaigns(legacy_id) ON DELETE SET NULL,
  creator_legacy_id  text        REFERENCES im_creators(legacy_id) ON DELETE SET NULL,
  title              text        NOT NULL,
  description        text,
  task_type          text        CHECK (task_type IN (
                       'follow_up','approval','content_review','billing','internal','other'
                     )),
  status             text        NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','done','cancelled')),
  priority           text        NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to_id     text        REFERENCES users(legacy_id) ON DELETE SET NULL,
  created_by_id      text        NOT NULL REFERENCES users(legacy_id) ON DELETE RESTRICT,
  due_date           date,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_im_tasks_updated_at
  BEFORE UPDATE ON im_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

-- Core access
CREATE INDEX IF NOT EXISTS idx_permissions_module      ON permissions(module_legacy_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_role         ON role_permissions(role_legacy_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_permission   ON role_permissions(permission_legacy_id);
CREATE INDEX IF NOT EXISTS idx_umr_user                ON user_module_roles(user_legacy_id);
CREATE INDEX IF NOT EXISTS idx_umr_module              ON user_module_roles(module_legacy_id);

-- Notification reads
CREATE INDEX IF NOT EXISTS idx_notif_reads_notification ON notification_reads(notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_reads_user         ON notification_reads(user_legacy_id);

-- Brands
CREATE INDEX IF NOT EXISTS idx_im_brands_status        ON im_brands(status);
CREATE INDEX IF NOT EXISTS idx_im_brands_name_trgm     ON im_brands USING gin(name gin_trgm_ops);

-- Creators
CREATE INDEX IF NOT EXISTS idx_im_creators_status      ON im_creators(status);
CREATE INDEX IF NOT EXISTS idx_im_creators_managed_by  ON im_creators(managed_by_id);
CREATE INDEX IF NOT EXISTS idx_im_creators_user        ON im_creators(user_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_creators_name_trgm   ON im_creators USING gin(name gin_trgm_ops);

-- Creator platforms
CREATE INDEX IF NOT EXISTS idx_im_cp_creator           ON im_creator_platforms(creator_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_cp_platform          ON im_creator_platforms(platform);
CREATE INDEX IF NOT EXISTS idx_im_cp_followers         ON im_creator_platforms(followers_count DESC);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_im_campaigns_brand      ON im_campaigns(brand_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_campaigns_status     ON im_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_im_campaigns_assigned   ON im_campaigns(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_im_campaigns_dates      ON im_campaigns(start_date, end_date);

-- Campaign creators
CREATE INDEX IF NOT EXISTS idx_im_cc_campaign          ON im_campaign_creators(campaign_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_cc_creator           ON im_campaign_creators(creator_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_cc_status            ON im_campaign_creators(status);

-- Campaign assignments
CREATE INDEX IF NOT EXISTS idx_im_ca_user              ON im_campaign_assignments(user_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_ca_campaign          ON im_campaign_assignments(campaign_legacy_id);

-- Costing
CREATE INDEX IF NOT EXISTS idx_im_ccc_cc               ON im_campaign_creator_costing(campaign_creator_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_ccc_payment_status   ON im_campaign_creator_costing(payment_status);

-- Deliverables
CREATE INDEX IF NOT EXISTS idx_im_ccd_cc               ON im_campaign_creator_deliverables(campaign_creator_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_ccd_status           ON im_campaign_creator_deliverables(status);
CREATE INDEX IF NOT EXISTS idx_im_ccd_due_date         ON im_campaign_creator_deliverables(due_date);

-- Brand exports
CREATE INDEX IF NOT EXISTS idx_im_exports_campaign     ON im_brand_exports(campaign_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_exports_brand        ON im_brand_exports(brand_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_exports_status       ON im_brand_exports(status);

-- Brand import changes
CREATE INDEX IF NOT EXISTS idx_im_changes_export       ON im_brand_import_changes(export_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_changes_review       ON im_brand_import_changes(review_status);

-- Live links
CREATE INDEX IF NOT EXISTS idx_im_ll_cc                ON im_content_live_links(campaign_creator_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_ll_platform          ON im_content_live_links(platform);
CREATE INDEX IF NOT EXISTS idx_im_ll_went_live         ON im_content_live_links(went_live_at DESC);

-- Insights
CREATE INDEX IF NOT EXISTS idx_im_insights_live_link   ON im_content_insights(live_link_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_insights_recorded_at ON im_content_insights(recorded_at DESC);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_im_tasks_campaign       ON im_tasks(campaign_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_tasks_creator        ON im_tasks(creator_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_tasks_assigned       ON im_tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_im_tasks_status         ON im_tasks(status);
CREATE INDEX IF NOT EXISTS idx_im_tasks_priority       ON im_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_im_tasks_due_date       ON im_tasks(due_date);

-- Billing
CREATE INDEX IF NOT EXISTS idx_im_billing_campaign     ON im_billing_handoffs(campaign_legacy_id);
CREATE INDEX IF NOT EXISTS idx_im_billing_status       ON im_billing_handoffs(handoff_status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- modules (public read; founder write)
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modules_read"          ON modules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "modules_write_founder" ON modules FOR ALL    USING (is_founder());

-- permissions (public read; founder write)
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_read"          ON permissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "permissions_write_founder" ON permissions FOR ALL    USING (is_founder());

-- role_permissions (public read; founder write)
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_read"          ON role_permissions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rp_write_founder" ON role_permissions FOR ALL    USING (is_founder());

-- user_module_roles (own read; founder write)
ALTER TABLE user_module_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "umr_read_own"     ON user_module_roles FOR SELECT USING (
  user_legacy_id = get_my_legacy_id() OR is_founder()
);
CREATE POLICY "umr_write_founder" ON user_module_roles FOR ALL USING (is_founder());

-- notification_reads (own rows only)
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_reads_select" ON notification_reads FOR SELECT USING (
  user_legacy_id = get_my_legacy_id()
);
CREATE POLICY "notif_reads_insert" ON notification_reads FOR INSERT WITH CHECK (
  user_legacy_id = get_my_legacy_id()
);

-- im_brands
ALTER TABLE im_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_brands_select" ON im_brands FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_brands_insert" ON im_brands FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_brands_update" ON im_brands FOR UPDATE USING (is_im_lead_or_above());
CREATE POLICY "im_brands_delete" ON im_brands FOR DELETE USING (is_founder());

-- im_brand_contacts
ALTER TABLE im_brand_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_bc_select" ON im_brand_contacts FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_bc_insert" ON im_brand_contacts FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_bc_update" ON im_brand_contacts FOR UPDATE USING (is_im_lead_or_above());
CREATE POLICY "im_bc_delete" ON im_brand_contacts FOR DELETE USING (is_founder());

-- im_creators
ALTER TABLE im_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_creators_select"        ON im_creators FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_creators_insert"        ON im_creators FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_creators_update_lead"   ON im_creators FOR UPDATE USING (
  managed_by_id = get_my_legacy_id() OR is_im_lead_or_above()
);
CREATE POLICY "im_creators_delete_lead"   ON im_creators FOR DELETE USING (is_im_lead_or_above());

-- im_creator_platforms
ALTER TABLE im_creator_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_cp_select" ON im_creator_platforms FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_cp_insert" ON im_creator_platforms FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_cp_update" ON im_creator_platforms FOR UPDATE USING (is_im_member());
CREATE POLICY "im_cp_delete" ON im_creator_platforms FOR DELETE USING (is_im_lead_or_above());

-- im_creator_genres
ALTER TABLE im_creator_genres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_cg_select" ON im_creator_genres FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_cg_insert" ON im_creator_genres FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_cg_delete" ON im_creator_genres FOR DELETE USING (is_im_member());

-- im_campaigns: IM Leads see all; associates see only assigned campaigns
ALTER TABLE im_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_campaigns_select" ON im_campaigns FOR SELECT USING (
  is_founder() OR is_im_lead_or_above() OR
  EXISTS (
    SELECT 1 FROM im_campaign_assignments ica
    WHERE  ica.campaign_legacy_id = im_campaigns.legacy_id
      AND  ica.user_legacy_id     = get_my_legacy_id()
  )
);
CREATE POLICY "im_campaigns_insert" ON im_campaigns FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_campaigns_update" ON im_campaigns FOR UPDATE USING (is_im_lead_or_above());
CREATE POLICY "im_campaigns_delete" ON im_campaigns FOR DELETE USING (is_founder());

-- im_campaign_briefs
ALTER TABLE im_campaign_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_briefs_select" ON im_campaign_briefs FOR SELECT USING (
  is_founder() OR is_im_lead_or_above() OR
  EXISTS (
    SELECT 1 FROM im_campaign_assignments ica
    WHERE  ica.campaign_legacy_id = im_campaign_briefs.campaign_legacy_id
      AND  ica.user_legacy_id     = get_my_legacy_id()
  )
);
CREATE POLICY "im_briefs_insert" ON im_campaign_briefs FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_briefs_update" ON im_campaign_briefs FOR UPDATE USING (is_im_lead_or_above());

-- Campaign sub-tables (required_platforms, genres, locations, deliverables)
-- Follow same visibility as campaigns; write restricted to IM Lead+.
ALTER TABLE im_campaign_required_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_crp_select" ON im_campaign_required_platforms FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_crp_all"    ON im_campaign_required_platforms FOR ALL USING (is_im_lead_or_above());

ALTER TABLE im_campaign_required_genres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_crg_select" ON im_campaign_required_genres FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_crg_all"    ON im_campaign_required_genres FOR ALL USING (is_im_lead_or_above());

ALTER TABLE im_campaign_target_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ctl_select" ON im_campaign_target_locations FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_ctl_all"    ON im_campaign_target_locations FOR ALL USING (is_im_lead_or_above());

ALTER TABLE im_campaign_required_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_crd_select" ON im_campaign_required_deliverables FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_crd_all"    ON im_campaign_required_deliverables FOR ALL USING (is_im_lead_or_above());

-- im_campaign_assignments
ALTER TABLE im_campaign_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ca_select" ON im_campaign_assignments FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_ca_all"    ON im_campaign_assignments FOR ALL USING (is_im_lead_or_above());

-- im_campaign_creators
ALTER TABLE im_campaign_creators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_cc_select" ON im_campaign_creators FOR SELECT USING (
  is_founder() OR is_im_lead_or_above() OR
  EXISTS (
    SELECT 1 FROM im_campaign_assignments ica
    WHERE  ica.campaign_legacy_id = im_campaign_creators.campaign_legacy_id
      AND  ica.user_legacy_id     = get_my_legacy_id()
  )
);
CREATE POLICY "im_cc_insert" ON im_campaign_creators FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_cc_update" ON im_campaign_creators FOR UPDATE USING (is_im_member());
CREATE POLICY "im_cc_delete" ON im_campaign_creators FOR DELETE USING (is_im_lead_or_above());

-- im_campaign_creator_costing (costing is lead-only; Finance reads for billing)
ALTER TABLE im_campaign_creator_costing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ccc_select" ON im_campaign_creator_costing FOR SELECT USING (
  is_im_lead_or_above() OR is_founder() OR is_finance_tier()
);
CREATE POLICY "im_ccc_insert" ON im_campaign_creator_costing FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_ccc_update" ON im_campaign_creator_costing FOR UPDATE USING (is_im_lead_or_above());
CREATE POLICY "im_ccc_delete" ON im_campaign_creator_costing FOR DELETE USING (is_founder());

-- im_campaign_creator_costing_history (append-only)
ALTER TABLE im_campaign_creator_costing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_cch_select" ON im_campaign_creator_costing_history FOR SELECT USING (
  is_im_lead_or_above() OR is_founder()
);
CREATE POLICY "im_cch_insert" ON im_campaign_creator_costing_history FOR INSERT WITH CHECK (is_im_lead_or_above());

-- im_campaign_creator_deliverables
ALTER TABLE im_campaign_creator_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ccd_select" ON im_campaign_creator_deliverables FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_ccd_write"  ON im_campaign_creator_deliverables FOR ALL USING (is_im_member());

-- im_brand_exports
ALTER TABLE im_brand_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_exports_select" ON im_brand_exports FOR SELECT USING (is_im_lead_or_above() OR is_founder());
CREATE POLICY "im_exports_write"  ON im_brand_exports FOR ALL USING (is_im_lead_or_above());

-- im_brand_export_rows (append-only)
ALTER TABLE im_brand_export_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_er_select" ON im_brand_export_rows FOR SELECT USING (is_im_lead_or_above() OR is_founder());
CREATE POLICY "im_er_insert" ON im_brand_export_rows FOR INSERT WITH CHECK (is_im_lead_or_above());

-- im_brand_import_changes
ALTER TABLE im_brand_import_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ic_select" ON im_brand_import_changes FOR SELECT USING (is_im_lead_or_above() OR is_founder());
CREATE POLICY "im_ic_insert" ON im_brand_import_changes FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_ic_update" ON im_brand_import_changes FOR UPDATE USING (is_im_lead_or_above());

-- im_sheet_sync_logs (append-only)
ALTER TABLE im_sheet_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ssl_select" ON im_sheet_sync_logs FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_ssl_insert" ON im_sheet_sync_logs FOR INSERT WITH CHECK (is_im_lead_or_above());

-- im_content_submissions
ALTER TABLE im_content_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_cs_select" ON im_content_submissions FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_cs_insert" ON im_content_submissions FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_cs_update" ON im_content_submissions FOR UPDATE USING (is_im_member());

-- im_content_live_links
ALTER TABLE im_content_live_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ll_select" ON im_content_live_links FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_ll_insert" ON im_content_live_links FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_ll_update" ON im_content_live_links FOR UPDATE USING (is_im_member());

-- im_content_insights
ALTER TABLE im_content_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_ins_select" ON im_content_insights FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_ins_insert" ON im_content_insights FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_ins_update" ON im_content_insights FOR UPDATE USING (is_im_member());

-- im_campaign_performance_summaries
ALTER TABLE im_campaign_performance_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_cps_select" ON im_campaign_performance_summaries FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_cps_write"  ON im_campaign_performance_summaries FOR ALL USING (is_im_lead_or_above());

-- im_creator_performance_summaries
ALTER TABLE im_creator_performance_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_crps_select" ON im_creator_performance_summaries FOR SELECT USING (is_im_member() OR is_founder());
CREATE POLICY "im_crps_write"  ON im_creator_performance_summaries FOR ALL USING (is_im_lead_or_above());

-- im_billing_handoffs
ALTER TABLE im_billing_handoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_bh_select" ON im_billing_handoffs FOR SELECT USING (
  is_im_lead_or_above() OR is_founder() OR is_finance_tier()
);
CREATE POLICY "im_bh_insert" ON im_billing_handoffs FOR INSERT WITH CHECK (is_im_lead_or_above());
CREATE POLICY "im_bh_update" ON im_billing_handoffs FOR UPDATE USING (
  is_im_lead_or_above() OR get_my_role() IN ('role_finance','role_cofounder')
);
CREATE POLICY "im_bh_delete" ON im_billing_handoffs FOR DELETE USING (is_founder());

-- im_tasks
ALTER TABLE im_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "im_tasks_select" ON im_tasks FOR SELECT USING (
  is_founder() OR is_im_member() OR
  assigned_to_id = get_my_legacy_id() OR
  created_by_id  = get_my_legacy_id()
);
CREATE POLICY "im_tasks_insert" ON im_tasks FOR INSERT WITH CHECK (is_im_member());
CREATE POLICY "im_tasks_update" ON im_tasks FOR UPDATE USING (
  is_im_lead_or_above() OR
  assigned_to_id = get_my_legacy_id() OR
  created_by_id  = get_my_legacy_id()
);
CREATE POLICY "im_tasks_delete" ON im_tasks FOR DELETE USING (is_im_lead_or_above() OR is_founder());

-- ============================================================
-- SEED DATA
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Modules
-- ─────────────────────────────────────────────────────────────

INSERT INTO modules (legacy_id, name, description, route, is_active) VALUES
  ('module_library',   'Library',   'Document and resource knowledge base',     '/',           true),
  ('module_workforce', 'Workforce', 'HR operations and people management',       '/workforce',  true),
  ('module_im',        'IM',        'Influencer Marketing campaign management',  '/im',         true),
  ('module_finance',   'Finance',   'Finance operations and reporting',           '/finance',    false),
  ('module_team',      'Team',      'Team directory and org structure',           '/team',       true),
  ('module_roles',     'Roles',     'Role and permission management',             '/roles',      true),
  ('module_activity',  'Activity',  'Platform-wide audit log',                   '/activity',   true)
ON CONFLICT (legacy_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Permissions
-- ─────────────────────────────────────────────────────────────

INSERT INTO permissions (legacy_id, name, module_legacy_id) VALUES
  -- Library
  ('perm_view_library',          'View Library',             'module_library'),
  ('perm_upload_documents',      'Upload Documents',         'module_library'),
  ('perm_edit_documents',        'Edit Documents',           'module_library'),
  ('perm_delete_documents',      'Delete Documents',         'module_library'),
  ('perm_manage_resources',      'Manage Resources',         'module_library'),
  -- Workforce
  ('perm_view_workforce',        'View Workforce',           'module_workforce'),
  ('perm_manage_hr_calendar',    'Manage HR Calendar',       'module_workforce'),
  ('perm_view_hr_records_all',   'View All HR Records',      'module_workforce'),
  ('perm_approve_leave_tl',      'Approve Leave (TL)',        'module_workforce'),
  ('perm_approve_leave_hr',      'Approve Leave (HR)',        'module_workforce'),
  ('perm_approve_leave_founder', 'Approve Leave (Founder)',   'module_workforce'),
  ('perm_submit_probation',      'Submit Probation Review',  'module_workforce'),
  ('perm_decide_probation',      'Decide Probation Outcome', 'module_workforce'),
  -- IM
  ('perm_view_im',               'View IM Module',           'module_im'),
  ('perm_manage_im_campaigns',   'Manage IM Campaigns',      'module_im'),
  ('perm_manage_im_creators',    'Manage IM Creators',       'module_im'),
  ('perm_manage_im_costing',     'Manage IM Costing',        'module_im'),
  ('perm_manage_im_exports',     'Manage IM Exports',        'module_im'),
  -- Activity
  ('perm_view_activity',         'View Activity Log',        'module_activity'),
  -- Team
  ('perm_view_team',             'View Team Directory',      'module_team'),
  ('perm_manage_users',          'Manage Users',             'module_team'),
  -- Roles
  ('perm_manage_roles',          'Manage Roles',             'module_roles'),
  -- Global
  ('perm_send_notifications',    'Send Notifications',       NULL)
ON CONFLICT (legacy_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Role ↔ Permission Mappings
-- ─────────────────────────────────────────────────────────────

-- Co-Founder: all permissions
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id)
SELECT 'role_cofounder', legacy_id FROM permissions
ON CONFLICT DO NOTHING;

-- HR
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_hr', 'perm_view_library'),
  ('role_hr', 'perm_upload_documents'),
  ('role_hr', 'perm_edit_documents'),
  ('role_hr', 'perm_manage_resources'),
  ('role_hr', 'perm_view_workforce'),
  ('role_hr', 'perm_manage_hr_calendar'),
  ('role_hr', 'perm_view_hr_records_all'),
  ('role_hr', 'perm_approve_leave_tl'),
  ('role_hr', 'perm_approve_leave_hr'),
  ('role_hr', 'perm_submit_probation'),
  ('role_hr', 'perm_view_activity'),
  ('role_hr', 'perm_view_team'),
  ('role_hr', 'perm_send_notifications')
ON CONFLICT DO NOTHING;

-- HR Executive
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_hr_executive', 'perm_view_library'),
  ('role_hr_executive', 'perm_view_workforce'),
  ('role_hr_executive', 'perm_view_activity'),
  ('role_hr_executive', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Senior TM
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_senior_tm', 'perm_view_library'),
  ('role_senior_tm', 'perm_upload_documents'),
  ('role_senior_tm', 'perm_edit_documents'),
  ('role_senior_tm', 'perm_manage_resources'),
  ('role_senior_tm', 'perm_view_workforce'),
  ('role_senior_tm', 'perm_view_hr_records_all'),
  ('role_senior_tm', 'perm_approve_leave_tl'),
  ('role_senior_tm', 'perm_view_activity'),
  ('role_senior_tm', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- TM Team Lead
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_tm_team_lead', 'perm_view_library'),
  ('role_tm_team_lead', 'perm_upload_documents'),
  ('role_tm_team_lead', 'perm_edit_documents'),
  ('role_tm_team_lead', 'perm_manage_resources'),
  ('role_tm_team_lead', 'perm_view_workforce'),
  ('role_tm_team_lead', 'perm_approve_leave_tl'),
  ('role_tm_team_lead', 'perm_view_activity'),
  ('role_tm_team_lead', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Category Lead
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_category_lead', 'perm_view_library'),
  ('role_category_lead', 'perm_upload_documents'),
  ('role_category_lead', 'perm_edit_documents'),
  ('role_category_lead', 'perm_manage_resources'),
  ('role_category_lead', 'perm_view_workforce'),
  ('role_category_lead', 'perm_approve_leave_tl'),
  ('role_category_lead', 'perm_view_activity'),
  ('role_category_lead', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- IM Team Lead
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_im_team_lead', 'perm_view_library'),
  ('role_im_team_lead', 'perm_upload_documents'),
  ('role_im_team_lead', 'perm_edit_documents'),
  ('role_im_team_lead', 'perm_manage_resources'),
  ('role_im_team_lead', 'perm_view_workforce'),
  ('role_im_team_lead', 'perm_approve_leave_tl'),
  ('role_im_team_lead', 'perm_view_im'),
  ('role_im_team_lead', 'perm_manage_im_campaigns'),
  ('role_im_team_lead', 'perm_manage_im_creators'),
  ('role_im_team_lead', 'perm_manage_im_costing'),
  ('role_im_team_lead', 'perm_manage_im_exports'),
  ('role_im_team_lead', 'perm_view_activity'),
  ('role_im_team_lead', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- IM Executive
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_im_executive', 'perm_view_library'),
  ('role_im_executive', 'perm_view_workforce'),
  ('role_im_executive', 'perm_view_im'),
  ('role_im_executive', 'perm_manage_im_creators'),
  ('role_im_executive', 'perm_view_activity'),
  ('role_im_executive', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- IM Associate
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_im_associate', 'perm_view_library'),
  ('role_im_associate', 'perm_view_workforce'),
  ('role_im_associate', 'perm_view_im'),
  ('role_im_associate', 'perm_manage_im_creators'),
  ('role_im_associate', 'perm_view_activity'),
  ('role_im_associate', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Finance Manager
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_finance', 'perm_view_library'),
  ('role_finance', 'perm_upload_documents'),
  ('role_finance', 'perm_edit_documents'),
  ('role_finance', 'perm_manage_resources'),
  ('role_finance', 'perm_view_workforce'),
  ('role_finance', 'perm_approve_leave_tl'),
  ('role_finance', 'perm_view_activity'),
  ('role_finance', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Finance Associate
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_finance_associate', 'perm_view_library'),
  ('role_finance_associate', 'perm_view_workforce'),
  ('role_finance_associate', 'perm_view_activity'),
  ('role_finance_associate', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Creator Acquisition
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_creator_acquisition', 'perm_view_library'),
  ('role_creator_acquisition', 'perm_view_workforce'),
  ('role_creator_acquisition', 'perm_view_activity'),
  ('role_creator_acquisition', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- TM Associate
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_tm_associate', 'perm_view_library'),
  ('role_tm_associate', 'perm_view_workforce'),
  ('role_tm_associate', 'perm_view_activity'),
  ('role_tm_associate', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Sales Executive
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_sales_executive', 'perm_view_library'),
  ('role_sales_executive', 'perm_view_workforce'),
  ('role_sales_executive', 'perm_view_activity'),
  ('role_sales_executive', 'perm_view_team')
ON CONFLICT DO NOTHING;

-- Creator (platform login, view only their assigned documents)
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_creator', 'perm_view_library')
ON CONFLICT DO NOTHING;

-- Intern
INSERT INTO role_permissions (role_legacy_id, permission_legacy_id) VALUES
  ('role_intern', 'perm_view_library'),
  ('role_intern', 'perm_view_workforce'),
  ('role_intern', 'perm_view_team')
ON CONFLICT DO NOTHING;
