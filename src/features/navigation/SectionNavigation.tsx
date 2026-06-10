"use client";

import type { MouseEvent } from "react";
import { motion } from "framer-motion";

type SectionLabelMap = Record<string, string>;

interface SectionNavigationProps {
  sections: string[];
  selectedSection: string;
  labels: SectionLabelMap;
  onSelect: (section: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

export function SectionNavigation({ sections, selectedSection, labels, onSelect }: SectionNavigationProps) {
  return (
    <motion.div
      className="mb-8 flex flex-wrap gap-2"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {sections.map((section) => {
        const isActive = selectedSection === section;
        return (
          <motion.button
            key={section}
            type="button"
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              onSelect(section);
            }}
            variants={itemVariants}
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.98 }}
            className={`relative px-4 py-2 rounded-full font-600 text-sm transition-all duration-250 ${
              isActive
                ? "text-white"
                : "text-text-secondary hover:text-white"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="active-nav-pill"
                className="absolute inset-0 rounded-full glass-card border-white/12 -z-10"
                transition={{ duration: 0.25 }}
              />
            )}
            {labels[section] ?? section}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
