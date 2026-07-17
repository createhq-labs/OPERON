"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreVertical, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { openFloatingLayer, subscribeFloatingLayerClose } from "@/lib/floatingLayers";
import { motionPreset } from "@/styles/motionPresets";
import { S } from "@/styles/sharedUi";

/** Per-document "⋮" menu — Rename/Replace/Delete, gated by permission. Same open/close pattern as PremiumSelect. */
export function DocActionsMenu({
  canEdit,
  canDelete,
  onRename,
  onReplace,
  onDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onRename: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    return subscribeFloatingLayerClose("doc-actions", () => setOpen(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!rootRef.current?.contains(target)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!canEdit && !canDelete) return null;

  const itemStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "var(--r-md)",
    background: "transparent",
    border: "none",
    textAlign: "left",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--text-13)",
    color: "var(--op-text-2)",
    cursor: "pointer",
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <motion.button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Document actions"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          const willOpen = !open;
          if (willOpen) openFloatingLayer("doc-actions");
          setOpen(willOpen);
        }}
        style={S.btnIcon}
      >
        <MoreVertical size={14} aria-hidden="true" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={motionPreset.fadeScale.initial}
            animate={motionPreset.fadeScale.animate}
            exit={motionPreset.fadeScale.exit}
            transition={motionPreset.fadeScale.transition}
            style={{
              position: "absolute",
              zIndex: 120,
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: "160px",
              padding: "6px",
              ...S.floatingPanel,
            }}
          >
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                style={itemStyle}
                onClick={() => {
                  setOpen(false);
                  onRename();
                }}
              >
                <Pencil size={13} aria-hidden="true" />
                Rename
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                role="menuitem"
                style={itemStyle}
                onClick={() => {
                  setOpen(false);
                  onReplace();
                }}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Replace file
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                role="menuitem"
                style={{ ...itemStyle, color: "var(--color-error)" }}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <Trash2 size={13} aria-hidden="true" />
                Delete
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
