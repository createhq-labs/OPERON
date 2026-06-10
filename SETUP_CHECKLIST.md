# Operon — Complete Setup Checklist

Everything you need to deploy a production-ready Operon instance.

## Phase 1: Local Development Setup (30 mins)

### Clone & Install
- [ ] Clone repository
- [ ] Run `npm install`
- [ ] Copy `.env.example` to `.env.local`

### Google Cloud Setup
- [ ] Create Google Cloud Project
- [ ] Enable Google Drive API
- [ ] Create OAuth 2.0 credentials (Web Application)
- [ ] Add `http://localhost:3000` as authorized origin
- [ ] Add `http://localhost:3000/api/drive/oauth-callback` as redirect URI
- [ ] Copy Client ID and Client Secret to `.env.local`

### Environment Variables
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Get from Supabase
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Get from Supabase
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Get from Supabase
- [ ] `GOOGLE_DRIVE_CLIENT_ID` — From Google Cloud Console
- [ ] `GOOGLE_DRIVE_CLIENT_SECRET` — From Google Cloud Console
- [ ] `NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK` — `http://localhost:3000/api/drive/oauth-callback`
- [ ] `GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL` — `http://localhost:3000/api/drive/webhook`
- [ ] `DRIVE_TOKEN_ENCRYPTION_KEY` — Run `openssl rand -hex 32`
- [ ] `JWT_SECRET` — Run `openssl rand -base64 32`

### Supabase Setup
- [ ] Create Supabase project
- [ ] Run database migrations: `supabase migration up`
- [ ] Verify tables created: `supabase db pull`
- [ ] Enable Row-Level Security on all tables

### Local Testing
- [ ] Run `npm run dev`
- [ ] Visit http://localhost:3000
- [ ] Test OAuth flow manually
- [ ] Verify no errors in console

## Phase 2: Production Infrastructure (1-2 days)

### Choose Hosting Provider
- [ ] Vercel (recommended) — Zero-config Next.js deployment
- [ ] AWS — Full control, requires configuration
- [ ] Docker — Self-hosted, on-premise option

### Domain & SSL
- [ ] Register domain (or use existing)
- [ ] Configure DNS records
- [ ] SSL certificate (usually automatic with Vercel)

### Create Production Google OAuth
- [ ] Go to Google Cloud Console
- [ ] Update OAuth Consent Screen (change from "Testing" to "Production")
- [ ] Add company logo and privacy policy
- [ ] Add authorized origins: `https://your-domain.com`
- [ ] Add redirect URI: `https://your-domain.com/api/drive/oauth-callback`
- [ ] Publish OAuth app

### Production Database
- [ ] Create production Supabase project (separate from staging)
- [ ] Apply all migrations to production
- [ ] Configure automated backups
- [ ] Set up read replicas for scaling
- [ ] Enable encryption at rest

### Production Environment Variables
- [ ] All variables from Phase 1
- [ ] Update URLs to production domain
- [ ] Use production Google OAuth credentials
- [ ] Generate new encryption and JWT keys
- [ ] Store in secure vault (not in code)

## Phase 3: Webhook Setup (1 hour)

### Configure Webhook Endpoint
- [ ] Ensure production domain is public HTTPS
- [ ] Test webhook endpoint accessibility
- [ ] Set `GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL` environment variable

### Request Initial Webhook
- [ ] User completes OAuth flow
- [ ] Folder structure auto-created in Drive
- [ ] Initial webhook requested automatically
- [ ] Verify in Drive folder notifications (optional)

### Webhook Renewal
- [ ] Set up daily cron job to renew webhooks
- [ ] Or implement on-demand renewal
- [ ] Monitor for expired webhooks

## Phase 4: Testing & Validation (2-4 hours)

### OAuth Flow Testing
- [ ] User successfully authenticates
- [ ] Google Drive folder structure created
- [ ] User permissions applied correctly
- [ ] Redirect back to app works

### File Upload Testing
- [ ] Upload file from Operon
- [ ] File appears in Drive
- [ ] Metadata stored in Supabase
- [ ] Search index created
- [ ] Correct folder assignment

### Real-Time Sync Testing
- [ ] Upload file via Operon
- [ ] Modify file in Drive directly
- [ ] Changes appear in Operon
- [ ] Rename file in Drive
- [ ] Update reflects in Operon
- [ ] Delete file in Drive
- [ ] Status updated in Operon

### Search Testing
- [ ] Create multiple documents
- [ ] Search for document by title
- [ ] Search for document by content
- [ ] Permissions respected in search
- [ ] Ranking by relevance

### Permission Testing
- [ ] Test each role has correct access
- [ ] User cannot access forbidden documents
- [ ] Search respects permissions
- [ ] Activity log tracks correctly

## Phase 5: Monitoring & Operations (Ongoing)

### Error Tracking
- [ ] Set up Sentry for error monitoring
- [ ] Configure alerts for error rates > 1%
- [ ] Test error notification

### Performance Monitoring
- [ ] Set up performance metrics
- [ ] Monitor API latency
- [ ] Track page load times
- [ ] Monitor database query times

### Uptime Monitoring
- [ ] Set up uptime monitoring
- [ ] Configure alerting for downtime
- [ ] Test alert notifications

### Logging
- [ ] Centralize application logs
- [ ] Set up log retention policy
- [ ] Create useful dashboards
- [ ] Test log search

### Backup & Disaster Recovery
- [ ] Enable automated database backups
- [ ] Test backup restoration
- [ ] Document recovery procedure
- [ ] Schedule backup verification

## Phase 6: Security Hardening (2-4 hours)

### Application Security
- [ ] Enable security headers
- [ ] Configure CORS properly
- [ ] Implement rate limiting
- [ ] Enable CSRF protection
- [ ] Validate all inputs
- [ ] Escape output properly

### Data Security
- [ ] All Drive tokens encrypted
- [ ] Secrets not in logs
- [ ] HTTPS enforced
- [ ] Database backups encrypted
- [ ] Access logs maintained

### API Security
- [ ] API keys secured
- [ ] Webhook signatures verified
- [ ] OAuth state parameter used
- [ ] Sensitive endpoints protected
- [ ] Audit all API access

### Audit & Compliance
- [ ] Document security measures
- [ ] Perform security audit
- [ ] Fix identified issues
- [ ] Document compliance checklist

## Phase 7: Team Training (1-2 hours)

### Admin Training
- [ ] How to manage users
- [ ] How to configure roles
- [ ] How to monitor system
- [ ] How to handle incidents
- [ ] Where to find logs

### User Training
- [ ] How to upload documents
- [ ] How to search
- [ ] How to share documents
- [ ] How to manage permissions
- [ ] Support contact info

### Documentation
- [ ] Create admin handbook
- [ ] Create user guide
- [ ] Document procedures
- [ ] Create runbooks
- [ ] Maintain FAQ

## Phase 8: Launch (4 hours)

### Pre-Launch Checklist
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Security audit complete
- [ ] Documentation complete
- [ ] Team trained
- [ ] Backup tested
- [ ] Monitoring active
- [ ] Support plan ready

### Launch Steps
- [ ] Final production test
- [ ] Enable monitoring & alerts
- [ ] Announce to team
- [ ] Monitor closely first 24 hours
- [ ] Address any issues immediately

### Post-Launch
- [ ] Gather feedback
- [ ] Fix reported issues
- [ ] Optimize based on usage
- [ ] Plan improvements
- [ ] Schedule retrospective

## Continuous Maintenance

### Daily
- [ ] Monitor error rates
- [ ] Check webhook delivery
- [ ] Verify backups completed
- [ ] Review security alerts

### Weekly
- [ ] Review performance metrics
- [ ] Check for failed webhooks
- [ ] Update security patches
- [ ] Review access logs
- [ ] Renew SSL certificates (if needed)

### Monthly
- [ ] Performance analysis
- [ ] Security audit
- [ ] Backup verification
- [ ] Capacity planning
- [ ] Cost analysis

### Quarterly
- [ ] Full system audit
- [ ] Disaster recovery test
- [ ] Security penetration test
- [ ] Capacity planning
- [ ] Roadmap planning

## Key Contacts

- **Supabase Support**: support@supabase.io
- **Google Cloud Support**: support@google.com
- **Vercel Support**: support@vercel.com
- **Your DevOps Team**: [your-team-email]
- **On-Call Engineer**: [rotation]

## Important Documents

Keep these accessible:
- [README.md](README.md) — Platform overview
- [ARCHITECTURE.md](ARCHITECTURE.md) — Technical design
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — Deployment steps
- [DRIVE_SETUP_GUIDE.md](DRIVE_SETUP_GUIDE.md) — Drive integration
- [DRIVE_OAUTH_GUIDE.md](DRIVE_OAUTH_GUIDE.md) — OAuth setup
- [DRIVE_WEBHOOK_GUIDE.md](DRIVE_WEBHOOK_GUIDE.md) — Webhooks
- [ENV_VARIABLES_GUIDE.md](ENV_VARIABLES_GUIDE.md) — Configuration
- [DRIVE_FOLDER_STRUCTURE_GUIDE.md](DRIVE_FOLDER_STRUCTURE_GUIDE.md) — Folder organization

## Quick Reference

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Database
```bash
supabase migration up
supabase db pull
```

### Type Checking
```bash
npm run type-check
npm run lint
```

## Timeline Estimate

| Phase | Duration | Start Date | End Date |
|-------|----------|-----------|----------|
| Phase 1 (Local Setup) | 30 min | - | - |
| Phase 2 (Infrastructure) | 1-2 days | - | - |
| Phase 3 (Webhooks) | 1 hour | - | - |
| Phase 4 (Testing) | 2-4 hours | - | - |
| Phase 5 (Monitoring) | 2-4 hours | - | - |
| Phase 6 (Security) | 2-4 hours | - | - |
| Phase 7 (Training) | 1-2 hours | - | - |
| Phase 8 (Launch) | 4 hours | - | - |
| **Total** | **5-10 days** | - | - |

## Success Criteria

✅ **Operon is ready when:**

1. **Technical**
   - [ ] Application accessible at domain
   - [ ] OAuth works end-to-end
   - [ ] Files upload to Drive
   - [ ] Real-time sync operational
   - [ ] Search works correctly
   - [ ] Permissions enforced
   - [ ] Errors tracked
   - [ ] Performance targets met

2. **Operational**
   - [ ] Backups automated and tested
   - [ ] Monitoring active
   - [ ] Alerts configured
   - [ ] Logs centralized
   - [ ] Disaster recovery documented
   - [ ] Support process defined

3. **Security**
   - [ ] All data encrypted
   - [ ] Secrets not in code
   - [ ] HTTPS enforced
   - [ ] Rate limiting enabled
   - [ ] Audit logs maintained
   - [ ] Security policy documented

4. **Team Readiness**
   - [ ] Admins trained
   - [ ] Users trained
   - [ ] Documentation complete
   - [ ] Support plan ready
   - [ ] Escalation procedures defined
   - [ ] Incident response plan tested

---

## Need Help?

Refer to:
- Specific phase guides above
- Detailed documentation for each component
- Architecture overview
- Troubleshooting sections in deployment guide

**Current Status**: Ready for deployment ✅

For the latest updates and issues, check the GitHub repository.
