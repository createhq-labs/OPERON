import type { VideoBlock, VideoProvider, VideoTimestamp } from "@/core/operon";

const VIDEO_PATTERNS: Record<VideoProvider, RegExp> = {
  loom: /(?:loom\.com\/share\/|loom\.com\/.+\/(.+))/i,
  vimeo: /(?:vimeo\.com\/(\d+))/i,
  google_drive: /(?:drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+))/i,
  youtube: /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/i,
};

export function isSupportedVideoUrl(url: string) {
  return Object.values(VIDEO_PATTERNS).some((pattern) => pattern.test(url));
}

export function normalizeVideoEmbedUrl(url: string): { provider: VideoProvider; embedUrl: string } | undefined {
  const trimmedUrl = url.trim();

  if (VIDEO_PATTERNS.loom.test(trimmedUrl)) {
    return { provider: "loom", embedUrl: trimmedUrl.replace(/\/share\//i, "/embed/") };
  }

  const vimeoMatch = VIDEO_PATTERNS.vimeo.exec(trimmedUrl);
  if (vimeoMatch) {
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  const driveMatch = VIDEO_PATTERNS.google_drive.exec(trimmedUrl);
  if (driveMatch) {
    return { provider: "google_drive", embedUrl: `https://drive.google.com/file/d/${driveMatch[1]}/preview` };
  }

  const youtubeMatch = VIDEO_PATTERNS.youtube.exec(trimmedUrl);
  if (youtubeMatch) {
    return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}` };
  }

  return undefined;
}

export function createVideoBlock(input: {
  title: string;
  description: string;
  provider: VideoProvider;
  embedUrl: string;
  thumbnail?: string;
  timestamps?: VideoTimestamp[];
  transcript?: string;
  relatedResourceIds?: string[];
  id?: string;
}): VideoBlock {
  return {
    id: input.id ?? `video-${crypto.randomUUID()}`,
    type: "video",
    title: input.title,
    description: input.description,
    provider: input.provider,
    embedUrl: input.embedUrl,
    thumbnail: input.thumbnail,
    timestamps: input.timestamps ?? [],
    transcript: input.transcript,
    relatedResourceIds: input.relatedResourceIds ?? [],
  };
}