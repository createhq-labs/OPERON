"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ChecklistBlock, ChecklistItem } from "@/renderers/types";
import { spring } from "@/styles/motionPresets";

function ChecklistRow({
  item,
  checked,
  onToggle,
}: {
  item: ChecklistItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "12px",
        padding:      "10px 12px",
        borderRadius: "var(--r-md)",
        cursor:       "pointer",
        transition:   "background 120ms",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--op-surface-2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Checkbox square */}
      <div
        aria-hidden="true"
        style={{
          flexShrink:   0,
          width:        "16px",
          height:       "16px",
          borderRadius: "var(--r-sm)",
          border:       `1.5px solid ${checked ? "var(--op-accent)" : "var(--op-border-hover)"}`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          transition:   "border-color 120ms",
        }}
      >
        <div
          style={{
            width:        "6px",
            height:       "6px",
            borderRadius: "50%",
            background:   checked ? "var(--op-accent)" : "var(--op-border-hover)",
            opacity:      checked ? 1 : 0.4,
            transition:   "background 120ms, opacity 120ms",
          }}
        />
      </div>

      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize:   "var(--text-14)",
          lineHeight: 1.5,
          color:      checked ? "var(--op-text-3)" : "var(--op-text-2)",
          transition: "color 120ms",
        }}
      >
        {item.label}
      </span>

      {item.required && !checked && (
        <span
          style={{
            marginLeft:    "auto",
            fontFamily:    "var(--font-ui)",
            fontSize:      "var(--text-11)",
            fontWeight:    600,
            letterSpacing: "0.04em",
            color:         "var(--op-accent)",
            opacity:       0.8,
          }}
        >
          Required
        </span>
      )}
    </div>
  );
}

export function renderChecklist(block: ChecklistBlock, _index: number) {
  const { title, items } = block.content;
  // Checked state is local/ephemeral UI only — it resets on reload, since
  // there's no persistence contract for "reader progress through a checklist"
  // yet. Purely a way to feel the list resolving as you go.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const completedCount = items.filter((item) => checkedIds.has(item.id)).length;
  const percent = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        background:   "var(--op-surface)",
        overflow:     "hidden",
      }}
    >
      {title && (
        <div
          style={{
            padding:      "14px 20px",
            borderBottom: "1px solid var(--op-border)",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            gap:          "12px",
          }}
        >
          <div
            style={{
              fontFamily:    "var(--font-ui)",
              fontSize:      "var(--text-11)",
              fontWeight:    700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:         "var(--op-text-3)",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize:   "var(--text-11)",
              color:      "var(--op-text-3)",
              whiteSpace: "nowrap",
            }}
          >
            {completedCount} / {items.length} complete
          </div>
        </div>
      )}

      {title && (
        <div style={{ height: "2px", background: "var(--op-border)" }}>
          <motion.div
            animate={{ width: `${percent}%` }}
            transition={spring.soft}
            style={{ height: "100%", background: "var(--op-accent)" }}
          />
        </div>
      )}

      <div style={{ padding: "8px" }}>
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            checked={checkedIds.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
