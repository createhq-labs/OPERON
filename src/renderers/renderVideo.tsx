"use client";

import { useState } from "react";
import Image from "next/image";
import type { VideoBlock, VideoProvider } from "@/renderers/types";

const PROVIDER_LABELS: Record<VideoProvider, string> = {
  loom:         "Loom",
  youtube:      "YouTube",
  vimeo:        "Vimeo",
  google_drive: "Drive",
};

function VideoCard({ block }: { block: VideoBlock["content"] }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const label = PROVIDER_LABELS[block.provider] ?? "Video";

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border:       "1px solid var(--op-border)",
        background:   "var(--op-surface)",
        overflow:     "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:      "16px 20px",
          borderBottom: "1px solid var(--op-border)",
          display:      "flex",
          alignItems:   "flex-start",
          gap:          "16px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Provider badge */}
          <div
            style={{
              display:       "inline-flex",
              alignItems:    "center",
              borderRadius:  "var(--r-full)",
              border:        "1px solid var(--op-border)",
              background:    "var(--op-surface-2)",
              padding:       "2px 10px",
              fontFamily:    "var(--font-ui)",
              fontSize:      "var(--text-11)",
              fontWeight:    600,
              letterSpacing: "0.04em",
              color:         "var(--op-text-3)",
              marginBottom:  "8px",
            }}
          >
            {label}
          </div>

          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize:   "var(--text-16)",
              fontWeight: 500,
              color:      "var(--op-text)",
              margin:     0,
              lineHeight: 1.3,
            }}
          >
            {block.title}
          </h3>

          {block.description && (
            <p
              style={{
                marginTop:  "6px",
                fontFamily: "var(--font-body)",
                fontSize:   "var(--text-13)",
                lineHeight: 1.6,
                color:      "var(--op-text-2)",
                margin:     "6px 0 0",
              }}
            >
              {block.description}
            </p>
          )}
        </div>

        {block.thumbnail && (
          <div
            style={{
              flexShrink:   0,
              width:        "64px",
              height:       "64px",
              borderRadius: "var(--r-md)",
              overflow:     "hidden",
              border:       "1px solid var(--op-border)",
            }}
          >
            <Image
              src={block.thumbnail}
              alt=""
              width={64}
              height={64}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
              unoptimized
            />
          </div>
        )}
      </div>

      {/* Embed */}
      <div
        style={{
          background: "var(--op-bg)",
          aspectRatio: "16 / 9",
          position:   "relative",
        }}
      >
        <iframe
          src={block.embedUrl}
          title={block.title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          style={{
            position: "absolute",
            inset:    0,
            width:    "100%",
            height:   "100%",
            border:   "none",
            display:  "block",
          }}
        />
      </div>

      {/* Transcript */}
      {block.transcript !== undefined && (
        <div style={{ borderTop: "1px solid var(--op-border)" }}>
          <button
            type="button"
            onClick={() => setTranscriptOpen((v) => !v)}
            style={{
              width:          "100%",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "12px 20px",
              background:     "transparent",
              border:         "none",
              cursor:         "pointer",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize:   "var(--text-13)",
                fontWeight: 600,
                color:      "var(--op-text-2)",
              }}
            >
              Transcript
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{
                color:      "var(--op-text-3)",
                transition: "transform 200ms",
                transform:  transcriptOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              <path
                d="M4 6l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {transcriptOpen && (
            <div
              style={{
                padding:    "0 20px 16px",
                fontFamily: "var(--font-body)",
                fontSize:   "var(--text-13)",
                lineHeight: 1.8,
                color:      "var(--op-text-2)",
                whiteSpace: "pre-wrap",
                maxHeight:  "220px",
                overflowY:  "auto",
              }}
              className="scrollbar-thin"
            >
              {block.transcript || "Transcript unavailable."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function renderVideo(block: VideoBlock, index: number) {
  return (
    <VideoCard
      key={block.id ?? `video-${index}`}
      block={block.content}
    />
  );
}