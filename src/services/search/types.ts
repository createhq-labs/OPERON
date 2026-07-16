import type { DeptId } from "@/core/operon";

export type SearchSort = "relevance" | "updatedAt" | "pinned";

export interface SearchOptions {
  departmentId?: DeptId | "all";
  sort?: SearchSort;
}

export interface SemanticSearchChunk {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SearchEntry<T> {
  id: string;
  entityType: "document" | "drive" | "resource";
  ref: T;
  title: string;
  description: string;
  content: string;
  tags: string[];
  departmentId?: DeptId;
  updatedAt?: string;
  pinned: boolean;
  visibilityScope?: string;
  allowedRoleIds?: string[];
  allowedUserTypes?: string[];
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
  authorId?: string;
  semanticChunks?: SemanticSearchChunk[];
}

export interface SearchResult<T> {
  ref: T;
  score: number;
}

export interface SearchCacheKey {
  userId: string;
  roleId: string;
  query: string;
  departmentId?: DeptId | "all";
  sort: SearchSort;
}