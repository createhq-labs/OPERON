import { normalizeSearchText } from "./filters";

export function tokenizeText(value: string) {
  return normalizeSearchText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function joinSearchText(...values: Array<string | undefined>) {
  return normalizeSearchText(values.filter(Boolean).join(" ")).trim();
}
