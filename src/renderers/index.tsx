"use client";

import React from "react";
import { motion } from "framer-motion";
import type { Block } from "@/core/types";
import { imageReveal } from "@/styles/motionPresets";
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
import { renderParagraph }  from "@/renderers/renderParagraph";
import { renderChecklist }  from "@/renderers/renderChecklist";
import { renderSteps }      from "@/renderers/renderSteps";
import { renderTable }      from "@/renderers/renderTable";
import { renderTimeline }   from "@/renderers/renderTimeline";
import { renderResource }   from "@/renderers/renderResource";
import { renderVideo }      from "@/renderers/renderVideo";
import { renderAlert }      from "@/renderers/renderAlert";
import { renderHeading }    from "@/renderers/renderHeading";

// ─── Spacing per block type ───────────────────────────────────────────────────
// Headings pull more space above them. Paragraphs breathe tightly together.
// Cards (checklist, steps, table, etc.) get generous vertical separation.

const BLOCK_GAP: Record<string, string> = {
  heading:    "0",   // heading manages its own top margin
  subheading: "0",
  paragraph:  "18px",
  warning:    "24px",
  note:       "24px",
  callout:    "24px",
  success:    "24px",
  checklist:  "24px",
  steps:      "24px",
  faq:        "24px",
  table:      "24px",
  timeline:   "24px",
  resource:   "12px",
  video:      "24px",
  divider:    "32px",
  code:       "20px",
  image:      "24px",
  list_item:  "6px",
};

// ─── Type adapters ────────────────────────────────────────────────────────────

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
  return { type: "checklist", id: b.id, content: { title: b.title ?? "", items: b.items ?? [] } };
}

function toStepsBlock(block: Block): StepsBlock {
  const b = block as { type: "steps" | "faq"; id?: string; items: Array<{ title: string; description: string }> };
  return { type: b.type, id: b.id, content: b.items ?? [] };
}

function toTableBlock(block: Block): TableBlock {
  const b = block as { type: "table"; id?: string; headers: string[]; rows: string[][] };
  return { type: "table", id: b.id, content: { headers: b.headers ?? [], rows: b.rows ?? [] } };
}

function toTimelineBlock(block: Block): TimelineBlock {
  const b = block as { type: "timeline"; id?: string; items: Array<{ period: string; title: string; description: string }> };
  return { type: "timeline", id: b.id, content: { items: b.items ?? [] } };
}

function toResourceBlock(block: Block): ResourceBlock {
  const b = block as { type: "resource"; id?: string; title: string; description: string; href: string; external?: boolean };
  return { type: "resource", id: b.id, content: { title: b.title ?? "", description: b.description ?? "", href: b.href ?? "", external: b.external } };
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

// ─── Inline renderers for simple block types ──────────────────────────────────

function renderCode(block: Block, index: number): React.ReactNode {
  const b = block as { id?: string; content: string };
  return (
    <pre
      key={b.id ?? `code-${index}`}
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        background:   "var(--op-surface-2)",
        padding:      "16px 20px",
        overflow:     "auto",
        fontFamily:   "var(--font-mono)",
        fontSize:     "var(--text-12)",
        lineHeight:   1.7,
        color:        "var(--op-text-2)",
        margin:       0,
        whiteSpace:   "pre-wrap",
        wordBreak:    "break-word",
      }}
      className="scrollbar-thin"
    >
      <code>{b.content}</code>
    </pre>
  );
}

function renderImage(block: Block, index: number): React.ReactNode {
  const b = block as { id?: string; content: { src: string; alt?: string } };
  return (
    <motion.figure
      key={b.id ?? `image-${index}`}
      variants={imageReveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      style={{ margin: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={b.content.src}
        alt={b.content.alt ?? ""}
        style={{
          width:        "100%",
          borderRadius: "var(--r-lg)",
          border:       "1px solid var(--op-border)",
          display:      "block",
        }}
        loading="lazy"
      />
      {b.content.alt && (
        <figcaption
          style={{
            marginTop:  "8px",
            fontFamily: "var(--font-body)",
            fontSize:   "var(--text-12)",
            color:      "var(--op-text-3)",
            textAlign:  "center",
          }}
        >
          {b.content.alt}
        </figcaption>
      )}
    </motion.figure>
  );
}

function renderListItem(block: Block, index: number): React.ReactNode {
  const b = block as { id?: string; content: string };
  return (
    <div
      key={b.id ?? `list-${index}`}
      style={{
        display:    "flex",
        alignItems: "flex-start",
        gap:        "10px",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          flexShrink:   0,
          marginTop:    "7px",
          width:        "4px",
          height:       "4px",
          borderRadius: "50%",
          background:   "var(--op-text-3)",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize:   "var(--text-14)",
          lineHeight: 1.7,
          color:      "var(--op-text-2)",
        }}
      >
        {b.content}
      </span>
    </div>
  );
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function renderBlock(block: Block, index: number): React.ReactNode {
  const key        = (block as { id?: string }).id ?? `${block.type}-${index}`;
  const marginTop  = index === 0 ? "0" : (BLOCK_GAP[block.type] ?? "16px");

  const inner = (() => {
    switch (block.type) {
      case "heading":
      case "subheading":
        return renderHeading(toHeadingBlock(block), index);

      case "paragraph":
        return renderParagraph(toParagraphBlock(block), index);

      case "warning":
      case "note":
      case "callout":
      case "success":
        return renderAlert(toAlertBlock(block), index);

      case "checklist":
        return renderChecklist(toChecklistBlock(block), index);

      case "steps":
      case "faq":
        return renderSteps(toStepsBlock(block), index);

      case "table":
        return renderTable(toTableBlock(block), index);

      case "timeline":
        return renderTimeline(toTimelineBlock(block), index);

      case "resource":
        return renderResource(toResourceBlock(block), index);

      case "video":
        return renderVideo(toVideoBlock(block), index);

      case "code":
        return renderCode(block, index);

      case "image":
        return renderImage(block, index);

      case "list_item":
        return renderListItem(block, index);

      case "divider":
        return (
          <hr
            style={{
              border:     "none",
              borderTop:  "1px solid var(--op-border)",
              margin:     0,
            }}
          />
        );

      default:
        return null;
    }
  })();

  if (!inner) return null;

  return (
    <div key={key} style={{ marginTop }}>
      {inner}
    </div>
  );
}

// ─── Document shell ───────────────────────────────────────────────────────────
// Wraps a full block array with the correct outer spacing.

export function renderDocument(blocks: Block[]): React.ReactNode {
  if (!blocks || blocks.length === 0) return null;

  return (
    <article
      style={{
        maxWidth: "720px",
        width:    "100%",
      }}
    >
      {blocks.map((block, index) => renderBlock(block, index))}
    </article>
  );
}