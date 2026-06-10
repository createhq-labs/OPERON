# Google Drive Integration - Complete Setup Guide

This guide walks through setting up Google Drive as the document storage layer for Operon.

## Architecture

- **Google Drive**: Primary file storage (source of truth)
- **Supabase**: Metadata, search indexes, folder mappings
- **Operon UI**: Synchronized document access and management

## Prerequisites

1. Google Cloud Project with Drive API enabled
2. OAuth 2.0 credentials (OAuth client ID and secret)
3. Webhook callback URL (for real-time sync)
4. Encryption key for token storage

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project: "Operon"
3. Enable the Google Drive API:
   - Search for "Google Drive API"
   - Click "Enable"

## Step 2: Create OAuth 2.0 Credentials

1. In Cloud Console, go to "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Choose "Web Application"
4. Add authorized redirect URI:
   - Development: `http://localhost:3000/api/drive/oauth-callback`
   - Production: `https://your-domain.com/api/drive/oauth-callback`
5. Save your Client ID and Client Secret

## Step 3: Configure Environment Variables

In your `.env.local` file, add:

```env
# Google Drive OAuth
GOOGLE_DRIVE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret

# OAuth Callback URL
NEXT_PUBLIC_DRIVE_OAUTH_CALLBACK=http://localhost:3000/api/drive/oauth-callback

# Webhook Configuration
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=http://localhost:3000/api/drive/webhook

# Token Encryption
DRIVE_TOKEN_ENCRYPTION_KEY=your-secure-encryption-key-64-chars
```

### Generating Encryption Key

```bash
# Generate a 64-character hex string for token encryption
openssl rand -hex 32
```

## Step 4: Initialize Drive Folder Structure

After OAuth setup, the system automatically creates:

```
Operon/
├── Co-Founder/
├── HR/
├── Finance/
├── Team Lead/
├── Content Creator/
├── Employee Resources/
├── Intern Training/
└── Shared/
```

Each role's uploads automatically route to the corresponding folder.

## Step 5: Set Up Webhooks for Real-Time Sync

The webhook endpoint monitors Drive for changes:

- File uploads
- File deletions
- File renames
- Folder movements

Configure webhook in `.env.local`:

```env
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=https://your-domain.com/api/drive/webhook
```

The system uses this to detect changes and automatically:
- Update metadata in Supabase
- Refresh search indexes
- Update document previews
- Notify users of changes

## Step 6: Database Schema

Required Supabase tables:

```sql
-- Store Drive folder mappings
CREATE TABLE drive_folder_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id TEXT NOT NULL UNIQUE,
  folder_id TEXT NOT NULL,
  parent_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Store encrypted Drive tokens
CREATE TABLE user_drive_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Store document metadata with Drive file info
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  drive_file_id TEXT NOT NULL UNIQUE,
  drive_folder_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_type TEXT,
  file_size INT,
  drive_web_link TEXT,
  last_modified_in_drive TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Store search index for documents
CREATE TABLE document_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  full_text TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Step 7: API Endpoints

The system creates these endpoints:

### OAuth Callback
```
POST /api/drive/oauth-callback
```

Handles OAuth redirect from Google.

### Webhook Receiver
```
POST /api/drive/webhook
```

Receives real-time change notifications from Drive.

### File Upload
```
POST /api/drive/upload
Body: { file: File, roleId: string }
```

Uploads file to Google Drive and stores metadata in Supabase.

## Step 8: Testing

### Test OAuth Flow
1. User clicks "Connect Google Drive"
2. Redirected to Google OAuth
3. User grants permission
4. Redirected back with access token
5. Folder structure automatically created

### Test File Upload
1. User selects file to upload
2. System uploads to Drive
3. Metadata stored in Supabase
4. Search index updated
5. File appears in library immediately

### Test Real-Time Sync
1. Upload file through Operon
2. Move/rename file in Drive
3. Changes sync to Operon automatically
4. Search index updates

## Production Deployment

### Pre-Deployment Checklist

- [ ] OAuth credentials configured
- [ ] All environment variables set
- [ ] Database schema migrated
- [ ] Webhook URL publicly accessible
- [ ] SSL certificate for HTTPS
- [ ] Encryption key securely stored

### Deploy to Production

1. Update OAuth redirect URI in Google Cloud Console
2. Set production environment variables
3. Update webhook callback URL
4. Deploy code to production
5. Test OAuth flow
6. Test file upload and sync
7. Monitor webhook logs

### Monitoring

Check logs for:
- OAuth failures
- Upload errors
- Webhook delivery failures
- Token refresh issues

## Troubleshooting

### "Drive folder not configured for role"
- Ensure OAuth setup completed successfully
- Check drive_folder_mapping table is populated
- Verify folder IDs exist in Google Drive

### "Failed to exchange OAuth code"
- Check Client ID and Client Secret are correct
- Verify redirect URI matches exactly in Google Cloud Console
- Clear browser cookies and try again

### "Webhook not receiving events"
- Ensure webhook URL is publicly accessible
- Check firewall allows Google's IP ranges
- Verify webhook is still active (expires after 24 hours)

### "Token refresh failed"
- User needs to re-authenticate
- Check encryption key is correct
- Verify refresh token exists in database

## Security Considerations

1. **Token Storage**: All tokens encrypted with DRIVE_TOKEN_ENCRYPTION_KEY
2. **OAuth**: Uses Google's secure OAuth 2.0 flow
3. **Permissions**: Limited to files created by Operon
4. **Webhook Verification**: Verify Google's signature on webhook events
5. **Rate Limiting**: Implement rate limiting on API endpoints

## API Documentation

### GoogleDriveService

```typescript
// Initialize OAuth flow
GoogleDriveService.getOAuthUrl(userId: string): string

// Exchange OAuth code for token
driveService.exchangeOAuthCode(userId: string, code: string): DriveAuthToken

// Create folder structure
driveService.initializeFolderStructure(accessToken: string): Record<string, string>

// Upload file
driveService.uploadFile(
  file: File,
  roleId: string,
  accessToken: string,
  metadata?: Record<string, any>
): DriveFile

// Delete file
driveService.deleteFile(fileId: string, accessToken: string): void

// Rename file
driveService.renameFile(fileId: string, newName: string, accessToken: string): void

// Move file
driveService.moveFile(fileId: string, targetFolderId: string, accessToken: string): void

// Get file metadata
driveService.getFileMetadata(fileId: string, accessToken: string): DriveFile

// Set up webhook
driveService.setupWebhook(accessToken: string, callbackUrl: string): string

// Handle webhook events
driveService.handleWebhookEvent(channelId: string, channelToken: string): DriveSyncEvent[]
```

## Next Steps

1. Complete all setup steps
2. Test OAuth flow
3. Test file uploads
4. Deploy to production
5. Monitor webhook events
6. Set up alerts for sync failures

For support, refer to:
- [Google Drive API Documentation](https://developers.google.com/drive/api)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
