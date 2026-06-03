import type { SearchEntry, SearchResult, SearchOptions } from "./types";
import { createSearchFilter } from "./filters";
import { rankSearchEntry } from "./ranker";
import { createQueryPlan } from "./queryPlanner";

export function searchEntries<T>(entries: SearchEntry<T>[], query: string, options: SearchOptions = {}) {
  const queryPlan = createQueryPlan(query);
  const { cleanQuery, matchesDepartment } = createSearchFilter(queryPlan.normalizedQuery, options.departmentId);

  const scored = entries
    .filter((entry) => matchesDepartment(entry.departmentId))
    .map((entry) => ({
      entry,
      score: rankSearchEntry(entry, cleanQuery, options),
    }))
    .filter(({ score }) => score > 0 || cleanQuery.length === 0)
    .sort((left, right) => {
      if (options.sort === "updatedAt") {
        return Number(new Date(right.entry.updatedAt || 0)) - Number(new Date(left.entry.updatedAt || 0));
      }
      if (options.sort === "pinned") {
        return right.score - left.score || Number(new Date(right.entry.updatedAt || 0)) - Number(new Date(left.entry.updatedAt || 0));
      }
      return right.score - left.score;
    });

  return scored.map(({ entry, score }) => ({ ref: entry.ref, score }));
}
