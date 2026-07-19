import { workforceRpc } from "./client";
import type { UUID, WorkforceNotification } from "./types";
export const myNotifications = (unreadOnly = false, limit = 30, offset = 0) => workforceRpc<WorkforceNotification[]>("my_notifications", { p_unread_only: unreadOnly, p_limit: limit, p_offset: offset });
export const unreadNotificationCount = () => workforceRpc<number>("my_unread_notification_count");
export const markNotificationRead = (recipientId: UUID) => workforceRpc("mark_notification_read", { p_notification_recipient_id: recipientId });
export const markAllNotificationsRead = () => workforceRpc("mark_all_notifications_read");
