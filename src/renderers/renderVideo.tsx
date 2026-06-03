import { useState } from "react";
import Image from "next/image";

export function renderVideo(block: { content: any; id?: string }, index: number) {
  return <VideoBlockCard key={block.id ?? `video-${index}`} block={block.content} />;
}

function VideoBlockCard({ block }: { block: any }) {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const providerLabels: Record<string, string> = {
    loom: "Loom",
    google_drive: "Google Drive",
    vimeo: "Vimeo",
  };

  return (
    <div className="rounded-3xl border border-border p-5 bg-bg-primary/80">
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-content-tertiary">{providerLabels[block.provider] ?? "Video"}</p>
          <h3 className="mt-2 text-xl font-semibold text-content-primary">{block.title}</h3>
          <p className="mt-2 text-sm leading-7 text-content-secondary">{block.description}</p>
        </div>
        {block.thumbnail ? (
          <div className="relative h-24 w-24 overflow-hidden rounded-3xl">
            <Image
              src={block.thumbnail}
              alt={block.title}
              width={96}
              height={96}
              className="object-cover"
              unoptimized
            />
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-[28px] bg-bg-secondary shadow-sm">
        <div className="relative aspect-video w-full">
          <iframe
            src={block.embedUrl}
            title={block.title}
            allow="autoplay; fullscreen; picture-in-picture"
            className="h-full w-full border-0"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-border-subtle bg-bg-secondary p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-content-primary">Transcript</div>
              <p className="mt-1 text-sm text-content-secondary">Expandable transcript for guided playback.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsTranscriptOpen((current) => !current)}
              className="rounded-full border border-border-subtle bg-bg-primary/80 px-3 py-2 text-xs font-semibold text-content-primary transition hover:border-accent-soft"
            >
              {isTranscriptOpen ? "Hide" : "Show"}
            </button>
          </div>
          {isTranscriptOpen ? (
            <div className="mt-4 max-h-52 overflow-y-auto rounded-3xl border border-border bg-bg-primary/80 p-4 text-sm leading-6 text-content-secondary whitespace-pre-wrap">
              {block.transcript ?? "Transcript unavailable for this walkthrough."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
