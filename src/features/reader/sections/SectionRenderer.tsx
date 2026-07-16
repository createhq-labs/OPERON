"use client";

import type { DocumentSection } from "@/features/reader/types";
import { NarrowColumnSection } from "@/features/reader/sections/NarrowColumnSection";
import { SplitSection } from "@/features/reader/sections/SplitSection";
import { FullWidthStatementSection } from "@/features/reader/sections/FullWidthStatementSection";
import { NumberedProcessSection } from "@/features/reader/sections/NumberedProcessSection";
import { EditorialTableSection } from "@/features/reader/sections/EditorialTableSection";
import { ImageLedSection } from "@/features/reader/sections/ImageLedSection";
import { ChecklistSection } from "@/features/reader/sections/ChecklistSection";

/** Picks the composition component for a section's assigned layout. */
export function SectionRenderer({ section }: { section: DocumentSection }) {
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
    case "narrow-column":
    default:
      return <NarrowColumnSection section={section} />;
  }
}
