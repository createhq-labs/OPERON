import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { StorageBucket } from "@/services/storage";
import type { StorageProvider, StorageUploadMetadata } from "./provider";

async function computeFileChecksum(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

export function createSupabaseStorageProvider(): StorageProvider {
  return {
    async createSecurePreviewUrl(bucket, path, expiresInSeconds = 60 * 60) {
      if (!isSupabaseConfigured()) return undefined;
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data?.signedUrl) {
        console.warn("Unable to create secure preview URL", { bucket, path, error });
        return undefined;
      }
      return data.signedUrl;
    },

    async uploadFile(file, authorId, options) {
      if (!isSupabaseConfigured()) return undefined;
      const bucket = options?.tag === "finance" ? "finance" : options?.tag === "hr" ? "hr" : options?.tag === "onboarding" ? "onboarding" : "documents";
      const safeName = file.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").replace(/-+/g, "-").trim();
      const storagePath = `${authorId}/${Date.now()}-${safeName}`;
      const fileChecksum = await computeFileChecksum(file);
      const { data, error } = await supabase.storage.from(bucket).upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error || !data?.path) {
        console.warn("Supabase storage provider upload failed", { bucket, path: storagePath, error });
        return undefined;
      }
      const publicUrl = supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl ?? "";
      const previewUrl = await this.createSecurePreviewUrl(bucket, data.path);
      return {
        fileName: file.name,
        bucket,
        path: data.path,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        uploadedBy: authorId,
        publicUrl,
        previewUrl,
        fileChecksum,
        storageVersion: "v1",
        storageRegion: process.env.NEXT_PUBLIC_STORAGE_REGION ?? "unknown",
        ingestionSource: "localUpload",
      };
    },
  };
}
