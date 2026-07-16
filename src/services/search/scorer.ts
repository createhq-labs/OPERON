import type { SearchEntry } from "./types";

export function computeHeadingScore<T>(entry: SearchEntry<T>, query: string): number {
  if (!query) return 0;
  const normalized = query.toLowerCase();
  const title      = entry.title.toLowerCase();
  if (title === normalized)          return 1;
  if (title.includes(normalized))    return 0.65;
  return 0;
}

export function computeMetadataScore<T>(entry: SearchEntry<T>, query: string): number {
  if (!query) return 0;
  const normalized  = query.toLowerCase();
  const tagMatch    = entry.tags.some((tag) => tag.toLowerCase().includes(normalized));
  const authorMatch = entry.authorId?.toLowerCase().includes(normalized) ?? false;
  return (tagMatch ? 0.35 : 0) + (authorMatch ? 0.2 : 0);
}

export function computeTypeaheadScore<T>(entry: SearchEntry<T>, query: string): number {
  if (!query) return 0;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const content  = entry.content.toLowerCase();
  const matching = words.filter(
    (token) => content.startsWith(token) || content.includes(` ${token}`)
  );
  return Math.min(1, matching.length / words.length);
}