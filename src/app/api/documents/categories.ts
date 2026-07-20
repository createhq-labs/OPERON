import "server-only";
import type { SchemaDb } from "./db";
import type { DocTag } from "@/core/types";

const CATEGORY_NAMES: Record<DocTag, string> = {
  sop: "SOP",
  onboarding: "Onboarding",
  brand: "Brand",
  creator: "Creator",
  ops: "Operations",
  hr: "HR",
  internal: "Internal",
};

const _categoryIdCache = new Map<DocTag, string>();

/**
 * Finds or creates the workforce.document_categories row for a DocTag,
 * reusing the real (previously empty) table instead of a dedicated tag
 * column. Slug = the DocTag value itself, so lookups are stable even if
 * the display name changes later.
 */
export async function resolveCategoryId(db: SchemaDb, tag: DocTag): Promise<string> {
  const cached = _categoryIdCache.get(tag);
  if (cached) return cached;

  const { data: existing } = await db
    .from("document_categories")
    .select("id")
    .eq("slug", tag)
    .maybeSingle<{ id: string }>();

  if (existing) {
    _categoryIdCache.set(tag, existing.id);
    return existing.id;
  }

  const { data: created, error } = await db
    .from("document_categories")
    .insert({ name: CATEGORY_NAMES[tag] ?? tag, slug: tag })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) {
    throw new Error(`Failed to resolve document category "${tag}": ${error?.message ?? "unknown error"}`);
  }

  _categoryIdCache.set(tag, created.id);
  return created.id;
}

/** Reverse lookup for a single document (e.g. echoing back after an edit). */
export async function resolveCategoryTag(db: SchemaDb, categoryId: string | null): Promise<DocTag> {
  if (!categoryId) return "internal";
  const map = await getCategoryTagMap(db);
  return map.get(categoryId) ?? "internal";
}

/** Bulk id -> DocTag map for list views, avoiding one query per row. */
export async function getCategoryTagMap(db: SchemaDb): Promise<Map<string, DocTag>> {
  const { data } = await db.from("document_categories").select("id, slug").returns<Array<{ id: string; slug: string | null }>>();
  const map = new Map<string, DocTag>();
  for (const row of data ?? []) {
    if (row.slug && row.slug in CATEGORY_NAMES) {
      map.set(row.id, row.slug as DocTag);
    }
  }
  return map;
}
