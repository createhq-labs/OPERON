import { workforceRpc } from "./client";
import type { SearchResult, UUID } from "./types";
export interface SearchOptions { query: string; contentType?: "document" | "resource"; categoryId?: UUID; tagId?: UUID; departmentId?: UUID; sort?: "relevance" | "newest"; limit?: number; offset?: number }
export const searchContent = (options: SearchOptions) => workforceRpc<SearchResult[]>("search_content", { p_query: options.query, p_content_type: options.contentType ?? null, p_category_id: options.categoryId ?? null, p_tag_id: options.tagId ?? null, p_department_id: options.departmentId ?? null, p_sort: options.sort ?? "relevance", p_limit: options.limit ?? 30, p_offset: options.offset ?? 0 });
