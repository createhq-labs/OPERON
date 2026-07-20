"use client";

import { FileText, Pin } from "lucide-react";
import {
  Button,
  EmptyState,
  Metric,
  MotionPage,
  MotionSection,
  PageHeader,
  PageShell,
  Section,
  SectionHeader,
  Surface,
} from "@/components/ui";
import type { Document, DriveDocumentReference, QuickActionItem, User } from "@/core/operon";
import { motionPreset, motionTransition } from "@/styles/motionPresets";
import { S, Sp, T } from "@/styles/sharedUi";

const TAG_LABELS: Record<string, string> = {
  sop: "SOP", onboarding: "Onboarding", brand: "Brand", creator: "Creator",
  ops: "Operations", hr: "HR", internal: "Internal",
};

interface HomePanelProps {
  user: User;
  providerLoading: boolean;
  displayQuickActions: Array<Pick<QuickActionItem, "id" | "label" | "description" | "category">>;
  accessibleDocs: Array<Document | DriveDocumentReference>;
  pinnedDocs: Document[];
  onActionSelect: (action: Pick<QuickActionItem, "id" | "label" | "description" | "category">) => void;
  onShowDoc: (docId: string) => void;
}

export function HomePanel({
  user,
  providerLoading,
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
    <MotionPage {...motionPreset.page}>
      <PageShell>
        <PageHeader
          eyebrow="Workspace"
          title={`Welcome back, ${user.name.split(" ")[0]}`}
          description="Open recent knowledge or start from a trusted workflow."
        />

        {displayQuickActions.length > 0 && (
          <MotionSection {...motionPreset.panel}>
            <Section spacing="compact">
              <SectionHeader title="Quick actions" description="Common ways to create and find operational knowledge." />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: Sp["3"] }}>
                {displayQuickActions.slice(0, 6).map((action) => (
                  <Button
                    key={`${action.label}-${action.id}`}
                    variant="ghost"
                    onClick={() => onActionSelect(action)}
                    style={{ ...S.inset, minHeight: "64px", height: "auto", padding: Sp["4"], alignItems: "flex-start", flexDirection: "column", textAlign: "left" }}
                  >
                    <span style={T.cardTitle}>{action.label}</span>
                    {action.description && <span style={T.caption}>{action.description}</span>}
                  </Button>
                ))}
              </div>
            </Section>
          </MotionSection>
        )}

        <MotionSection {...motionPreset.panel}>
          <Section>
            <SectionHeader title="Recent" description="Your latest documents, ordered by their most recent update." />
            <Surface padding="none">
              {recentDocs.length > 0 ? recentDocs.map((doc, index) => (
                <Button
                  key={doc.id}
                  variant="ghost"
                  onClick={() => onShowDoc(doc.id)}
                  transition={motionTransition.control}
                  style={{ ...S.row, width: "100%", minHeight: "54px", height: "auto", padding: `${Sp["3"]} ${Sp["4"]}`, borderRadius: 0, borderBottom: index === recentDocs.length - 1 ? "none" : "1px solid var(--op-border)", justifyContent: "space-between" }}
                >
                  <span style={{ ...T.cardTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
                  <span style={{ ...T.caption, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{TAG_LABELS[doc.tag] ?? doc.tag}</span>
                </Button>
              )) : providerLoading ? (
                <EmptyState title="Loading documents…" description="Syncing the latest items from your workspace." />
              ) : (
                <EmptyState title="No documents yet" description="Your recently updated documents will appear here." icon={FileText} />
              )}
            </Surface>
          </Section>
        </MotionSection>

        <MotionSection {...motionPreset.panel}>
          <Section spacing="compact">
            <SectionHeader title="Workspace overview" />
            <Surface tone="inset" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: Sp["8"] }}>
              <Metric icon={FileText} label="Documents" value={accessibleDocs.length} />
              <Metric icon={Pin} label="Pinned" value={pinnedDocs.length} />
            </Surface>
          </Section>
        </MotionSection>
      </PageShell>
    </MotionPage>
  );
}
