"use client";

import { useEffect, useRef, useState } from "react";

export interface SectionProgressState {
  currentSectionId: string | null;
  /** Index (into sectionIds) of the furthest section reached so far — never decreases. */
  furthestIndex: number;
  /** 0-100, based on furthest section reached, not raw scroll distance. */
  percent: number;
}

/**
 * Scroll-spy over a document's heading anchors (the same ids renderHeading
 * already sets via anchorId). Tracks the furthest section reached, not just
 * whatever's currently on screen — matches "highest original section/block
 * reached", not scroll position, per the reading-progress spec.
 *
 * Callers should memoize `sectionIds` (e.g. via useMemo) — this hook re-runs
 * its IntersectionObserver setup whenever the array reference changes.
 */
export function useSectionProgress(sectionIds: string[]): SectionProgressState {
  const [state, setState] = useState<SectionProgressState>({
    currentSectionId: sectionIds[0] ?? null,
    furthestIndex: 0,
    percent: 0,
  });
  const furthestRef = useRef(0);

  useEffect(() => {
    furthestRef.current = 0;
    if (sectionIds.length === 0) return;

    const elements = sectionIds
      .map((id) => window.document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;

        const topId = visible[0].target.id;
        const index = sectionIds.indexOf(topId);
        if (index === -1) return;

        furthestRef.current = Math.max(furthestRef.current, index);
        setState({
          currentSectionId: topId,
          furthestIndex: furthestRef.current,
          percent: Math.round(((furthestRef.current + 1) / sectionIds.length) * 100),
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [sectionIds]);

  return state;
}
