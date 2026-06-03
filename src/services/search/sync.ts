import { invalidateSearchCache } from "./cache";

let searchIndexVersion = 0;

export function markSearchIndexDirty() {
  searchIndexVersion += 1;
  invalidateSearchCache();
}

export function getSearchIndexVersion() {
  return searchIndexVersion;
}
