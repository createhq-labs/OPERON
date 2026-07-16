"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Document } from "@/core/types";
import { groupBlocksIntoSections } from "@/features/reader/groupSections";
import { SectionRenderer } from "@/features/reader/sections/SectionRenderer";
import { ReaderHero } from "@/features/reader/ReaderHero";
import { TableOfContents } from "@/features/reader/TableOfContents";
import { ReadingProgressBar } from "@/features/reader/ReadingProgressBar";
import { useDocumentReadPersistence } from "@/features/reader/useDocumentReadPersistence";
import { useSectionProgress } from "@/features/reader/useSectionProgress";
import { S } from "@/styles/sharedUi";
import { motionPreset } from "@/styles/motionPresets";

/**
 * The reader's own shell: hero, sticky progress bar, collapsible TOC,
 * prev/next section nav, back-to-library, original-file download.
 *
 * Reading-progress persistence (periodic + on-exit save against the
 * version-specific read record) is Phase 4 — this component tracks progress
 * locally via useSectionProgress but doesn't yet write it anywhere.
 */
export function DocumentReaderShell({ doc, onBack }: { doc: Document; onBack: () => void }) {
  const sections = useMemo(() => groupBlocksIntoSections(doc.blocks), [doc.blocks]);
  const toc = doc.toc;
  const sectionIds = useMemo(() => toc.map((item) => item.id), [toc]);
  const progress = useSectionProgress(sectionIds);
  useDocumentReadPersistence(doc, progress, doc.documentVersionId);
  const [tocCollapsed, setTocCollapsed] = useState(false);

  const scrollToId = useCallback((id: string) => {
    window.document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const currentIndex = progress.currentSectionId ? sectionIds.indexOf(progress.currentSectionId) : -1;
  const prevId = currentIndex > 0 ? sectionIds[currentIndex - 1] : null;
  const nextId = currentIndex >= 0 && currentIndex < sectionIds.length - 1 ? sectionIds[currentIndex + 1] : null;

  return (
    <motion.div initial={motionPreset.page.initial} animate={motionPreset.page.animate} transition={motionPreset.page.transition}>
      <ReadingProgressBar percent={progress.percent} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px" }}>
        <motion.button
          type="button"
          onClick={onBack}
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.985 }}
          style={S.btnGhost}
        >
          ← Back to Library
        </motion.button>
        {doc.rawSourceUrl && (
          <motion.a
            href={doc.rawSourceUrl}
            download
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.985 }}
            style={S.btnGhost}
          >
            Download original
          </motion.a>
        )}
      </div>

      <ReaderHero doc={doc} />

      <div
        className="reader-shell-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 260px",
          gap: "24px",
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "0 24px 120px",
          alignItems: "start",
        }}
      >
        <div>
          {sections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", padding: "40px 0" }}>
            {prevId ? (
              <motion.button
                type="button"
                onClick={() => scrollToId(prevId)}
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.985 }}
                style={S.btnGhost}
              >
                ← Previous section
              </motion.button>
            ) : (
              <span />
            )}
            {nextId && (
              <motion.button
                type="button"
                onClick={() => scrollToId(nextId)}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.985 }}
                style={S.btnGhost}
              >
                Next section →
              </motion.button>
            )}
          </div>
        </div>

        <div style={{ position: "sticky", top: "24px" }}>
          <TableOfContents
            toc={toc}
            activeId={progress.currentSectionId}
            collapsed={tocCollapsed}
            onToggleCollapsed={() => setTocCollapsed((collapsed) => !collapsed)}
            onSelect={scrollToId}
          />
        </div>
      </div>

      <style>{`@media (max-width: 1023px) { .reader-shell-grid { grid-template-columns: 1fr !important; } }`}</style>
    </motion.div>
  );
}
