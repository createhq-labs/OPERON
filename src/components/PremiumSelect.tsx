"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { openFloatingLayer, subscribeFloatingLayerClose } from "@/lib/floatingLayers";
import { motionPreset } from "@/styles/motionPresets";
import { S } from "@/styles/sharedUi";

export interface PremiumSelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface PremiumSelectProps<T extends string> {
  label?: string;
  value: T;
  options: PremiumSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function PremiumSelect<T extends string>({
  label,
  value,
  options,
  placeholder = "Select",
  disabled = false,
  onChange,
}: PremiumSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    return subscribeFloatingLayerClose("select", () => setOpen(false));
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

  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 0 }}>
      {label && <label style={S.label}>{label}</label>}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          const willOpen = !open;
          if (willOpen) openFloatingLayer("select");
          setOpen(willOpen);
        }}
        style={{
          ...S.select,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ ...motionPreset.fadeScale.initial, backdropFilter: "blur(0px)" }}
            animate={{ ...motionPreset.fadeScale.animate, backdropFilter: "blur(16px)" }}
            exit={{ ...motionPreset.fadeScale.exit, backdropFilter: "blur(0px)" }}
            transition={motionPreset.fadeScale.transition}
            role="listbox"
            style={{
              position: "absolute",
              zIndex: 120,
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              maxHeight: "260px",
              overflowY: "auto",
              padding: "6px",
              ...S.floatingPanel,
            }}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "9px 10px",
                    borderRadius: "var(--r-md)",
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    color: active ? "var(--op-text)" : "var(--op-text-2)",
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-13)",
                    fontWeight: active ? 650 : 500,
                    textAlign: "left",
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {option.label}
                    </span>
                    {option.description && (
                      <span style={{ display: "block", marginTop: "2px", color: "var(--op-text-3)", fontSize: "var(--text-11)" }}>
                        {option.description}
                      </span>
                    )}
                  </span>
                  {active && <Check size={14} aria-hidden="true" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
