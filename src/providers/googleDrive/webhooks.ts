import { getGoogleDriveClient } from "@/services/googleDriveClient";

export interface GoogleDriveWebhookRegistration {
  channelId: string;
  resourceId: string;
  endpoint: string;
  expiresAt: string;
  active: boolean;
}

export interface GoogleDriveWebhookRegistrationOptions {
  /**
   * Publicly accessible HTTPS endpoint that Google will POST change events to.
   * Must be verified with Google Search Console or via domain verification.
   */
  endpoint: string;
  /**
   * How long the channel should remain active, in milliseconds.
   * Google caps this at 7 days (604800000 ms). Defaults to 24 hours.
   */
  ttlMs?: number;
  /** Valid Google OAuth access token for the Drive account. */
  accessToken: string;
}

export async function registerDriveWebhookChannel(
  options: GoogleDriveWebhookRegistrationOptions
): Promise<GoogleDriveWebhookRegistration> {
  const { endpoint, ttlMs = 24 * 60 * 60 * 1000, accessToken } = options;
  const client = getGoogleDriveClient(accessToken);
  const channelId = `operon-${Date.now()}`;
  const expirationMs = Date.now() + ttlMs;

  const response = await client.files.watch({
    fileId: "root",
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: endpoint,
      expiration: String(expirationMs),
    },
  });

  const { id, resourceId, expiration } = response.data;

  return {
    channelId: id ?? channelId,
    resourceId: resourceId ?? "",
    endpoint,
    expiresAt: expiration ? new Date(Number(expiration)).toISOString() : new Date(expirationMs).toISOString(),
    active: true,
  };
}

export async function stopDriveWebhookChannel(
  channelId: string,
  resourceId: string,
  accessToken: string
): Promise<void> {
  const client = getGoogleDriveClient(accessToken);
  await client.channels.stop({
    requestBody: { id: channelId, resourceId },
  });
}