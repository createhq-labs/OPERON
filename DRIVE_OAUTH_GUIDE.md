# Google Drive OAuth 2.0 Implementation Guide

Complete guide for implementing Google Drive OAuth 2.0 authentication in Operon.

## OAuth 2.0 Flow

```
User → Clicks "Connect Google Drive" 
  → Operon redirects to Google OAuth Consent Screen
  → User grants permission
  → Google redirects to Operon with authorization code
  → Operon exchanges code for access/refresh tokens
  → Tokens stored securely in Supabase
  → Folder structure created automatically
```

## Step 1: Create Google Cloud Project

### 1.1 Create Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Enter project name: `Operon`
4. Click "Create"

### 1.2 Enable Google Drive API

1. In Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click on it
4. Click "Enable"

## Step 2: Create OAuth 2.0 Credentials

### 2.1 Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth Consent Screen"
2. Select "External" → "Create"
3. Fill in required fields:
   - **App name**: Operon
   - **User support email**: your-email@company.com
   - **Developer contact**: your-email@company.com
4. Click "Save and Continue"
5. In "Scopes" section, click "Add or Remove Scopes"
6. Search for and add:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/drive.metadata.readonly`
7. Click "Save and Continue"
8. Review and click "Back to Dashboard"

### 2.2 Create OAuth 2.0 Client ID

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Choose "Web application"
4. Fill in:
   - **Name**: Operon Web Client
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (development)
     - `https://your-domain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/drive/oauth-callback`
     - `https://your-domain.com/api/drive/oauth-callback`
5. Click "Create"
6. Copy Client ID and Client Secret
7. Store in `.env.local`:
   ```env
   GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
   ```

## Step 3: Implement OAuth Endpoints

### 3.1 OAuth Initiation Endpoint

Create `/api/drive/oauth-init.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { GoogleDriveService } from "@/services/googleDrive";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID required" },
        { status: 400 }
      );
    }

    // Generate OAuth URL
    const oauthUrl = GoogleDriveService.getOAuthUrl(userId);

    return NextResponse.json({ oauthUrl });
  } catch (error) {
    console.error("OAuth init error:", error);
    return NextResponse.json(
      { error: "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}
```

### 3.2 OAuth Callback Endpoint

Create `/api/drive/oauth-callback.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { GoogleDriveService } from "@/services/googleDrive";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // userId
    const error = searchParams.get("error");

    // Handle user cancellation
    if (error) {
      return NextResponse.redirect(
        `/login?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `/login?error=${encodeURIComponent("Missing OAuth parameters")}`
      );
    }

    // Exchange code for tokens
    const driveService = new GoogleDriveService();
    const token = await driveService.exchangeOAuthCode(state, code);

    // Get access token
    const accessToken = await driveService.getValidAccessToken(state);

    // Initialize folder structure
    const folderIds = await driveService.initializeFolderStructure(accessToken);

    // Redirect to home with success
    return NextResponse.redirect("/home?drive-connected=true");
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `/login?error=${encodeURIComponent("OAuth exchange failed")}`
    );
  }
}
```

## Step 4: Frontend Implementation

### 4.1 Connect Button Component

```typescript
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "@/auth/useSession";

export function ConnectDriveButton() {
  const { user } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get OAuth URL from backend
      const response = await fetch("/api/drive/oauth-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id }),
      });

      const data = await response.json();

      if (!data.oauthUrl) {
        throw new Error("Failed to get OAuth URL");
      }

      // Redirect to Google OAuth
      window.location.href = data.oauthUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setLoading(false);
    }
  };

  return (
    <motion.button
      onClick={handleConnect}
      disabled={loading}
      className="btn btn-primary"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {loading ? "Connecting..." : "Connect Google Drive"}
    </motion.button>
  );
}
```

## Step 5: Token Management

### 5.1 Token Refresh

The service automatically refreshes tokens when needed:

```typescript
// Automatically handles refresh if expired
const accessToken = await driveService.getValidAccessToken(userId);
```

### 5.2 Token Storage Security

Tokens are encrypted before storage:

```typescript
// In Supabase:
// - access_token: encrypted
// - refresh_token: encrypted  
// - expires_at: timestamp
```

## Step 6: Testing OAuth Flow

### 6.1 Development Testing

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Navigate to login page
3. Click "Connect Google Drive"
4. Approve permissions on Google consent screen
5. You should be redirected back with "Drive Connected" message
6. Verify `user_drive_tokens` table has entry
7. Verify `drive_folder_mapping` table has 8 role folders

### 6.2 Test User Creation

For testing, create test user on Google:

1. Use Google test account
2. Easy to revoke permissions later
3. Can test disconnection flow

## Step 7: Handling Errors

### Common OAuth Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_client` | Wrong Client ID/Secret | Verify credentials in Google Cloud Console |
| `redirect_uri_mismatch` | URL doesn't match | Check URI in Cloud Console exactly matches |
| `access_denied` | User rejected permissions | Inform user to approve permissions |
| `invalid_code` | Code expired or invalid | Code expires in 10 minutes, retry |

### Error Handling Pattern

```typescript
try {
  const token = await driveService.exchangeOAuthCode(userId, code);
} catch (error) {
  if (error.message.includes("invalid_client")) {
    // OAuth credentials misconfigured
    console.error("Check Google Cloud Console credentials");
  } else if (error.message.includes("redirect_uri_mismatch")) {
    // Redirect URI doesn't match
    console.error("Check redirect URI configuration");
  } else {
    // Generic error
    console.error("OAuth failed:", error);
  }
}
```

## Step 8: Scope Permissions

Operon uses minimal required scopes:

```
https://www.googleapis.com/auth/drive.file
  → Create, read, update files created by Operon
  
https://www.googleapis.com/auth/drive.metadata.readonly
  → Read file metadata
```

These permissions:
- ✅ Allow full document management
- ❌ Don't grant access to other users' files
- ❌ Don't allow unrestricted Drive access

## Step 9: Production Setup

### 9.1 Update OAuth Consent Screen

For production, update with company info:

1. Go to "OAuth Consent Screen"
2. Change status from "Testing" to "Production"
3. Add company logo
4. Add privacy policy URL
5. Add terms of service URL

### 9.2 Update Authorized URIs

In Credentials, update OAuth client:

1. Add production domain:
   - `https://your-domain.com`
   - `https://your-domain.com/api/drive/oauth-callback`

2. Keep development URIs for testing:
   - `http://localhost:3000`
   - `http://localhost:3000/api/drive/oauth-callback`

### 9.3 Publish App

1. Go to "OAuth Consent Screen"
2. Click "Publish app"
3. Status changes to "In Production"
4. Users no longer see "Unverified app" warning

## Step 10: Troubleshooting

### "Invalid Client" Error

```bash
# Verify credentials are correct
echo "Client ID: $GOOGLE_DRIVE_CLIENT_ID"
echo "Client Secret: $GOOGLE_DRIVE_CLIENT_SECRET"

# Test credentials:
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$GOOGLE_DRIVE_CLIENT_ID&client_secret=$GOOGLE_DRIVE_CLIENT_SECRET&code=TEST&grant_type=authorization_code"
```

### "Redirect URI Mismatch"

Check exact match in Cloud Console:
```
Code in OAuth init: http://localhost:3000/api/drive/oauth-callback
Cloud Console URI: http://localhost:3000/api/drive/oauth-callback
                   ↑ Must match exactly, including protocol and port
```

### "Scope Not Granted"

Ensure scopes in Cloud Console match implementation:
```typescript
const scopes = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];
```

## Monitoring

Monitor OAuth usage in Google Cloud Console:

1. Go to "APIs & Services" → "Drive API"
2. Click "Metrics"
3. Check:
   - Total requests
   - Error rates
   - Response times

Set up alerts for:
- High error rate
- Quota exceeded
- Unusual access patterns

## Security Best Practices

1. **Client Secret**: Never expose to client-side code
2. **Token Storage**: Always encrypt before storing
3. **HTTPS Only**: Webhooks must use HTTPS
4. **Scope Minimization**: Only request needed scopes
5. **Token Expiration**: Implement refresh token rotation
6. **Error Messages**: Don't expose secrets in error logs

## Reference

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive API Guide](https://developers.google.com/drive/api/guides/about-sdk)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
