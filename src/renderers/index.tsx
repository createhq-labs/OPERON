import React from "react";
import type { Block } from "@/core/types";
import type {
  HeadingBlock,
  ParagraphBlock,
  AlertBlock,
  ChecklistBlock,
  StepsBlock,
  TableBlock,
  TimelineBlock,
  ResourceBlock,
  VideoBlock,
} from "@/renderers/types";
import { renderParagraph } from "@/renderers/renderParagraph";
import { renderChecklist } from "@/renderers/renderChecklist";
import { renderSteps } from "@/renderers/renderSteps";
import { renderTable } from "@/renderers/renderTable";
import { renderTimeline } from "@/renderers/renderTimeline";
import { renderResource } from "@/renderers/renderResource";
import { renderVideo } from "@/renderers/renderVideo";
import { renderAlert } from "@/renderers/renderAlert";
import { renderHeading } from "@/renderers/renderHeading";

// ─── Type adapters ────────────────────────────────────────────────────────────
// Core Block types store data as direct properties; renderer functions expect
// a content-wrapper shape.  These adapters perform the mapping at the boundary.

function toHeadingBlock(block: Block): HeadingBlock {
  const b = block as { type: "heading" | "subheading"; id?: string; content: string; anchorId?: string };
  return { type: b.type, id: b.id, content: b.content ?? "", anchorId: b.anchorId };
}

function toParagraphBlock(block: Block): ParagraphBlock {
  const b = block as { type: "paragraph"; id?: string; content: string };
  return { type: "paragraph", id: b.id, content: b.content ?? "" };
}

function toAlertBlock(block: Block): AlertBlock {
  const b = block as { type: "warning" | "note" | "callout" | "success"; id?: string; title?: string; content: string };
  return { type: b.type, id: b.id, title: b.title, content: b.content ?? "" };
}

function toChecklistBlock(block: Block): ChecklistBlock {
  const b = block as { type: "checklist"; id?: string; title: string; items: Array<{ id: string; label: string; required?: boolean }> };
  return {
    type: "checklist",
    id: b.id,
    content: { title: b.title ?? "", items: b.items ?? [] },
  };
}

function toStepsBlock(block: Block): StepsBlock {
  const b = block as { type: "steps" | "faq"; id?: string; items: Array<{ title: string; description: string }> };
  return { type: b.type, id: b.id, content: b.items ?? [] };
}

function toTableBlock(block: Block): TableBlock {
  const b = block as { type: "table"; id?: string; headers: string[]; rows: string[][] };
  return {
    type: "table",
    id: b.id,
    content: { headers: b.headers ?? [], rows: b.rows ?? [] },
  };
}

function toTimelineBlock(block: Block): TimelineBlock {
  const b = block as { type: "timeline"; id?: string; items: Array<{ period: string; title: string; description: string }> };
  return { type: "timeline", id: b.id, content: { items: b.items ?? [] } };
}

function toResourceBlock(block: Block): ResourceBlock {
  const b = block as { type: "resource"; id?: string; title: string; description: string; href: string; external?: boolean };
  return {
    type: "resource",
    id: b.id,
    content: { title: b.title ?? "", description: b.description ?? "", href: b.href ?? "", external: b.external },
  };
}

function toVideoBlock(block: Block): VideoBlock {
  const b = block as {
    type: "video"; id?: string;
    title: string; description: string;
    provider: VideoBlock["content"]["provider"];
    embedUrl: string; thumbnail?: string; transcript?: string;
    timestamps?: Array<{ label: string; seconds: number }>;
    relatedResourceIds?: string[];
  };
  return {
    type: "video",
    id: b.id,
    content: {
      title: b.title ?? "",
      description: b.description ?? "",
      provider: b.provider ?? "loom",
      embedUrl: b.embedUrl ?? "",
      thumbnail: b.thumbnail,
      transcript: b.transcript,
      timestamps: b.timestamps,
      relatedResourceIds: b.relatedResourceIds,
    },
  };
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function renderBlock(block: Block, index: number): React.ReactNode {
  const key = (block as { id?: string }).id ?? `${block.type}-${index}`;

  switch (block.type) {
    case "heading":
    case "subheading":
      return <React.Fragment key={key}>{renderHeading(toHeadingBlock(block), index)}</React.Fragment>;

    case "paragraph":
      return <React.Fragment key={key}>{renderParagraph(toParagraphBlock(block), index)}</React.Fragment>;

    case "warning":
    case "note":
    case "callout":
    case "success":
      return <React.Fragment key={key}>{renderAlert(toAlertBlock(block), index)}</React.Fragment>;

    case "checklist":
      return <React.Fragment key={key}>{renderChecklist(toChecklistBlock(block), index)}</React.Fragment>;

    case "steps":
    case "faq":
      return <React.Fragment key={key}>{renderSteps(toStepsBlock(block), index)}</React.Fragment>;

    case "table":
      return <React.Fragment key={key}>{renderTable(toTableBlock(block), index)}</React.Fragment>;

    case "timeline":
      return <React.Fragment key={key}>{renderTimeline(toTimelineBlock(block), index)}</React.Fragment>;

    case "resource":
      return <React.Fragment key={key}>{renderResource(toResourceBlock(block), index)}</React.Fragment>;

    case "video":
      return <React.Fragment key={key}>{renderVideo(toVideoBlock(block), index)}</React.Fragment>;

    case "divider":
      return (
        <hr
          key={key}
          style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0" }}
        />
      );

    default:
      return null;
  }
}
