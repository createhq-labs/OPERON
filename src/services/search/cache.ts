import type { SearchCacheKey } from "./types";

const searchCache = new Map<string, unknown>();

export function buildCacheKey(key: SearchCacheKey) {
  return [key.userId, key.roleId, key.query.trim().toLowerCase(), key.departmentId ?? "all", key.sort].join("|");
}

export function getCachedSearchResults<T>(key: string): T | undefined {
  return searchCache.get(key) as T | undefined;
}

export function setCachedSearchResults<T>(key: string, results: T) {
  searchCache.set(key, results);
}

export function invalidateSearchCache() {
  searchCache.clear();
}
