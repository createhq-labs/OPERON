# Operon Deployment Guide - Production Ready

Complete guide for deploying Operon to production with Google Drive integration.

## Pre-Deployment Checklist

### Code Quality
- [ ] All linting errors resolved: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in development
- [ ] TypeScript types all resolved: `npm run type-check`

### Configuration
- [ ] All environment variables configured
- [ ] Google Drive OAuth credentials set
- [ ] Encryption keys generated and stored
- [ ] Webhook URL publicly accessible
- [ ] Database migrations completed

### Database
- [ ] All migrations applied
- [ ] Backup created
- [ ] Row-level security policies enabled
- [ ] Indexes optimized
- [ ] Connection pooling configured

### Security
- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] CORS properly restricted
- [ ] Rate limiting enabled
- [ ] Authentication validated
- [ ] Secrets not in code

### Testing
- [ ] OAuth flow tested end-to-end
- [ ] File upload tested
- [ ] Role-based access tested
- [ ] Search functionality tested
- [ ] Real-time sync tested
- [ ] Error handling tested

## Deployment Steps

### 1. Prepare Repository

```bash
# Ensure clean state
git status

# Create production branch
git checkout -b production/v1.0.0

# Build for production
npm run build

# Run linter
npm run lint
```

### 2. Configure Hosting

Choose your hosting platform:

#### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Configuration in `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "regions": ["sfo1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase_anon_key",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase_service_role_key",
    "GOOGLE_DRIVE_CLIENT_ID": "@drive_client_id",
    "GOOGLE_DRIVE_CLIENT_SECRET": "@drive_client_secret",
    "DRIVE_TOKEN_ENCRYPTION_KEY": "@drive_encryption_key",
    "JWT_SECRET": "@jwt_secret"
  }
}
```

#### Option B: Docker

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build application
COPY . .
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Run as non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
```

Build and deploy:

```bash
docker build -t operon:latest .
docker tag operon:latest your-registry/operon:latest
docker push your-registry/operon:latest
```

#### Option C: AWS Amplify

```bash
# Install Amplify CLI
npm i -g @aws-amplify/cli

# Initialize
amplify init

# Add hosting
amplify add hosting

# Deploy
amplify publish
```

### 3. Configure Environment Variables

Set production environment variables in your hosting platform:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon_key_here
SUPABASE_SERVICE_ROLE_KEY=service_role_key_here

# Google Drive
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK=https://your-domain.com/api/drive/oauth-callback

# Webhooks
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=https://your-domain.com/api/drive/webhook

# Security
DRIVE_TOKEN_ENCRYPTION_KEY=your-64-char-encryption-key
JWT_SECRET=your-jwt-secret

# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_ENABLE_DRIVE_INTEGRATION=true
```

### 4. Update OAuth Credentials

In Google Cloud Console:

1. Go to Credentials
2. Edit OAuth 2.0 Client ID
3. Add production authorized URIs:
   - `https://your-domain.com`
   - `https://your-domain.com/api/drive/oauth-callback`
4. Save changes

### 5. Configure Security

#### Add Security Headers

Update `next.config.js`:

```javascript
module.exports = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
        ],
      },
    ];
  },
};
```

#### Enable CORS

In API routes, add CORS middleware:

```typescript
export function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigins = [
    "https://your-domain.com",
    "https://www.your-domain.com",
  ];

  if (allowedOrigins.includes(origin || "")) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
  }

  return {};
}
```

#### Configure Rate Limiting

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 h"),
});

export async function rateLimitCheck(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  return success;
}
```

### 6. Set Up Monitoring

#### Error Tracking (Sentry)

```bash
npm install @sentry/nextjs
```

Initialize in `sentry.client.config.js`:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

#### Performance Monitoring

```typescript
// pages/_app.tsx
import { Analytics } from "@vercel/analytics/react";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
```

### 7. Database Migration

```bash
# Run migrations
supabase migration up

# Verify
supabase db pull
```

### 8. Test Production Deployment

After deployment:

```bash
# Test OAuth flow
# 1. Visit https://your-domain.com
# 2. Click "Connect Google Drive"
# 3. Complete OAuth flow
# 4. Verify redirect back

# Test API endpoints
curl -X GET https://your-domain.com/api/health

# Test file upload
curl -X POST https://your-domain.com/api/drive/upload \
  -F "file=@test.pdf" \
  -H "Authorization: Bearer your-token"
```

### 9. Set Up Monitoring & Alerts

#### Logs

Monitor application logs:

```bash
# Vercel
vercel logs

# AWS Amplify
amplify logs

# Docker
docker logs operon
```

#### Alerts

Set up alerts for:
- High error rates
- Slow response times
- OAuth failures
- Webhook delivery failures
- Database connection errors

Example with PagerDuty:

```typescript
async function alertOnError(error: Error, context: string) {
  await fetch("https://events.pagerduty.com/v2/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routing_key: process.env.PAGERDUTY_ROUTING_KEY,
      event_action: "trigger",
      payload: {
        summary: `Operon Error: ${error.message}`,
        severity: "error",
        source: context,
        timestamp: new Date().toISOString(),
      },
    }),
  });
}
```

### 10. Performance Optimization

#### Cache Strategy

```typescript
// pages/api/documents/[id].ts
export const runtime = "nodejs";
export const revalidate = 3600; // 1 hour

export async function GET(request: NextRequest) {
  // Set cache headers
  const headers = new Headers({
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  });
  
  return new NextResponse(data, { headers });
}
```

#### Image Optimization

```typescript
import Image from "next/image";

<Image
  src="/operon-logo.png"
  alt="Operon"
  width={100}
  height={100}
  priority={false}
  placeholder="blur"
  blurDataURL="data:image/..."
/>
```

#### Bundle Analysis

```bash
npm install --save-dev @next/bundle-analyzer

# In next.config.js
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer(module.exports);

# Run analysis
ANALYZE=true npm run build
```

### 11. Backup Strategy

#### Database Backups

```bash
# Enable automated backups in Supabase
# Go to Settings → Backups

# Manual backup
pg_dump postgresql://user:password@host/operon > backup.sql

# Restore
psql postgresql://user:password@host/operon < backup.sql
```

#### File Backups

Google Drive automatically maintains versions, but also:

```bash
# Backup Operon config
git tag production/$(date +%Y%m%d)
git push origin production/$(date +%Y%m%d)
```

### 12. Post-Deployment

```bash
# Verify deployment
npm run build

# Check performance metrics
vercel analytics

# Monitor real-time logs
vercel logs --follow

# Test critical paths
# - User signup
# - OAuth flow
# - File upload
# - Document search
# - Real-time sync
```

## Rollback Plan

If issues occur:

```bash
# Rollback to previous version
git revert HEAD
git push origin main

# Redeploy
vercel --prod

# Check status
vercel deployments

# View logs
vercel logs
```

## Performance Targets

- **First Contentful Paint**: < 2s
- **Time to Interactive**: < 3.5s
- **Largest Contentful Paint**: < 2.5s
- **API Response Time**: < 200ms
- **Database Query Time**: < 100ms

## Production Monitoring Dashboard

Key metrics to monitor:

1. **Traffic**
   - Requests per minute
   - Unique users
   - Geographic distribution

2. **Performance**
   - Page load time
   - API latency
   - Error rates

3. **Infrastructure**
   - CPU usage
   - Memory usage
   - Disk space
   - Database connections

4. **Application**
   - OAuth success rate
   - Upload success rate
   - Search latency
   - Sync latency

## Support & Troubleshooting

### Common Production Issues

**"Google OAuth failing"**
- Verify production domain is in Google Cloud Console
- Check OAuth redirect URI exactly matches
- Clear browser cache and cookies

**"Database connection pooling"**
- Check connection limit
- Monitor active connections
- Implement connection pooling (PgBouncer)

**"High memory usage"**
- Check for memory leaks
- Profile with Chrome DevTools
- Optimize large queries
- Implement pagination

**"Webhook not triggering"**
- Verify webhook URL is public HTTPS
- Check firewall allows Google IPs
- Monitor webhook delivery in logs
- Set up webhook renewal cron job

## Emergency Contacts

- **Supabase Support**: support@supabase.io
- **Google Cloud Support**: https://cloud.google.com/support
- **Vercel Support**: support@vercel.com
- **Your DevOps**: your-team@your-domain.com

## Success Criteria

✅ Deployment complete when:

- [ ] Application accessible at production domain
- [ ] OAuth flow works end-to-end
- [ ] File uploads successful
- [ ] Real-time sync operational
- [ ] Search indexes populated
- [ ] Monitoring and alerts configured
- [ ] Team trained on systems
- [ ] Disaster recovery tested

Congratulations! Operon is now in production. 🚀
