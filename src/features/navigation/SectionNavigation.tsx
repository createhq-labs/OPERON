"use client";

import type { MouseEvent } from "react";

type SectionLabelMap = Record<string, string>;

interface SectionNavigationProps {
  sections: string[];
  selectedSection: string;
  labels: SectionLabelMap;
  onSelect: (section: string) => void;
}

export function SectionNavigation({ sections, selectedSection, labels, onSelect }: SectionNavigationProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-3">
      {sections.map((section) => (
        <button
          key={section}
          type="button"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            onSelect(section);
          }}
          className={`operon-pill px-4 py-2 text-sm font-medium transition ${
            selectedSection === section
              ? "operon-pill-active text-content-primary"
              : "text-content-secondary hover:bg-bg-secondary/70"
          }`}
        >
          {labels[section] ?? section}
        </button>
      ))}
    </div>
  );
}
