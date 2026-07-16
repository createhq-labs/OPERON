"use client";

import { motion } from "framer-motion";
import { renderBlock } from "@/renderers";
import type { DocumentSection } from "@/features/reader/types";

/** 3+ images with no accompanying text — a responsive gallery grid instead of stacking them one at a time. */
export function GallerySection({ section }: { section: DocumentSection }) {
  const body = section.headingBlock ? section.blocks.slice(1) : section.blocks;
  const images = body.filter((block) => block.type === "image");

  return (
    <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 24px" }}>
      {section.headingBlock && (
        <div style={{ marginBottom: "40px" }}>{renderBlock(section.headingBlock, 0)}</div>
      )}
      <div
        className="reader-gallery-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}
      >
        {images.map((block, index) => (
          // renderImage/renderBlock already applies the imageReveal scroll-in
          // motion per image — this wrapper only adds the grid-cell hover lift.
          <motion.div key={index} whileHover={{ y: -3 }}>
            {renderBlock(block, index)}
          </motion.div>
        ))}
      </div>
      <style>{`
        @media (max-width: 900px) { .reader-gallery-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 560px) { .reader-gallery-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
