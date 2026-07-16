import { S } from "@/styles/sharedUi";

export function ShellSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Preparing workspace"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <div style={{ ...S.cardRaised, width: "min(720px, 100%)", padding: "22px", display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div className="op-skeleton" style={{ width: "180px", height: "18px" }} />
          <div className="op-skeleton" style={{ width: "92px", height: "32px", borderRadius: "var(--r-full)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: "18px" }} className="shell-skeleton-grid">
          <div style={{ display: "grid", gap: "8px" }}>
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="op-skeleton" style={{ height: "34px" }} />
            ))}
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            <div className="op-skeleton" style={{ height: "120px" }} />
            <div className="op-skeleton" style={{ height: "72px" }} />
            <div className="op-skeleton" style={{ height: "72px" }} />
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 640px) {
          .shell-skeleton-grid { grid-template-columns: minmax(0,1fr) !important; }
        }
      `}</style>
    </div>
  );
}
