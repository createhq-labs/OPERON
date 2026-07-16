"use client";

import { motion } from "framer-motion";
import type { DocumentSection } from "@/features/reader/types";
import { NarrowColumnSection } from "@/features/reader/sections/NarrowColumnSection";
import { SplitSection } from "@/features/reader/sections/SplitSection";
import { FullWidthStatementSection } from "@/features/reader/sections/FullWidthStatementSection";
import { NumberedProcessSection } from "@/features/reader/sections/NumberedProcessSection";
import { EditorialTableSection } from "@/features/reader/sections/EditorialTableSection";
import { ImageLedSection } from "@/features/reader/sections/ImageLedSection";
import { ChecklistSection } from "@/features/reader/sections/ChecklistSection";
import { QuoteSection } from "@/features/reader/sections/QuoteSection";
import { GallerySection } from "@/features/reader/sections/GallerySection";
import { TimelineSection } from "@/features/reader/sections/TimelineSection";
import { FeatureCardsSection } from "@/features/reader/sections/FeatureCardsSection";
import { spring } from "@/styles/motionPresets";

function renderLayout(section: DocumentSection) {
  switch (section.layout) {
    case "split":
      return <SplitSection section={section} />;
    case "full-width-statement":
      return <FullWidthStatementSection section={section} />;
    case "numbered-process":
      return <NumberedProcessSection section={section} />;
    case "editorial-table":
      return <EditorialTableSection section={section} />;
    case "image-led":
      return <ImageLedSection section={section} />;
    case "checklist":
      return <ChecklistSection section={section} />;
    case "quote":
      return <QuoteSection section={section} />;
    case "gallery":
      return <GallerySection section={section} />;
    case "timeline":
      return <TimelineSection section={section} />;
    case "feature-cards":
      return <FeatureCardsSection section={section} />;
    case "narrow-column":
    default:
      return <NarrowColumnSection section={section} />;
  }
}

/** Picks the composition component for a section's assigned layout and reveals it as it scrolls into view. */
export function SectionRenderer({ section }: { section: DocumentSection }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={spring.soft}
    >
      {renderLayout(section)}
    </motion.div>
  );
}
