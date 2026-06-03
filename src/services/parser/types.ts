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
  | "divider";

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

export interface DocumentBlock {
  id?: string;
  type: DocumentBlockType;
  content: any;
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

export interface ParserResult {
  title: string;
  description: string;
  blocks: DocumentBlock[];
  toc: { id: string; label: string; level: 1 | 2 | 3 }[];
  content: string;
  warnings?: string[];
  confidence?: number;
  semanticChunks?: SemanticChunk[];
  extractedEntities?: ExtractedEntity[];
  metadata?: ParsedMetadata;
}

export interface DriveDocumentPayload {
  documentId: string;
  title: string;
  body: {
    content: Array<{
      type: "paragraph" | "table" | "list" | "image";
      paragraph?: {
        elements?: Array<{ textRun?: { content?: string } }>;
        paragraphStyle?: { namedStyleType?: string };
        bullet?: { listId?: string; glyphType?: string };
      };
      table?: {
        tableRows: Array<{ tableCells: Array<{ content: DriveDocumentPayload['body']['content'] }> }>;
      };
      image?: { contentUri?: string; altText?: string };
    }>;
  };
}
