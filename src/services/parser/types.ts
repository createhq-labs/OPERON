export type DocumentBlockType =
  | "heading"
  | "subheading"
  | "paragraph"
  | "warning"
  | "note"
  | "callout"
  | "success"
  | "checklist"
  | "steps"
  | "faq"
  | "table"
  | "timeline"
  | "resource"
  | "video"
  | "embed"
  | "code"
  | "SOP_step"
  | "policy"
  | "financial_entry"
  | "announcement"
  | "onboarding_step"
  | "divider"
  | "image"
  | "list_item";

export interface SemanticChunk {
  id: string;
  title?: string;
  text: string;
  blockIds: string[];
  metadata?: Record<string, unknown>;
}

export interface ExtractedEntity {
  type: string;
  value: string;
  confidence?: number;
  references?: string[];
}

export interface ParsedMetadata {
  pageCount?: number;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  mimeType?: string;
  fileName?: string;
  source?: string;
  [key: string]: unknown;
}

interface BaseDocumentBlock {
  id?: string;
  type: DocumentBlockType;
  parentId?: string;
  sectionId?: string;
  semanticChunkId?: string;
  searchableText?: string;
  normalizedText?: string;
  embeddingStatus?: "pending" | "created" | "failed";
  metadata?: {
    visibility?: string[];
    importance?: string;
    editable?: boolean;
    source?: string;
    authorId?: string;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: unknown;
  };
}

export interface HeadingBlock extends BaseDocumentBlock {
  type: "heading" | "subheading";
  id: string;
  content: string;
}

export interface ParagraphBlock extends BaseDocumentBlock {
  type: "paragraph";
  content: string;
}

export interface CodeBlock extends BaseDocumentBlock {
  type: "code";
  content: string;
}

export interface TableBlock extends BaseDocumentBlock {
  type: "table";
  content: {
    rows: string[][];
    headers?: string[];
  };
}

export interface StepsBlock extends BaseDocumentBlock {
  type: "steps";
  content: Array<{ title: string; description: string }>;
}

export interface ImageBlock extends BaseDocumentBlock {
  type: "image";
  content: { src: string; alt?: string };
}

export interface ListItemBlock extends BaseDocumentBlock {
  type: "list_item";
  content: string;
}

export interface GenericTextBlock extends BaseDocumentBlock {
  type: Exclude<
    DocumentBlockType,
    "heading" | "subheading" | "paragraph" | "code" | "table" | "steps" | "image" | "list_item"
  >;
  content: string | Array<{ title?: string; description?: string; question?: string; answer?: string; id?: string; label?: string; checked?: boolean }> | Record<string, unknown>;
}

export type DocumentBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | TableBlock
  | StepsBlock
  | ImageBlock
  | ListItemBlock
  | GenericTextBlock;

export interface ParserResult {
  title: string;
  description: string;
  blocks: DocumentBlock[];
  toc: { id: string; text: string; level: 1 | 2 | 3 }[];
  content: string;
  warnings?: string[];
  confidence?: number;
  semanticChunks?: SemanticChunk[];
  extractedEntities?: ExtractedEntity[];
  metadata?: ParsedMetadata;
}

export interface DriveDocumentContent {
  content: Array<{
    type?: "paragraph" | "table" | "list" | "image";
    paragraph?: {
      elements?: Array<{ textRun?: { content?: string } }>;
      paragraphStyle?: { namedStyleType?: string };
      bullet?: { listId?: string; glyphType?: string };
    };
    table?: {
      tableRows: Array<{
        tableCells: Array<{ content: DriveDocumentContent["content"] }>;
      }>;
    };
    image?: { contentUri?: string; altText?: string };
  }>;
}

/**
 * Docs API shape for a single Google Docs "tab" — documents with multiple
 * tabs nest each tab's content under documentTab.body instead of the
 * top-level body, and tabs can themselves have child tabs.
 */
export interface DriveDocumentTab {
  tabProperties?: { tabId?: string; title?: string };
  documentTab?: { body?: DriveDocumentContent };
  childTabs?: DriveDocumentTab[];
}

export interface DriveDocumentPayload {
  documentId: string;
  title: string;
  // Present for single-tab documents fetched without includeTabsContent.
  body?: DriveDocumentContent;
  // Present (possibly with a single entry) once includeTabsContent=true is
  // requested — the primary source of content for multi-tab documents.
  tabs?: DriveDocumentTab[];
}