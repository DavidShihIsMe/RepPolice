export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — Supabase free-tier per-file cap

export const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
] as const;

export const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

export const VIDEOS_BUCKET = "videos";
