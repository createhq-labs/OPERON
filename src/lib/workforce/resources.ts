import { workforceRpc } from "./client";
import type { AccessibleResource, UUID } from "./types";
export const listAccessibleResources = (categoryId?: UUID, limit = 50, offset = 0) => workforceRpc<AccessibleResource[]>("list_accessible_resources", { p_category_id: categoryId ?? null, p_limit: limit, p_offset: offset });
export const archiveResource = (resourceId: UUID, reason: string) => workforceRpc("archive_resource", { p_resource_id: resourceId, p_reason: reason });
export const restoreResource = (resourceId: UUID, reason: string) => workforceRpc("restore_resource", { p_resource_id: resourceId, p_reason: reason });
export const notifyResourcePublished = (resourceId: UUID) => workforceRpc("notify_resource_published", { p_resource_id: resourceId });
