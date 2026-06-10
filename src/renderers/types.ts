// ─────────────────────────────────────────────────────────────────────────────
// Renderer-layer block types
//
// The renderer layer uses a "content-wrapper" convention where every block
// has a `type` discriminant and a `content` property that holds the block's
// data. This is distinct from the storage/domain Block types in @/core/types.
// ─────────────────────────────────────────────────────────────────────────────

export type VideoProvider = "loom" | "youtube" | "vimeo" | "google_drive";

export interface ChecklistItem {
  id: string;
  label: string;
  required?: boolean;
}

export interface StepItem {
  title: string;
  description: string;
}

export interface TimelineItem {
  period: string;
  title: string;
  description: string;
}

// ── Individual block types ────────────────────────────────────────────────────

export interface HeadingBlock {
  type: "heading" | "subheading";
  id?: string;
  content: string;
  anchorId?: string;
}

export interface ParagraphBlock {
  type: "paragraph";
  id?: string;
  content: string;
}

export interface AlertBlock {
  type: "warning" | "note" | "callout" | "success";
  id?: string;
  content: string;
  title?: string;
}

export interface ChecklistBlock {
  type: "checklist";
  id?: string;
  content: {
    title: string;
    items: ChecklistItem[];
  };
}

export interface StepsBlock {
  type: "steps" | "faq";
  id?: string;
  content: StepItem[];
}

export interface TableBlock {
  type: "table";
  id?: string;
  content: {
    headers: string[];
    rows: string[][];
  };
}

export interface TimelineBlock {
  type: "timeline";
  id?: string;
  content: {
    items: TimelineItem[];
  };
}

export interface ResourceBlock {
  type: "resource";
  id?: string;
  content: {
    title: string;
    description: string;
    href: string;
    external?: boolean;
  };
}

export interface VideoBlock {
  type: "video";
  id?: string;
  content: {
    title: string;
    description: string;
    provider: VideoProvider;
    embedUrl: string;
    thumbnail?: string;
    transcript?: string;
    timestamps?: Array<{ label: string; seconds: number }>;
    relatedResourceIds?: string[];
  };
}

export interface DividerBlock {
  type: "divider";
  id?: string;
}

export type DocumentBlock =
  | HeadingBlock
  | ParagraphBlock
  | AlertBlock
  | ChecklistBlock
  | StepsBlock
  | TableBlock
  | TimelineBlock
  | ResourceBlock
  | VideoBlock
  | DividerBlock;
