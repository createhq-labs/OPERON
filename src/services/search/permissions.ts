import type { Document, DriveDocumentReference, ResourceItem, User } from "@/core/operon";
import { canViewDocument, canViewDriveDocument, canViewResource } from "@/core/operon";

export function filterVisibleDocuments(user: User, documents: Document[]) {
  return documents.filter((document) => canViewDocument(user, document));
}

export function filterVisibleDriveDocuments(user: User, documents: DriveDocumentReference[]) {
  return documents.filter((document) => canViewDriveDocument(user, document));
}

export function filterVisibleResources(user: User, resources: ResourceItem[]) {
  return resources.filter((resource) => canViewResource(user, resource));
}
