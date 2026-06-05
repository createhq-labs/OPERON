import type { Document, DriveDocumentReference, User } from "@/core/operon";
import type { DriveDiagnostics } from "@/services/drive";

const TAG_LABELS: Record<string, string> = {
  sop: "SOP",
  onboarding: "Onboarding",
  brand: "Brand",
  creator: "Creator",
  ops: "Operations",
  hr: "HR",
  internal: "Internal",
};

interface HomePanelProps {
  user: User;
  providerLoading: boolean;
  driveDiagnostics?: DriveDiagnostics | null;
  displayQuickActions: Array<{ id: string; label: string; description: string; category?: string }>;
  accessibleDocs: Array<Document | DriveDocumentReference>;
  pinnedDocs: Document[];
  onActionSelect: (section: string) => void;
  onShowDoc: (docId: string) => void;
}

export function HomePanel({
  user,
  providerLoading,
  driveDiagnostics,
  displayQuickActions,
  accessibleDocs,
  pinnedDocs,
  onActionSelect,
  onShowDoc,
}: HomePanelProps) {
  const recentDocs = accessibleDocs
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="rounded-[12px] border border-border bg-bg-secondary p-6">
        <h1 className="text-2xl font-semibold text-content-primary">
          Welcome back, {user.name.split(" ")[0]}
        </h1>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          {displayQuickActions.length > 0 && (
            <section className="rounded-[12px] border border-border bg-bg-secondary p-6">
              <h2 className="text-sm font-semibold text-content-tertiary mb-4">Quick actions</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {displayQuickActions.slice(0, 4).map((action) => (
                  <button
                    key={`${action.label}-${action.id}`}
                    type="button"
                    onClick={() => onActionSelect(action.id)}
                    className="rounded-[12px] border border-border/50 bg-bg-primary p-3 text-left text-sm font-medium text-content-primary hover:border-border transition"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-[12px] border border-border bg-bg-secondary p-6">
            <h2 className="text-sm font-semibold text-content-tertiary mb-4">Recent</h2>
            <div className="space-y-2">
              {recentDocs.length > 0 ? (
                recentDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onShowDoc(doc.id)}
                    className="w-full rounded-[12px] border border-border/50 bg-bg-primary p-3 text-left transition hover:border-border"
                  >
                    <div className="truncate font-medium text-content-primary text-sm">
                      {doc.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-content-tertiary">
                      {TAG_LABELS[doc.tag]} • {new Date(doc.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))
              ) : providerLoading ? (
                <div className="text-sm text-content-tertiary">Loading…</div>
              ) : (
                <div className="text-sm text-content-tertiary">No recent documents</div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[12px] border border-border bg-bg-secondary p-4">
            <div className="text-xs font-medium uppercase text-content-tertiary">
              Stats
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-secondary">Documents</span>
                <span className="font-semibold text-content-primary">{accessibleDocs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-content-secondary">Pinned</span>
                <span className="font-semibold text-content-primary">{pinnedDocs.length}</span>
              </div>
            </div>
          </div>

          {driveDiagnostics && (
            <div className="rounded-[12px] border border-border bg-bg-secondary p-4">
              <div className="text-xs font-medium uppercase text-content-tertiary">
                Drive
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    driveDiagnostics.providerMode === "local"
                      ? "bg-amber-500"
                      : "bg-green-500"
                  }`}
                />
                <span className="text-sm font-medium text-content-primary">
                  {driveDiagnostics.providerMode === "local" ? "Local" : "Connected"}
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
