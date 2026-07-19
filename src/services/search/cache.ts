const searchCache = new Map<string, unknown>();

export function invalidateSearchCache() {
  searchCache.clear();
}
