import type { Document } from "@/core/operon";

export interface VersionSnapshot {
  id: string;
  documentId: string;
  versionNumber: number;
  createdById: string;
  createdAt: string;
  summary: string;
  snapshot: Document;
}

export function createVersionSnapshot(document: Document, createdById: string, summary: string): VersionSnapshot {
  return {
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    documentId: document.id,
    versionNumber: parseInt(document.version || "0", 10) + 1,
    createdById,
    createdAt: new Date().toISOString(),
    summary,
    snapshot: { ...document },
  };
}
