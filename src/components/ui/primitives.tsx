"use client";

import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { S, Sp, T } from "@/styles/sharedUi";
import { motionPreset, motionTransition } from "@/styles/motionPresets";

type StyledProps = { children?: ReactNode; className?: string; style?: CSSProperties };

export function PageShell({ children, className, style }: StyledProps) {
  return <div className={className} style={{ width: "100%", maxWidth: "var(--content-max-width)", margin: "0 auto", display: "flex", flexDirection: "column", gap: Sp["10"], ...style }}>{children}</div>;
}

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return <header style={{ ...S.pageHeader, marginBottom: 0 }}>{<div>{eyebrow && <div style={{ ...T.sectionLabel, marginBottom: Sp["2"] }}>{eyebrow}</div>}<h1 style={T.pageTitle}>{title}</h1>{description && <p style={T.pageDesc}>{description}</p>}</div>}{actions && <div style={{ display: "flex", alignItems: "center", gap: Sp["2"], flexWrap: "wrap" }}>{actions}</div>}</header>;
}

export function Section({ children, className, style, spacing = "default" }: StyledProps & { spacing?: "compact" | "default" | "major" }) {
  const gap = spacing === "compact" ? Sp["4"] : spacing === "major" ? Sp["12"] : Sp["8"];
  return <section className={className} style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</section>;
}

export function SectionHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: Sp["4"], flexWrap: "wrap" }}><div>{eyebrow && <div style={{ ...T.sectionLabel, marginBottom: Sp["2"] }}>{eyebrow}</div>}<h2 style={T.sectionTitle}>{title}</h2>{description && <p style={{ ...T.sectionDesc, marginTop: Sp["2"] }}>{description}</p>}</div>{actions && <div style={{ display: "flex", alignItems: "center", gap: Sp["2"], flexWrap: "wrap" }}>{actions}</div>}</div>;
}

export function Surface({ children, className, style, tone = "group", padding = "default" }: StyledProps & { tone?: "group" | "inset" | "raised" | "plain"; padding?: "none" | "compact" | "default" | "roomy" }) {
  const base: CSSProperties = tone === "plain" ? {} : tone === "raised" ? S.cardRaised : tone === "inset" ? { background: "var(--op-surface-2)", borderRadius: "var(--r-md)" } : { background: "var(--op-surface)", border: "1px solid var(--op-border)", borderRadius: "var(--r-lg)" };
  const pad = padding === "none" ? 0 : padding === "compact" ? Sp["4"] : padding === "roomy" ? Sp["8"] : Sp["6"];
  return <div className={className} style={{ ...base, padding: pad, ...style }}>{children}</div>;
}

function HeaderBar({ children, className, style }: StyledProps) {
  return <div className={className} style={{ minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: Sp["4"], padding: `0 ${Sp["4"]}`, borderBottom: "1px solid var(--op-border)", ...style }}>{children}</div>;
}

export function Tabs<T extends string>({ items, value, onChange, label = "Sections" }: { items: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (value: T) => void; label?: string }) {
  return <div role="tablist" aria-label={label} style={S.tabBar}>{items.map((item) => <button key={item.value} type="button" role="tab" aria-selected={value === item.value} style={S.tab(value === item.value)} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "ghost", children, style, ...props }: HTMLMotionProps<"button"> & { variant?: ButtonVariant }) {
  const variants = { primary: S.btnPrimary, secondary: S.btnSecondary, ghost: S.btnGhost, danger: S.btnDanger };
  return <motion.button whileHover={{ y: -1 }} whileTap={{ scale: .985 }} transition={motionTransition.control} style={{ ...variants[variant], justifyContent: "center", gap: Sp["2"], ...style }} {...props}>{children}</motion.button>;
}

export function IconButton({ label, children, style, ...props }: HTMLMotionProps<"button"> & { label: string }) {
  return <motion.button aria-label={label} title={label} whileHover={{ y: -1 }} whileTap={{ scale: .96 }} transition={motionTransition.control} style={{ ...S.btnIcon, ...style }} {...props}>{children}</motion.button>;
}

export function Input({ label, hint, error, style, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  return <label style={{ display: "block" }}>{label && <span style={S.label}>{label}</span>}<input style={{ ...S.input, ...style }} {...props} />{error ? <span style={S.errorText}>{error}</span> : hint ? <span style={S.helperText}>{hint}</span> : null}</label>;
}

export function Select({ label, hint, children, style, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  return <label style={{ display: "block" }}>{label && <span style={S.label}>{label}</span>}<select style={{ ...S.select, ...style }} {...props}>{children}</select>{hint && <span style={S.helperText}>{hint}</span>}</label>;
}

export function SearchField({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <div style={{ position: "relative", ...style }}><Search aria-hidden="true" size={15} style={{ position: "absolute", left: Sp["3"], top: "50%", transform: "translateY(-50%)", color: "var(--op-text-3)", pointerEvents: "none" }} /><input type="search" aria-label={props["aria-label"] ?? "Search"} style={{ ...S.input, paddingLeft: "36px", height: "38px" }} {...props} /></div>;
}

export function Metric({ label, value, detail, icon: Icon, color = "var(--op-text)" }: { label: string; value: ReactNode; detail?: ReactNode; icon?: LucideIcon; color?: string }) {
  return <div style={{ minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: Sp["2"], marginBottom: Sp["3"] }}>{Icon && <Icon size={14} color={color} />}<span style={T.sectionLabel}>{label}</span></div><div style={{ ...T.displayLg, color }}>{value}</div>{detail && <div style={{ ...T.caption, marginTop: Sp["2"] }}>{detail}</div>}</div>;
}

export function EmptyState({ title, description, icon: Icon, action }: { title: string; description?: string; icon?: LucideIcon; action?: ReactNode }) {
  return <div style={{ padding: `${Sp["12"]} ${Sp["6"]}`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: Sp["2"] }}>{Icon && <div style={{ ...S.emptyIcon, border: "none" }}><Icon size={18} /></div>}<h3 style={S.emptyTitle}>{title}</h3>{description && <p style={S.emptyDesc}>{description}</p>}{action && <div style={{ marginTop: Sp["3"] }}>{action}</div>}</div>;
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransition.panel} onMouseDown={onClose} style={S.modalOverlay}>{children}</motion.div>;
}

export function Modal({ open, title, children, footer, onClose, width = 560 }: { open: boolean; title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number }) {
  return <AnimatePresence>{open && <Overlay onClose={onClose}><motion.div role="dialog" aria-modal="true" aria-label={title} initial={motionPreset.panel.initial} animate={motionPreset.panel.animate} exit={motionPreset.panel.exit} transition={motionPreset.panel.transition} onMouseDown={(event) => event.stopPropagation()} style={{ ...S.modalPanel, width: `min(${width}px, 100%)`, padding: 0, gap: 0 }}><HeaderBar><h2 style={T.modalTitle}>{title}</h2><IconButton label="Close" onClick={onClose}><X size={16} /></IconButton></HeaderBar><div style={{ padding: Sp["6"] }}>{children}</div>{footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: Sp["2"], padding: `${Sp["4"]} ${Sp["6"]}`, borderTop: "1px solid var(--op-border)" }}>{footer}</div>}</motion.div></Overlay>}</AnimatePresence>;
}

export function Drawer({ open, title, children, onClose, side = "right" }: { open: boolean; title: string; children: ReactNode; onClose: () => void; side?: "left" | "right" }) {
  const x = side === "right" ? 24 : -24;
  return <AnimatePresence>{open && <Overlay onClose={onClose}><motion.aside role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, x }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x }} transition={motionTransition.panel} onMouseDown={(event) => event.stopPropagation()} style={{ position: "absolute", insetBlock: 0, [side]: 0, width: "min(560px, 100%)", background: "var(--op-surface-3)", borderLeft: side === "right" ? "1px solid var(--op-border)" : undefined, borderRight: side === "left" ? "1px solid var(--op-border)" : undefined, boxShadow: "var(--shadow-lg)", overflowY: "auto" }}><HeaderBar style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--op-surface-3)" }}><h2 style={T.modalTitle}>{title}</h2><IconButton label="Close" onClick={onClose}><X size={16} /></IconButton></HeaderBar><div style={{ padding: Sp["6"] }}>{children}</div></motion.aside></Overlay>}</AnimatePresence>;
}

export function Popover({ children, className, style }: StyledProps) {
  return <motion.div className={className} initial={motionPreset.popover.initial} animate={motionPreset.popover.animate} exit={motionPreset.popover.exit} transition={motionPreset.popover.transition} style={{ ...S.floatingPanel, padding: Sp["3"], ...style }}>{children}</motion.div>;
}

export function Matrix({ children, label, style }: { children: ReactNode; label: string; style?: CSSProperties }) {
  return <div role="grid" aria-label={label} style={{ width: "100%", overflow: "auto", borderRadius: "var(--r-lg)", background: "var(--op-surface)", ...style }}>{children}</div>;
}

export const MotionPage = motion.div;
export const MotionSection = motion.section;
