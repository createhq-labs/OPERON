import { getServiceAccountAccessToken } from "@/services/googleDriveServiceAccount";

export interface GoogleDriveWebhookRegistration {
  channelId: string;
  resourceId: string;
  endpoint: string;
  expiresAt: string;
  active: boolean;
}

export interface GoogleDriveWebhookRegistrationOptions {
  endpoint: string;
  ttlMs?: number;
}

export async function registerDriveWebhookChannel(
  options: GoogleDriveWebhookRegistrationOptions
): Promise<GoogleDriveWebhookRegistration> {
  const { endpoint, ttlMs = 24 * 60 * 60 * 1000 } = options;
  const accessToken = await getServiceAccountAccessToken();
  const channelId = `operon-${Date.now()}`;
  const expirationMs = Date.now() + ttlMs;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/root/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: endpoint,
        expiration: String(expirationMs),
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to register Drive webhook: ${err}`);
  }

  const data = await response.json() as {
    id?: string;
    resourceId?: string;
    expiration?: string;
  };

  return {
    channelId: data.id ?? channelId,
    resourceId: data.resourceId ?? "",
    endpoint,
    expiresAt: data.expiration
      ? new Date(Number(data.expiration)).toISOString()
      : new Date(expirationMs).toISOString(),
    active: true,
  };
}

export async function stopDriveWebhookChannel(
  channelId: string,
  resourceId: string
): Promise<void> {
  const accessToken = await getServiceAccountAccessToken();

  await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}