# Environment Variables - Complete Reference

All environment variables required for Operon with Google Drive integration.

## File: `.env.local`

### Supabase Configuration

```env
# Supabase API
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### Google Drive OAuth

```env
# OAuth Credentials (from Google Cloud Console)
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret

# OAuth Callback URL
# Development: http://localhost:3000/api/drive/oauth-callback
# Production: https://your-domain.com/api/drive/oauth-callback
NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK=http://localhost:3000/api/drive/oauth-callback
```

### Webhook Configuration

```env
# Webhook callback for Drive change notifications
# Must be publicly accessible HTTPS URL
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=http://localhost:3000/api/drive/webhook

# Webhook verification (optional, for added security)
GOOGLE_DRIVE_WEBHOOK_SECRET=your-webhook-secret-key
```

### Security & Encryption

```env
# Token encryption key (64-character hex string)
# Generate with: openssl rand -hex 32
DRIVE_TOKEN_ENCRYPTION_KEY=your-64-char-encryption-key

# JWT Secret for session management
JWT_SECRET=your-jwt-secret-key
```

### Application Configuration

```env
# Environment
NODE_ENV=development

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Features
NEXT_PUBLIC_ENABLE_DRIVE_INTEGRATION=true
NEXT_PUBLIC_ENABLE_REAL_TIME_SYNC=true
NEXT_PUBLIC_ENABLE_WEBHOOKS=true
```

### Optional: Analytics & Monitoring

```env
# Error tracking (optional)
SENTRY_DSN=your-sentry-dsn
NEXT_PUBLIC_SENTRY_ENV=development

# Analytics (optional)
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

## Development vs Production

### Development (.env.local)

```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK=http://localhost:3000/api/drive/oauth-callback
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=http://localhost:3000/api/drive/webhook
```

### Production (.env.production)

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK=https://your-domain.com/api/drive/oauth-callback
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=https://your-domain.com/api/drive/webhook
```

## Security Best Practices

1. **Never commit secrets to git**
   - Add `.env.local` to `.gitignore`
   - Use `.env.example` for template

2. **Secure token encryption key**
   - Generate unique key per environment
   - Store in secure vault (not source code)
   - Rotate periodically

3. **OAuth credentials**
   - Keep client secret truly secret
   - Only store in backend environment
   - Use restricted API keys

4. **Webhook security**
   - Use HTTPS only in production
   - Verify webhook signatures
   - Implement request validation

5. **Database credentials**
   - Use service role key only on backend
   - Anon key safe to expose to client
   - Rotate keys periodically

## How to Generate Required Keys

### Encryption Key
```bash
# Generate 64-character hex string
openssl rand -hex 32
```

### JWT Secret
```bash
# Generate random string
openssl rand -base64 32
```

### Webhook Secret (optional)
```bash
# Generate webhook verification secret
openssl rand -hex 32
```

## Validation

Check your configuration:

```bash
# Validate Supabase connection
npm run validate:supabase

# Validate Google Drive setup
npm run validate:drive

# Full validation
npm run validate:env
```

## Troubleshooting

### "Supabase connection failed"
- Verify NEXT_PUBLIC_SUPABASE_URL is correct
- Check NEXT_PUBLIC_SUPABASE_ANON_KEY is valid
- Ensure network access to Supabase

### "Google OAuth failed"
- Verify GOOGLE_DRIVE_CLIENT_ID matches Cloud Console
- Check GOOGLE_DRIVE_CLIENT_SECRET is correct
- Confirm redirect URI matches exactly

### "Webhook not triggering"
- Verify GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL is public
- Check URL is HTTPS in production
- Ensure firewall allows external connections

### "Encryption failed"
- Verify DRIVE_TOKEN_ENCRYPTION_KEY is 64 characters
- Check key is hex format (0-9, a-f only)
- Ensure key matches across deployments

## Environment Variables Template (.env.example)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Google Drive OAuth
GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK=http://localhost:3000/api/drive/oauth-callback

# Webhooks
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=http://localhost:3000/api/drive/webhook
GOOGLE_DRIVE_WEBHOOK_SECRET=your-webhook-secret

# Security
DRIVE_TOKEN_ENCRYPTION_KEY=your-64-char-encryption-key
JWT_SECRET=your-jwt-secret-key

# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_DRIVE_INTEGRATION=true
NEXT_PUBLIC_ENABLE_REAL_TIME_SYNC=true
```

## Production Deployment Checklist

- [ ] All required environment variables set
- [ ] Secrets stored in deployment platform (not .env files)
- [ ] OAuth redirect URI updated in Google Cloud Console
- [ ] Webhook URL is publicly accessible HTTPS
- [ ] Database migrations completed
- [ ] Encryption key securely stored
- [ ] Backups configured
- [ ] Monitoring and alerts enabled
- [ ] Security headers configured
- [ ] Rate limiting enabled

## Verifying Configuration

```bash
# Start development server
npm run dev

# Check for configuration warnings
npm run build

# Validate environment
npm run validate:env
```

If all validations pass, your Operon instance is ready for use!
