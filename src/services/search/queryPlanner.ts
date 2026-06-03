import { normalizeSearchText } from "./filters";

export interface QueryPlan {
  normalizedQuery: string;
  tokens: string[];
  departmentHint?: string;
}

export function createQueryPlan(query: string): QueryPlan {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  let departmentHint: string | undefined;
  if (normalizedQuery.includes("hr")) {
    departmentHint = "hr";
  } else if (normalizedQuery.includes("finance")) {
    departmentHint = "finance";
  } else if (normalizedQuery.includes("team")) {
    departmentHint = "operations";
  }

  return {
    normalizedQuery,
    tokens,
    departmentHint,
  };
}
