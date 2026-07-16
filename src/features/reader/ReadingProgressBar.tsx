"use client";

export function ReadingProgressBar({ percent }: { percent: number }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "sticky", top: 0, zIndex: 20, height: "2px", background: "var(--op-border)" }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, percent))}%`,
          background: "var(--op-accent)",
          transition: "width 200ms ease-out",
        }}
      />
    </div>
  );
}
