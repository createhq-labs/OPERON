"use client";

import { useEffect, useState } from "react";
import type { Document, DriveParsedDocument } from "@/core/types";
import { getCurrentDocPlatformUser, markDocumentRead } from "@/services/documentPlatform";

const STORAGE_KEY_PREFIX = "reader-progress:";

interface ReaderProgressState {
  sectionId: string | null;
  percent: number;
  updatedAt: string;
}

function getStorageKey(documentId: string) {
  return `${STORAGE_KEY_PREFIX}${documentId}`;
}

function saveReaderProgress(documentId: string, state: ReaderProgressState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(documentId), JSON.stringify(state));
  } catch {
    // Restricted or unavailable environment — ignore.
  }
}

export function useDocumentReadPersistence(
  doc: Document | DriveParsedDocument,
  progress: { currentSectionId: string | null; percent: number },
  documentVersionId?: string,
) {
  const [restored, setRestored] = useState(false);
  const [savedSectionId, setSavedSectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!doc?.id) return;

    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(getStorageKey(doc.id));
      if (!raw) {
        setSavedSectionId(null);
        return;
      }
      const parsed = JSON.parse(raw) as ReaderProgressState | null;
      setSavedSectionId(parsed?.sectionId ?? null);
      setRestored(false);
    } catch {
      setSavedSectionId(null);
      setRestored(false);
    }
  }, [doc.id]);

  useEffect(() => {
    if (!savedSectionId || restored) return;
    if (progress.currentSectionId === savedSectionId) {
      setRestored(true);
      return;
    }

    requestAnimationFrame(() => {
      window.document.getElementById(savedSectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    setRestored(true);
  }, [progress.currentSectionId, restored, savedSectionId]);

  useEffect(() => {
    if (!documentVersionId) return;

    void getCurrentDocPlatformUser()
      .then((user) => {
        if (!user) return;
        return markDocumentRead(documentVersionId, user.id);
      })
      .catch(() => {
        // Best-effort persistence only.
      });
  }, [documentVersionId]);

  useEffect(() => {
    if (!doc?.id || progress.currentSectionId == null) return;

    saveReaderProgress(doc.id, {
      sectionId: progress.currentSectionId,
      percent: progress.percent,
      updatedAt: new Date().toISOString(),
    });
  }, [doc.id, progress.currentSectionId, progress.percent]);
}
