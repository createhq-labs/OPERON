import type { DeptId, Document, DriveDocumentReference, ResourceItem, User } from "@/core/operon";
import type { SearchOptions } from "./types";
import { buildDocumentIndex, buildDriveDocumentIndex, buildResourceIndex } from "./indexer";
import { searchEntries } from "./engine";
import { filterVisibleDocuments, filterVisibleDriveDocuments, filterVisibleResources } from "./permissions";
import { markSearchIndexDirty } from "./sync";
import { createFallbackQuery } from "./filters";

export function searchDocuments(user: User, documents: Document[], query = "", departmentId?: DeptId | "all", page = 1, limit = 20, sort: SearchOptions["sort"] = "pinned") {
  try {
    const visibleDocuments = filterVisibleDocuments(user, documents);
    const documentIndex = buildDocumentIndex(visibleDocuments);
    const results = searchEntries(documentIndex, query, { departmentId, sort });
    return results.slice((page - 1) * limit, page * limit).map((item) => item.ref);
  } catch (error) {
    return fallbackDocumentSearch(user, documents, query, departmentId, page, limit, sort);
  }
}

export function searchDriveDocuments(user: User, documents: DriveDocumentReference[], query = "", departmentId?: DeptId | "all", page = 1, limit = 20, sort: SearchOptions["sort"] = "pinned") {
  try {
    const visibleDocuments = filterVisibleDriveDocuments(user, documents);
    const documentIndex = buildDriveDocumentIndex(visibleDocuments);
    const results = searchEntries(documentIndex, query, { departmentId, sort });
    return results.slice((page - 1) * limit, page * limit).map((item) => item.ref);
  } catch (error) {
    return fallbackDriveDocumentSearch(user, documents, query, departmentId, page, limit, sort);
  }
}

export function searchResources(user: User, resources: ResourceItem[], query = "", category?: string, page = 1, limit = 20) {
  try {
    const visibleResources = filterVisibleResources(user, resources);
    const resourceIndex = buildResourceIndex(visibleResources);
    const results = searchEntries(resourceIndex, query, { sort: "relevance" });
    return results
      .filter((item) => !category || item.ref.category === category)
      .slice((page - 1) * limit, page * limit)
      .map((item) => item.ref);
  } catch (error) {
    return fallbackResourceSearch(user, resources, query, category, page, limit);
  }
}

export function invalidateSearchIndex() {
  markSearchIndexDirty();
}

function fallbackDocumentSearch(user: User, documents: Document[], query: string, departmentId?: DeptId | "all", page = 1, limit = 20, sort: SearchOptions["sort"] = "pinned") {
  const cleanQuery = createFallbackQuery(query);
  const visibleDocuments = filterVisibleDocuments(user, documents);
  const filtered = visibleDocuments.filter((document) => {
    if (!cleanQuery) return true;
    const haystack = [document.title, document.description, document.dept, document.tag, document.extractedText, document.author].join(" ").toLowerCase();
    return haystack.includes(cleanQuery);
  });

  const sorted = sortDocuments(filtered, sort);
  return sorted.slice((page - 1) * limit, page * limit);
}

function fallbackDriveDocumentSearch(user: User, documents: DriveDocumentReference[], query: string, departmentId?: DeptId | "all", page = 1, limit = 20, sort: SearchOptions["sort"] = "pinned") {
  const cleanQuery = createFallbackQuery(query);
  const visibleDocuments = filterVisibleDriveDocuments(user, documents);
  const filtered = visibleDocuments.filter((document) => {
    if (!cleanQuery) return true;
    const haystack = [document.title, document.description, document.dept, document.tag, document.author, document.driveUrl].join(" ").toLowerCase();
    return haystack.includes(cleanQuery);
  });

  const sorted = sortDocuments(filtered, sort);
  return sorted.slice((page - 1) * limit, page * limit);
}

function fallbackResourceSearch(user: User, resources: ResourceItem[], query: string, category?: string, page = 1, limit = 20) {
  const cleanQuery = createFallbackQuery(query);
  const visibleResources = filterVisibleResources(user, resources);
  const filtered = visibleResources.filter((resource) => {
    if (category && resource.category !== category) return false;
    if (!cleanQuery) return true;
    const haystack = [resource.title, resource.description, resource.category, resource.href].join(" ").toLowerCase();
    return haystack.includes(cleanQuery);
  });

  return filtered.slice((page - 1) * limit, page * limit);
}

function sortDocuments<T extends { pinned?: boolean; updatedAt?: string }>(items: T[], sort: SearchOptions["sort"] = "pinned") {
  return items.slice().sort((left, right) => {
    if (sort === "updatedAt") {
      return Number(new Date(right.updatedAt || 0)) - Number(new Date(left.updatedAt || 0));
    }
    return Number(!!right.pinned) - Number(!!left.pinned) || Number(new Date(right.updatedAt || 0)) - Number(new Date(left.updatedAt || 0));
  });
}
