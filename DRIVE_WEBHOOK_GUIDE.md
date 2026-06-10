# Google Drive Webhook Integration Guide

Real-time synchronization between Google Drive and Operon using webhooks.

## Webhook Architecture

```
Google Drive → Webhook Notification → Operon Endpoint → Process Event → Update Metadata
                                                                          ↓
                                                                      Update Search
                                                                          ↓
                                                                      Update Previews
                                                                          ↓
                                                                      Notify Users
```

## How Webhooks Work

1. **Watch Request**: Operon requests Google Drive to watch a folder
2. **Notification**: When files change, Google Drive sends HTTP notification
3. **Process**: Operon processes the change
4. **Update**: Metadata, search, and previews are updated
5. **Notify**: Real-time subscribers notified of changes

## Setup Webhooks

### 1. Configure Webhook Endpoint

The webhook endpoint should be:
- **URL**: `https://your-domain.com/api/drive/webhook`
- **Method**: POST
- **Public**: Accessible from Google's IP ranges
- **HTTPS**: Required for production

### 2. Request Webhook

After OAuth setup, request a watch on the Operon root folder:

```typescript
async function setupWebhook(accessToken: string) {
  const folderId = await getFolderIdByName("Operon", accessToken);
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}/watch?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "web_hook",
        address: "https://your-domain.com/api/drive/webhook",
        expiration: (Date.now() + 86400000).toString(), // 24 hours
      }),
    }
  );

  const data = await response.json();
  return data.id; // Save channel ID for renewal
}
```

### 3. Receive Notifications

Google Drive sends headers with each notification:

```
X-Goog-Channel-ID: channel-id
X-Goog-Channel-Token: channel-token
X-Goog-Channel-Expiration: 2024-01-01T00:00:00Z
X-Goog-Resource-ID: folder-id
X-Goog-Resource-URI: https://www.googleapis.com/drive/v3/files/folder-id
X-Goog-Change-Type: add|delete|update
```

### 4. Process Changes

```typescript
export async function POST(request: NextRequest) {
  // Get webhook metadata
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const changeType = request.headers.get("x-goog-change-type");

  // Get user's access token
  const userId = await getUserIdFromChannelId(channelId);
  const accessToken = await driveService.getValidAccessToken(userId);

  // Query Drive for what changed
  const changes = await queryDriveChanges(accessToken, resourceId);

  // Process each change
  for (const change of changes) {
    if (change.type === "add") {
      await handleFileAdded(change, userId);
    } else if (change.type === "delete") {
      await handleFileDeleted(change, userId);
    } else if (change.type === "update") {
      await handleFileUpdated(change, userId);
    }
  }

  // Acknowledge receipt
  return NextResponse.json({ received: true });
}
```

## Change Event Types

### File Added

When a file is uploaded to Drive:

```typescript
async function handleFileAdded(change: Change, userId: string) {
  // Get file metadata from Drive
  const file = await driveService.getFileMetadata(change.fileId, accessToken);

  // Store in Supabase
  await supabase.from("documents").insert({
    title: file.name,
    drive_file_id: file.id,
    drive_folder_id: file.folderId,
    role_id: await getRoleFromFolderId(file.folderId),
    uploaded_by: userId,
    file_type: file.mimeType,
    drive_web_link: file.webViewLink,
    last_modified_in_drive: file.modifiedTime,
  });

  // Generate preview
  await generatePreview(file);

  // Index for search
  await indexForSearch(file);

  // Notify real-time subscribers
  await notifySubscribers({
    type: "file:added",
    fileId: file.id,
    fileName: file.name,
  });
}
```

### File Updated

When a file is modified in Drive:

```typescript
async function handleFileUpdated(change: Change, userId: string) {
  // Get updated metadata
  const file = await driveService.getFileMetadata(change.fileId, accessToken);

  // Update in Supabase
  await supabase
    .from("documents")
    .update({
      last_modified_in_drive: file.modifiedTime,
      updated_at: new Date().toISOString(),
    })
    .eq("drive_file_id", file.id);

  // Regenerate preview
  await generatePreview(file);

  // Update search index
  await updateSearchIndex(file);

  // Notify subscribers
  await notifySubscribers({
    type: "file:updated",
    fileId: file.id,
    fileName: file.name,
  });
}
```

### File Deleted

When a file is deleted in Drive:

```typescript
async function handleFileDeleted(change: Change, userId: string) {
  // Mark as unavailable in Supabase
  await supabase
    .from("documents")
    .update({
      status: "unavailable",
      deleted_in_drive: true,
      deleted_at: new Date().toISOString(),
    })
    .eq("drive_file_id", change.fileId);

  // Remove from search index
  await removeFromSearchIndex(change.fileId);

  // Notify subscribers
  await notifySubscribers({
    type: "file:deleted",
    fileId: change.fileId,
  });
}
```

### File Moved

When a file is moved between folders in Drive:

```typescript
async function handleFileMoved(change: Change, userId: string) {
  // Get new location
  const file = await driveService.getFileMetadata(change.fileId, accessToken);

  // Get new role
  const newRole = await getRoleFromFolderId(file.folderId);

  // Update in Supabase
  await supabase
    .from("documents")
    .update({
      drive_folder_id: file.folderId,
      role_id: newRole,
      updated_at: new Date().toISOString(),
    })
    .eq("drive_file_id", file.id);

  // Notify subscribers
  await notifySubscribers({
    type: "file:moved",
    fileId: file.id,
    newRoleId: newRole,
  });
}
```

## Webhook Renewal

Webhooks expire after 24 hours. Implement renewal:

```typescript
// In a cron job or scheduled task
async function renewAllWebhooks() {
  // Get all active users
  const users = await getActiveUsers();

  for (const user of users) {
    try {
      const accessToken = await driveService.getValidAccessToken(user.id);
      await driveService.setupWebhook(
        accessToken,
        `https://your-domain.com/api/drive/webhook`
      );
    } catch (error) {
      console.error(`Failed to renew webhook for user ${user.id}`, error);
      // Alert admin
    }
  }
}

// Schedule daily at 2 AM
// In cron service or scheduled task
schedule("0 2 * * *", renewAllWebhooks);
```

## Handling Failures

### Webhook Delivery Failure

If webhook delivery fails:

```typescript
// 1. Google retries exponentially
// 2. After max retries, webhook stops
// 3. Implement fallback polling

async function pollForChanges(userId: string) {
  const lastSync = await getLastSyncTime(userId);
  const accessToken = await driveService.getValidAccessToken(userId);

  // Query Drive for changes since last sync
  const changes = await queryDriveChangesSince(lastSync, accessToken);

  // Process changes
  for (const change of changes) {
    await processChange(change, userId);
  }

  // Update last sync time
  await setLastSyncTime(userId, new Date());
}

// Run every 5 minutes as backup
schedule("*/5 * * * *", () => {
  getActiveUsers().forEach(pollForChanges);
});
```

### Processing Failures

Handle errors gracefully:

```typescript
async function processChangeWithRetry(
  change: Change,
  userId: string,
  retries = 3
) {
  try {
    await processChange(change, userId);
  } catch (error) {
    if (retries > 0) {
      // Exponential backoff
      const delay = Math.pow(2, 4 - retries) * 1000;
      setTimeout(
        () => processChangeWithRetry(change, userId, retries - 1),
        delay
      );
    } else {
      // Log and alert
      console.error(`Failed to process change after retries:`, error);
      await alertAdmin({
        type: "webhook:failed",
        userId,
        changeId: change.id,
        error: error.message,
      });
    }
  }
}
```

## Webhook Verification (Optional)

For added security, verify webhooks:

```typescript
import crypto from "crypto";

function verifyWebhookSignature(
  request: NextRequest,
  secret: string
): boolean {
  const signature = request.headers.get("x-webhook-signature");
  const body = await request.text();

  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return signature === `sha256=${hash}`;
}
```

## Monitoring Webhooks

Track webhook health:

```typescript
interface WebhookMetrics {
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  averageProcessingTime: number;
  lastReceivedAt: Date;
}

async function trackWebhookMetrics(
  channelId: string,
  success: boolean,
  processingTime: number
) {
  await supabase.from("webhook_metrics").insert({
    channel_id: channelId,
    success,
    processing_time_ms: processingTime,
    received_at: new Date().toISOString(),
  });
}
```

Create dashboard to monitor:

1. Webhook delivery rate
2. Processing time
3. Error rate
4. Recent changes
5. Stuck changes

## Testing Webhooks

### Local Testing

Use ngrok to expose local endpoint:

```bash
# Install ngrok
brew install ngrok

# Expose localhost
ngrok http 3000

# Update environment
GOOGLE_DRIVE_WEBHOOK_CALLBACK_URL=https://abc123.ngrok.io/api/drive/webhook

# Monitor
ngrok logs
```

### Simulate Changes

Create test files and monitor webhook:

```bash
# Monitor logs
tail -f logs/webhook.log

# Make changes in Drive:
# 1. Create file
# 2. Rename file
# 3. Move file
# 4. Delete file

# Verify each triggers webhook
```

## Production Monitoring

### Key Metrics

```sql
SELECT
  DATE_TRUNC('hour', received_at) as hour,
  COUNT(*) as total,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  AVG(processing_time_ms) as avg_time
FROM webhook_metrics
GROUP BY DATE_TRUNC('hour', received_at)
ORDER BY hour DESC
LIMIT 24;
```

### Alerts

Set alerts for:
- Webhook delivery failures
- High processing time (> 5s)
- Error rate exceeds threshold
- No webhooks received in 1 hour

## Troubleshooting

### "Webhook not triggering"

1. Verify URL is public HTTPS
2. Check firewall allows Google IPs
3. Verify webhook is active: check webhook_channels table
4. Check logs for errors
5. Try manual file change
6. Check Google Cloud activity logs

### "Webhook expired"

Check for gaps in received notifications:

```sql
SELECT
  LAG(received_at) OVER (ORDER BY received_at) as prev_time,
  received_at,
  EXTRACT(EPOCH FROM (received_at - LAG(received_at) OVER (ORDER BY received_at))) as gap_seconds
FROM webhook_metrics
WHERE gap_seconds > 300 -- 5 minutes
ORDER BY received_at DESC;
```

### "Duplicate Processing"

Implement idempotency:

```typescript
async function processChangeIdempotently(change: Change, userId: string) {
  // Check if already processed
  const existing = await supabase
    .from("processed_changes")
    .select("id")
    .eq("change_id", change.id)
    .eq("user_id", userId)
    .single();

  if (existing) return; // Already processed

  // Process
  await processChange(change, userId);

  // Mark as processed
  await supabase.from("processed_changes").insert({
    change_id: change.id,
    user_id: userId,
    processed_at: new Date().toISOString(),
  });
}
```

## Best Practices

1. **Acknowledge immediately**: Return 200 before processing
2. **Process asynchronously**: Use background jobs
3. **Implement retry logic**: Handle temporary failures
4. **Monitor delivery**: Track all webhooks
5. **Verify signatures**: Validate webhook authenticity
6. **Handle failures**: Never crash on bad data
7. **Implement idempotency**: Handle duplicate events
8. **Log everything**: Debug issues later
9. **Set timeouts**: Prevent hanging requests
10. **Test thoroughly**: Use staging environment

## Reference

- [Google Drive Push Notifications](https://developers.google.com/drive/api/guides/push-and-pull)
- [Webhook Best Practices](https://ngrok.com/blog/designing-robust-and-predictable-apis-with-webhooks/)
- [Change Notifications](https://developers.google.com/drive/api/guides/manage-changes)
