export interface GoogleDriveWebhookRegistration {
  id: string;
  endpoint: string;
  createdAt: string;
  active: boolean;
}

export function registerWebhook(endpoint: string) {
  return {
    id: `webhook-${Date.now()}`,
    endpoint,
    createdAt: new Date().toISOString(),
    active: true,
  } as GoogleDriveWebhookRegistration;
}
