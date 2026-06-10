"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback } from "react";
import { uploadToProvider } from "@/services/drive";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = "idle" | "uploading" | "processing" | "syncing" | "complete" | "error";

interface UploadState {
  status: UploadStatus;
  progress: number;
  fileName?: string;
  errorMessage?: string;
}

interface DocumentUploadProps {
  onUpload?: (fileId: string, fileName: string) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<UploadStatus, string> = {
  idle: "Drop files or click to upload",
  uploading: "Uploading to Drive…",
  processing: "Processing document…",
  syncing: "Syncing to Operon…",
  complete: "Ready",
  error: "Upload failed",
};

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

const IDLE_STATE: UploadState = { status: "idle", progress: 0 };

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentUpload({
  onUpload,
  onError,
  disabled = false,
}: DocumentUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>(IDLE_STATE);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      if (disabled) return;

      setUploadState({ status: "uploading", progress: 0, fileName: file.name });

      try {
        // Upload to Google Drive via the provider abstraction.
        // uploadToProvider reports progress via the callback and returns the Drive file ID.
        const fileId = await uploadToProvider(file, (progress) => {
          setUploadState((prev) => ({ ...prev, progress }));
        });

        setUploadState((prev) => ({ ...prev, status: "processing", progress: 100 }));

        // Parser runs asynchronously server-side; brief UI hold to reflect state.
        await new Promise<void>((resolve) => setTimeout(resolve, 600));

        setUploadState((prev) => ({ ...prev, status: "syncing" }));

        await new Promise<void>((resolve) => setTimeout(resolve, 400));

        setUploadState({ status: "complete", progress: 100, fileName: file.name });

        onUpload?.(fileId, file.name);

        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        setUploadState(IDLE_STATE);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setUploadState({
          status: "error",
          progress: 0,
          fileName: file.name,
          errorMessage: error.message,
        });
        onError?.(error);

        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        setUploadState(IDLE_STATE);
      }
    },
    [disabled, onUpload, onError]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    if (dragCountRef.current === 1) setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      handleFile(file);
      // Reset input so the same file can be re-selected after an error.
      e.currentTarget.value = "";
    }
  };

  const isActive = uploadState.status !== "idle";
  const isError = uploadState.status === "error";

  return (
    <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto" }}>
      <motion.div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isActive && fileInputRef.current?.click()}
        animate={{
          borderColor: isError
            ? "rgba(239,68,68,0.5)"
            : isDragging
            ? "var(--accent)"
            : "var(--border)",
          background: isDragging ? "var(--surface-2)" : "var(--surface)",
        }}
        transition={{ duration: 0.15 }}
        style={{
          border: "1px dashed var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "36px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          cursor: isActive || disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : "auto",
          minHeight: "160px",
          transition: "background 150ms",
        }}
      >
        <AnimatePresence mode="wait">
          {uploadState.status === "idle" ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "var(--r-md)",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-3)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M9 12V4M9 4L6 7M9 4l3 3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 13v1a1 1 0 001 1h10a1 1 0 001-1v-1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-14)",
                    fontWeight: 500,
                    color: "var(--text-2)",
                    marginBottom: "4px",
                  }}
                >
                  {isDragging ? "Drop to upload" : "Upload document"}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-12)",
                    color: "var(--text-3)",
                  }}
                >
                  Drag and drop, or click to select
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "14px",
                width: "100%",
              }}
            >
              {/* Progress bar */}
              {!isError && (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "280px",
                    height: "2px",
                    background: "var(--surface-3)",
                    borderRadius: "1px",
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadState.progress}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    style={{
                      height: "100%",
                      background: uploadState.status === "complete"
                        ? "#4ade80"
                        : "var(--accent)",
                      borderRadius: "1px",
                    }}
                  />
                </div>
              )}

              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--text-14)",
                    fontWeight: 500,
                    color: isError ? "rgba(239,68,68,0.8)" : "var(--text-2)",
                    marginBottom: "4px",
                  }}
                >
                  {STATUS_LABELS[uploadState.status]}
                </p>
                {uploadState.fileName && (
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "var(--text-12)",
                      color: "var(--text-3)",
                      maxWidth: "280px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {uploadState.fileName}
                  </p>
                )}
              </div>

              {/* Animated dots — only while actively working */}
              {!isError && uploadState.status !== "complete" && (
                <div style={{ display: "flex", gap: "4px" }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.7, delay: i * 0.12, repeat: Infinity }}
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        background: "var(--text-3)",
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME_TYPES}
          style={{ display: "none" }}
          onChange={handleInputChange}
          disabled={disabled}
        />
      </motion.div>

      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-12)",
          color: "var(--text-3)",
          textAlign: "center",
          marginTop: "12px",
        }}
      >
        PDF, Word, Excel, Markdown, CSV, and images
      </p>
    </div>
  );
}