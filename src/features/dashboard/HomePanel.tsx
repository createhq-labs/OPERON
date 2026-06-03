import type { Document, QuickActionItem, User } from "@/core/operon";
import type { ProviderHealth } from "@/services/api";

const TAG_LABELS: Record<string, string> = {
  sop: "SOP",
  onboarding: "Onboarding",
  brand: "Brand",
  creator: "Creator",
  ops: "Operations",
  hr: "HR",
  internal: "Internal",
};

import type { DriveDiagnostics } from "@/services/drive";

interface HomePanelProps {
  user: User;
  providerHealth: ProviderHealth;
  providerLoading: boolean;
  driveDiagnostics?: DriveDiagnostics | null;
  displayQuickActions: Array<{ id: string; label: string; description: string; category?: string }>;
  pinnedDocs: Document[];
  onActionSelect: (section: string) => void;
  onShowDoc: (docId: string) => void;
}

export function HomePanel({ user, providerHealth, providerLoading, driveDiagnostics, displayQuickActions, pinnedDocs, onActionSelect, onShowDoc }: HomePanelProps) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
      <div className="operon-panel p-6">
        <h2 className="text-2xl font-semibold tracking-tight text-content-primary">Welcome back, {user.name}</h2>
        <p className="mt-3 text-sm leading-6 text-content-secondary">Pick a section to stay focused on the documents and resources relevant to your work.</p>
        {providerHealth.status !== "connected" ? (
          <div className="mt-5 rounded-3xl border border-warning-soft bg-warning-soft/70 p-4 text-sm text-warning font-medium">
            <div>{providerHealth.message}</div>
            {providerHealth.diagnostics?.warnings?.length ? (
              <ul className="mt-3 list-disc pl-5 text-xs text-warning/80">
                {providerHealth.diagnostics.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {driveDiagnostics ? (
          <div className="mt-5 rounded-3xl border border-border bg-bg-secondary/90 p-4 text-sm text-content-primary">
            <div className="font-semibold">Drive diagnostics</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-bg-primary/80 p-3">Status: {driveDiagnostics.status}</div>
              <div className="rounded-3xl bg-bg-primary/80 p-3">Provider: {driveDiagnostics.activeProvider}</div>
              <div className="rounded-3xl bg-bg-primary/80 p-3">Mode: {driveDiagnostics.providerMode}</div>
              <div className="rounded-3xl bg-bg-primary/80 p-3">Index version: {driveDiagnostics.indexingVersion}</div>
            </div>
          </div>
        ) : null}
        {providerLoading ? (
          <div className="mt-5 rounded-3xl border border-border bg-bg-secondary/90 p-4 text-sm text-content-secondary">Connecting to Supabase and loading your workspace content...</div>
        ) : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {displayQuickActions.length > 0 ? (
            displayQuickActions.map((action) => (
              <button
                key={`${action.label}-${action.id}-${action.category ?? ""}`}
                type="button"
                onClick={() => onActionSelect(action.id)}
                className="group rounded-3xl border border-border bg-bg-secondary/90 px-4 py-4 text-left text-sm text-content-primary transition hover:border-primary hover:bg-bg-secondary"
              >
                <div className="font-semibold text-content-primary group-hover:text-primary">{action.label}</div>
                <p className="mt-2 text-sm text-content-secondary">{action.description}</p>
              </button>
            ))
          ) : (
            <div className="rounded-3xl border border-border bg-bg-secondary/90 p-5 text-sm text-content-secondary">{providerLoading ? "Loading your workspace content." : "No quick actions are available for your role yet."}</div>
          )}
        </div>
      </div>

      <aside className="space-y-5">
        <div className="operon-panel p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-content-tertiary">Pinned documents</div>
          <div className="mt-4 space-y-3">
            {providerLoading ? (
              <div className="operon-empty-state p-5 text-sm text-content-tertiary">Loading pinned documents...</div>
            ) : pinnedDocs.length > 0 ? (
              pinnedDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onShowDoc(doc.id)}
                  className="w-full rounded-3xl border border-border bg-bg-secondary/90 px-4 py-3 text-left text-sm text-content-primary transition hover:border-primary hover:bg-bg-secondary"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-semibold">{doc.title}</span>
                    <span className="rounded-full bg-bg-primary/95 px-3 py-1 text-[11px] text-content-tertiary">{TAG_LABELS[doc.tag] ?? doc.tag}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="operon-empty-state p-5 text-sm text-content-tertiary">No pinned documents available.</div>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
