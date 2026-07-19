import type { Document, ResourceItem, User } from "@/core/operon";
import { canViewDocument, canViewResource } from "@/core/operon";

export function filterVisibleDocuments(user: User, documents: Document[]) {
  return documents.filter((document) => canViewDocument(user, document));
}

export function filterVisibleResources(user: User, resources: ResourceItem[]) {
  return resources.filter((resource) => canViewResource(user, resource));
}
