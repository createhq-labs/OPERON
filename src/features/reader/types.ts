import type { Block } from "@/core/types";

export type SectionLayoutId =
  | "narrow-column"
  | "split"
  | "full-width-statement"
  | "numbered-process"
  | "editorial-table"
  | "image-led"
  | "checklist"
  | "quote"
  | "gallery"
  | "timeline"
  | "feature-cards";

export interface DocumentSection {
  id: string;
  /** The level-1 heading block that titles this section, or null for content before the first heading. */
  headingBlock: Block | null;
  /** Every block belonging to this section, heading included. */
  blocks: Block[];
  layout: SectionLayoutId;
}
