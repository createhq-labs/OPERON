import type { SearchEntry } from "./types";
import type { SearchOptions } from "./types";
import { semanticScore } from "./semanticRanker";
import { computeHeadingScore, computeMetadataScore, computeTypeaheadScore } from "./scorer";

const TITLE_WEIGHT = 40;
const TAG_WEIGHT = 20;
const DEPARTMENT_WEIGHT = 10;
const RECENCY_WEIGHT = 8;
const PINNED_WEIGHT = 22;
const EXACT_MATCH_BONUS = 25;
const SEMANTIC_WEIGHT = 18;
const HEADING_WEIGHT = 18;
const METADATA_WEIGHT = 12;
const TYPEAHEAD_WEIGHT = 10;

export function rankSearchEntry<T>(entry: SearchEntry<T>, query: string, options?: SearchOptions) {
  const normalizedQuery = query.toLowerCase().trim();
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const content = entry.content.toLowerCase();
  let score = 0;

  if (title === normalizedQuery && normalizedQuery) {
    score += TITLE_WEIGHT + EXACT_MATCH_BONUS;
  }

  if (title.includes(normalizedQuery) && normalizedQuery) {
    score += TITLE_WEIGHT;
  }

  if (entry.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))) {
    score += TAG_WEIGHT;
  }

  if (description.includes(normalizedQuery)) {
    score += 8;
  }

  if (content.includes(normalizedQuery)) {
    score += 6;
  }

  score += computeHeadingScore(entry, normalizedQuery) * HEADING_WEIGHT;
  score += computeMetadataScore(entry, normalizedQuery) * METADATA_WEIGHT;
  score += computeTypeaheadScore(entry, normalizedQuery) * TYPEAHEAD_WEIGHT;
  score += semanticScore(entry, normalizedQuery) * (SEMANTIC_WEIGHT / 25);

  if (entry.pinned) {
    score += PINNED_WEIGHT;
  }

  if (options?.departmentId && options.departmentId !== "all" && options.departmentId === entry.departmentId) {
    score += DEPARTMENT_WEIGHT;
  }

  if (entry.updatedAt) {
    const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
    const recencyScore = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
    score += recencyScore * RECENCY_WEIGHT;
  }

  return score;
}
