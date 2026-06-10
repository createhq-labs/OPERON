import { useState } from "react";
import Image from "next/image";
import type { VideoBlock, VideoProvider } from "@/renderers/types";

const PROVIDER_LABELS: Record<VideoProvider, string> = {
  loom: "Loom",
  youtube: "YouTube",
  vimeo: "Vimeo",
  google_drive: "Google Drive",
};

interface VideoBlockCardProps {
  block: VideoBlock["content"];
}

function VideoBlockCard({ block }: VideoBlockCardProps) {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const providerLabel = PROVIDER_LABELS[block.provider] ?? "Video";

  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: block.thumbnail ? "1fr auto" : "1fr",
          gap: "16px",
          marginBottom: "16px",
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              marginBottom: "6px",
            }}
          >
            {providerLabel}
          </div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-16)",
              fontWeight: 600,
              color: "var(--text)",
              margin: 0,
            }}
          >
            {block.title}
          </h3>
          {block.description && (
            <p
              style={{
                marginTop: "6px",
                fontFamily: "var(--font-body)",
                fontSize: "13px",
                lineHeight: "1.6",
                color: "var(--text-2)",
              }}
            >
              {block.description}
            </p>
          )}
        </div>

        {block.thumbnail && (
          <div
            style={{
              position: "relative",
              width: "80px",
              height: "80px",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <Image
              src={block.thumbnail}
              alt={block.title}
              width={80}
              height={80}
              style={{ objectFit: "cover" }}
              unoptimized
            />
          </div>
        )}
      </div>

      <div
        style={{
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          background: "var(--surface-2)",
          aspectRatio: "16 / 9",
        }}
      >
        <iframe
          src={block.embedUrl}
          title={block.title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
      </div>

      {(block.transcript !== undefined) && (
        <div
          style={{
            marginTop: "12px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Transcript
            </div>
            <button
              type="button"
              onClick={() => setIsTranscriptOpen((v) => !v)}
              style={{
                flexShrink: 0,
                borderRadius: "var(--r-full)",
                border: "1px solid var(--border)",
                background: "transparent",
                padding: "4px 12px",
                fontFamily: "var(--font-ui)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-2)",
                cursor: "pointer",
                transition: "border-color 150ms ease, color 150ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-hover)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)";
              }}
            >
              {isTranscriptOpen ? "Hide" : "Show"}
            </button>
          </div>

          {isTranscriptOpen && (
            <div
              style={{
                marginTop: "12px",
                maxHeight: "200px",
                overflowY: "auto",
                borderRadius: "var(--r-sm)",
                background: "var(--surface-3)",
                padding: "12px 14px",
                fontFamily: "var(--font-body)",
                fontSize: "13px",
                lineHeight: "1.7",
                color: "var(--text-2)",
                whiteSpace: "pre-wrap",
              }}
            >
              {block.transcript ?? "Transcript unavailable."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function renderVideo(block: VideoBlock, index: number) {
  return <VideoBlockCard key={block.id ?? `video-${index}`} block={block.content} />;
}