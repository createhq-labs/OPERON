# Operon — Architecture

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI LAYER                                 │
│  Next.js 14 · React 18 · TypeScript · Framer Motion            │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER                                  │
│  Next.js API Routes (Node.js runtime)                           │
│  Document operations · Webhook processing · Search              │
└─────────────────────────────────────────────────────────────────┘
         ↓                         ↓
┌────────────────┐       ┌──────────────────────┐
│   Supabase     │       │   Google Drive API   │
│   PostgreSQL   │       │   (service account)  │
│   + RLS        │       │                      │
└────────────────┘       └──────────────────────┘
```

## Component Tree

```
App Root
└── AuthProvider
    └── PermissionProvider
        ├── Sidebar
        └── Page Content
            └── Modals / Overlays
```

## Pages

| Route | Purpose |
|---|---|
| `/` | Home — authenticated entry point |
| `/login` | Role selection and sign-in |
| `/library` | Document browse and search |
| `/resources` | Role-scoped resources |
| `/activity` | Audit log and activity feed |
| `/settings` | User preferences and admin configuration |

## Key Components

| Component | Location |
|---|---|
| `Sidebar` | `src/components/Sidebar.tsx` |
| `RoleSelector` | `src/features/auth/RoleSelector.tsx` |
| `DocumentUpload` | `src/components/DocumentUpload.tsx` |
| `ErrorBoundary` | `src/components/ErrorBoundary.tsx` |

---

## Drive Architecture

Google Drive is infrastructure, not a user-facing feature.

A single **company service account** owns all files. Users never connect personal Google accounts. Drive is invisible — Operon is the experience layer.

### Service Account Model

```
User uploads file
    ↓
Operon API (service account credentials)
    ↓
Google Drive (company folder)
    ↓
Metadata stored in Supabase
    ↓
Search index updated
    ↓
UI reflects new document
```

### Folder Structure

```
Operon Root Folder (owned by service account)
├── hr/
├── finance/
├── operations/
├── marketing/
├── engineering/
└── training/
```

Folder IDs are stored in `drive_service_account_config`. The application routes uploads to the correct subfolder based on document department/category.

---

## Data Flows

### Upload

```
DocumentUpload component
    ↓
POST /api/drive/upload
    ├── Authenticate via Supabase session
    ├── Check RBAC — user has upload permission
    ├── Stream file to Drive via service account
    └── Receive drive_file_id, web_link
    ↓
Insert row → documents table
    ├── drive_file_id, google_drive_web_link
    ├── drive_sync_status = 'synced'
    └── author_legacy_id, department_legacy_id, visibility_scope
    ↓
Enqueue drive_sync_jobs row (job_type = 'initial_upload')
    ↓
Insert drive_sync_audit row
    ↓
Supabase real-time broadcast → UI updates
```

### Drive → Operon Sync (Webhook)

```
File changes in Drive
    ↓
Google Drive push notification
    ↓
POST /api/drive/webhook
    ├── Verify x-goog-channel-token against GOOGLE_DRIVE_WEBHOOK_SECRET
    ├── Return HTTP 200 immediately
    └── Enqueue background job
    ↓
Background job (drive_sync_jobs)
    ├── Query Drive API for current file state
    └── Determine change type
    ↓
    ├── Updated  → refresh metadata, update drive_synced_at
    ├── Deleted  → set drive_sync_status = 'failed', preserve row
    └── Renamed  → update title in documents
    ↓
Update documents + drive_sync_audit
    ↓
Supabase real-time broadcast
```

### Search

```
User input (300ms debounce)
    ↓
POST /api/search
    ├── Validate and sanitize query
    └── Resolve user permissions from session
    ↓
PostgreSQL full-text search on document_search_index
    ├── Filtered by user's visibility scope (RLS)
    └── Ranked by relevance (ts_rank)
    ↓
Return: title, department, drive_web_link, relevance, updated_at
```

---

## Database Schema

### Core Tables

```
users
  id                UUID PRIMARY KEY
  auth_user_id      UUID UNIQUE            -- Supabase auth.users FK
  legacy_id         TEXT UNIQUE            -- Internal stable identifier
  email             TEXT UNIQUE NOT NULL
  name              TEXT
  role_legacy_id    TEXT                   -- FK → roles
  department_legacy_id TEXT               -- FK → departments
  team_legacy_id    TEXT
  user_type         TEXT
  status            TEXT                   -- active | invited | disabled
  created_at        TIMESTAMPTZ

documents
  id                UUID PRIMARY KEY
  title             TEXT NOT NULL
  author_legacy_id  TEXT                   -- FK → users.legacy_id
  department_legacy_id TEXT
  visibility_scope  TEXT                   -- global | department | private
  google_drive_file_id  TEXT UNIQUE
  google_drive_web_link TEXT
  drive_sync_status TEXT DEFAULT 'pending' -- pending | synced | failed
  drive_synced_at   TIMESTAMPTZ
  drive_version     INTEGER DEFAULT 1
  allowed_user_types  TEXT[]
  allowed_role_ids    TEXT[]
  allowed_team_ids    TEXT[]
  assigned_user_ids   TEXT[]
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ

document_search_index
  id                UUID PRIMARY KEY
  document_id       UUID REFERENCES documents(id)
  full_text         TEXT                   -- tsvector source
  search_vector     TSVECTOR               -- generated column
  created_at        TIMESTAMPTZ

drive_service_account_config
  id                UUID PRIMARY KEY
  config_key        TEXT UNIQUE
  service_account_email TEXT
  drive_folder_id   TEXT NOT NULL
  is_active         BOOLEAN DEFAULT true
  test_status       TEXT                   -- success | failed | untested
  configured_at     TIMESTAMPTZ
  updated_at        TIMESTAMPTZ

drive_sync_jobs
  id                UUID PRIMARY KEY
  document_id       UUID REFERENCES documents(id)
  job_type          TEXT                   -- initial_upload | version_update | metadata_sync | webhook_sync
  status            TEXT DEFAULT 'pending' -- pending | processing | completed | failed
  retry_count       INTEGER DEFAULT 0
  max_retries       INTEGER DEFAULT 3
  next_retry_at     TIMESTAMPTZ
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ

drive_webhook_subscriptions
  id                UUID PRIMARY KEY
  drive_file_id     TEXT UNIQUE
  channel_id        TEXT
  resource_id       TEXT
  subscription_expiration TIMESTAMPTZ
  next_renewal_at   TIMESTAMPTZ
  is_active         BOOLEAN DEFAULT true
  renewal_failure_count INTEGER DEFAULT 0

drive_sync_audit
  id                UUID PRIMARY KEY
  document_id       UUID REFERENCES documents(id)
  action            TEXT                   -- upload | replace | delete | webhook_received | sync_triggered
  drive_file_id     TEXT
  status            TEXT                   -- success | failed
  triggered_by      TEXT                   -- user_upload | webhook | background_job | manual_sync
  details           JSONB
  created_at        TIMESTAMPTZ

activity_logs
  id                UUID PRIMARY KEY
  user_legacy_id    TEXT
  action            TEXT
  resource_type     TEXT
  resource_id       TEXT
  details           JSONB
  created_at        TIMESTAMPTZ

resources
  id                UUID PRIMARY KEY
  created_by_id     TEXT
  visibility_scope  TEXT
  allowed_user_types  TEXT[]
  allowed_role_ids    TEXT[]
  allowed_departments TEXT[]
  allowed_team_ids    TEXT[]
  created_at        TIMESTAMPTZ

uploads
  id                UUID PRIMARY KEY
  uploaded_by       TEXT
  storage_bucket    TEXT NOT NULL
  storage_path      TEXT NOT NULL
  created_at        TIMESTAMPTZ
```

---

## API Endpoints

### Documents

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/documents` | List documents visible to the current user |
| `GET` | `/api/documents/[id]` | Get document metadata and Drive link |
| `POST` | `/api/drive/upload` | Upload file via service account |
| `PATCH` | `/api/documents/[id]` | Update title or description |
| `DELETE` | `/api/documents/[id]` | Delete from Drive and mark unavailable |

### Search

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/search` | Full-text search with RBAC filtering |
| `GET` | `/api/search/suggest` | Autocomplete suggestions |

### Drive Infrastructure

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/drive/webhook` | Receive Drive push notifications |
| `POST` | `/api/webhooks/renew` | Renew expiring webhook subscriptions |

### Admin (Co-Founder only)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/drive/status` | Service account connection status |
| `POST` | `/api/admin/drive/test` | Test service account connectivity |
| `POST` | `/api/admin/drive/sync` | Trigger manual full sync |

---

## Security

### Authentication
- Supabase Auth with email/password and optional SSO
- JWT sessions — 1 hour access token, 7 day refresh
- HTTP-only secure cookies for refresh tokens
- CSRF protection

### Authorization
- Supabase Row-Level Security on every table
- RBAC enforced at both API and database layers
- Document visibility: global / department / private / explicit allow-lists

### Drive Security
- Service account key stored in environment variables only — never in the database
- Webhook authenticity verified via `GOOGLE_DRIVE_WEBHOOK_SECRET`
- No user OAuth tokens stored — eliminates token rotation complexity

### API
- Rate limiting on all endpoints
- Input validation and sanitization on every route
- No secrets in response bodies, logs, or error messages

---

## Caching

| Layer | Target | TTL |
|---|---|---|
| Static assets | CDN | 365 days |
| User permissions | Server memory | 15 minutes |
| Document metadata | API response | 5 minutes |
| Search index | Materialized view | Refreshed on write |
| Role definitions | In-memory constant | Indefinite |

---

## Observability

### Structured Logging
All application events are written via the logger service (`src/services/logger.ts`).
Fields: `level`, `message`, `context`, `user_legacy_id`, `request_id`, `timestamp`.
No `console.log` in production code.

### Key Metrics
- API p50/p95/p99 latency
- Drive sync job queue depth and failure rate
- Webhook delivery success rate
- Search query latency
- Error rate by endpoint

### Alerts
- Error rate > 1%
- API latency p95 > 500ms
- Drive sync job failures > 5 in 10 minutes
- Webhook subscription expiration within 24 hours
- Database connection pool saturation

---

## Deployment

| Environment | Compute | Notes |
|---|---|---|
| Development | `npm run dev` (port 3000) | `.env.local` |
| Staging | Vercel preview | `.env.staging`, staging Supabase project |
| Production | Vercel / Docker | Secrets via platform environment variables |

Supabase migrations run via `supabase db push` from `supabase/migrations/` before each deployment.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Next.js 14 App Router |
| Styling | CSS custom properties + Tailwind |
| Animation | Framer Motion |
| Backend | Next.js API Routes (Node.js) |
| Database | PostgreSQL via Supabase |
| File storage | Google Drive (service account) |
| Auth | Supabase Auth |
| Error tracking | Sentry |
| CDN | Cloudflare |