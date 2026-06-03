export const ENABLE_GOOGLE_DRIVE = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE === "true";
export const ENABLE_DRIVE_SYNC = process.env.NEXT_PUBLIC_ENABLE_DRIVE_SYNC === "true";
export const ENABLE_DRIVE_ATTACHMENTS = process.env.NEXT_PUBLIC_ENABLE_DRIVE_ATTACHMENTS === "true";
export const ENABLE_GOOGLE_OAUTH_REDIRECT_URI = Boolean(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI?.trim());
export const ENABLE_GOOGLE_SIGN_IN = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() && process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT_URI?.trim()
);
export const ENABLE_DEV_AUTH = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
