# OPERON

Operational knowledge and document management platform built with Next.js, Supabase, and Google Drive integration.

## Production readiness checklist

### Required environment variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key for client runtime
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key for server-side admin operations

### Optional environment variables
- `NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE` — `true` to enable Google Drive integration
- `NEXT_PUBLIC_ENABLE_DRIVE_SYNC` — `true` to enable drive sync logic
- `NEXT_PUBLIC_ENABLE_DRIVE_ATTACHMENTS` — `true` to enable drive attachment workflows
- `NEXT_PUBLIC_DEV_AUTH` — `true` to enable developer auth fallback for local development
- `NEXT_PUBLIC_APP_URL` — production app URL used to generate callback and webhook URLs
- `GOOGLE_DRIVE_CLIENT_ID` — Google OAuth client ID for Drive integration
- `GOOGLE_DRIVE_CLIENT_SECRET` — Google OAuth client secret for Drive integration
- `NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI` — optional public redirect URI used by the frontend
- `GOOGLE_DRIVE_REDIRECT_URI` — optional server-side callback override
- `GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL` — optional server-side webhook URL override
- `DRIVE_TOKEN_ENCRYPTION_KEY` — required when storing encrypted Drive tokens
- `GOOGLE_CLOUD_VISION_API_KEY` — optional Google Vision API key for OCR
- `OPENAI_API_KEY` — optional OpenAI API key for embeddings
- `OPENAI_EMBEDDING_MODEL` — optional embedding model, defaults to `text-embedding-3-small`
- `NEXT_PUBLIC_STORAGE_REGION` — optional storage region label for previews

## Supabase setup

### Required tables
Ensure the following tables exist and are populated with required reference data:
- `roles`
- `users`
- `departments`
- `teams`
- `documents`
- `resources`
- `drive_documents`
- `activity_logs`
- `uploads`
- `drive_accounts`
- `drive_webhooks`

### Optional but recommended tables
- `videos`
- `quick_actions`
- `ingestion_jobs`
- `ingestion_results`
- `ingestion_failures`

### RLS policies
The schema includes row-level security policies for:
- `documents`
- `users`
- `uploads`

Additional tables are not RLS-enabled in the current schema and use server-side or public access according to application requirements.

## Google OAuth setup

### Supabase authentication
The app uses Supabase OAuth Google sign-in via `supabase.auth.signInWithOAuth({ provider: "google" })`.
Configure Google provider credentials in the Supabase Authentication dashboard and set the Supabase redirect URL there.

### Google Drive integration
For Drive connector workflows, configure:
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `DRIVE_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL` or explicit `GOOGLE_DRIVE_REDIRECT_URI`
- `GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL` if webhook support is required

The app now avoids hardcoded `http://localhost:3000` as a production fallback for Drive callback URLs.

## Vercel deployment steps

1. Push to GitHub.
2. Create a Vercel project connected to this repo.
3. Add the required environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL`
4. Add optional environment variables for Drive/OCR/OpenAI as needed.
5. Deploy.

## Post-deployment testing

- Confirm the root page loads successfully.
- Confirm `/login` renders without errors.
- Confirm Google sign-in button is visible.
- Confirm Supabase diagnostics report configured status.
- Confirm Drive diagnostics report local fallback or connected provider state based on configuration.
- Confirm uploads and document workflows work as expected.
- Confirm no `.env.local`, `.next/`, `node_modules/`, or `*.tsbuildinfo` files are tracked.

## Notes

- The app currently uses a local enterprise drive fallback when Google Drive credentials are not configured.
- `OPENAI_API_KEY` and `GOOGLE_CLOUD_VISION_API_KEY` are optional integrations.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is currently used for frontend feature gating but the actual auth login flow is handled by Supabase.
