"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { analyzeVideoSrc } from "@/lib/squat/runner";
import type { AnalysisResult } from "@/lib/squat/types";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  VIDEOS_BUCKET,
} from "@/lib/constants";

type Status =
  | "idle"
  | "validating"
  | "analyzing"
  | "uploading"
  | "saving"
  | "done"
  | "error";

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function validate(f: File): string | null {
    if (f.size > MAX_FILE_BYTES) {
      return `File is too large (${formatBytes(f.size)}). Max is ${formatBytes(MAX_FILE_BYTES)}.`;
    }
    const ext = getExtension(f.name);
    const mimeOk = (ALLOWED_MIME_TYPES as readonly string[]).includes(f.type);
    const extOk = (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
    if (!mimeOk && !extOk) {
      return `Unsupported file type. Use MP4, MOV, or WebM.`;
    }
    return null;
  }

  function handleFile(f: File) {
    setError(null);
    setProgress(0);
    setStatus("validating");
    const err = validate(f);
    if (err) {
      setError(err);
      setStatus("error");
      setFile(null);
      return;
    }
    setFile(f);
    setStatus("idle");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function uploadXhr(url: string, accessToken: string, body: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.setRequestHeader("Content-Type", body.type || "application/octet-stream");
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setProgress(ev.loaded / ev.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new Error("Upload aborted"));
      xhr.send(body);
    });
  }

  async function startUpload() {
    if (!file) return;
    setError(null);
    setProgress(0);

    const supabase = createClient();
    const blobUrl = URL.createObjectURL(file);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in.");

      // Phase 1: analyze the local file. Failure here is non-fatal — we still
      // upload, just without analysis attached, and the user can click
      // Re-analyze on the submission page.
      setStatus("analyzing");
      let analysis: AnalysisResult | null = null;
      try {
        analysis = await analyzeVideoSrc(blobUrl, {
          onProgress: (p) => setProgress(p),
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Pre-upload analysis failed; continuing without it.", e);
      }

      // Phase 2: storage upload.
      setStatus("uploading");
      setProgress(0);

      const submissionId = crypto.randomUUID();
      const ext = getExtension(file.name) || ".mp4";
      const storagePath = `${userId}/${submissionId}${ext}`;

      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
      const objectUrl = `${baseUrl}/storage/v1/object/${VIDEOS_BUCKET}/${storagePath}`;
      await uploadXhr(objectUrl, session.access_token, file);

      // Phase 3: row insert (with analysis if we got one).
      setStatus("saving");
      const { error: insertErr } = await supabase.from("submissions").insert({
        id: submissionId,
        user_id: userId,
        storage_path: storagePath,
        original_filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        status: "uploaded",
        analysis,
      });
      if (insertErr) throw insertErr;

      setStatus("done");
      router.push(`/submissions/${submissionId}`);
      router.refresh();
    } catch (e) {
      // Supabase errors are plain objects with .message (not Error instances),
      // so check for that shape too. Falls back to JSON.stringify so nothing
      // ever silently swallows the cause.
      let msg = "Upload failed.";
      if (e instanceof Error) {
        msg = e.message;
      } else if (typeof e === "object" && e !== null) {
        const obj = e as { message?: string };
        msg = obj.message || JSON.stringify(e);
      } else if (typeof e === "string") {
        msg = e;
      }
      // eslint-disable-next-line no-console
      console.error("Upload error:", e);
      setError(msg);
      setStatus("error");
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  const isWorking =
    status === "analyzing" || status === "uploading" || status === "saving";
  const pct = Math.round(progress * 100);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={isWorking}
        className={`w-full rounded-2xl border-2 border-dashed transition-colors px-6 py-14 text-center ${
          dragging
            ? "border-accent bg-accent/5"
            : "border-border hover:border-accent/40 bg-surface"
        } disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <div className="flex justify-center mb-3 text-accent">
          <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
            <path
              d="M8 22 C3 22 3 16 7 14 C7 9 12 6 16 9 C20 6 25 9 25 14 C29 16 29 22 24 22"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M16 14 V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M12 18 L16 14 L20 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-sm font-medium mb-1">
          {file ? file.name : "Drag a video here, or click to choose"}
        </p>
        <p className="text-xs text-gray-500">
          {file
            ? `${formatBytes(file.size)} · ${file.type || "video"}`
            : "MP4, MOV, or WebM"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </button>

      {isWorking && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>
              {status === "analyzing"
                ? "Analyzing form…"
                : status === "uploading"
                  ? "Uploading…"
                  : "Saving…"}
            </span>
            <span>
              {status === "analyzing" || status === "uploading" ? `${pct}%` : ""}
            </span>
          </div>
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{
                width:
                  status === "analyzing" || status === "uploading"
                    ? `${pct}%`
                    : "100%",
              }}
            />
          </div>
          {status === "analyzing" && (
            <p className="text-[11px] text-gray-500 mt-2">
              Detecting reps before upload — runs locally in your browser.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={startUpload}
          disabled={!file || isWorking}
          className="px-5 py-2.5 bg-accent text-black font-semibold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "analyzing"
            ? "Analyzing…"
            : status === "uploading"
              ? "Uploading…"
              : status === "saving"
                ? "Saving…"
                : "Upload"}
        </button>
        {file && !isWorking && (
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setError(null);
              setProgress(0);
              setStatus("idle");
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-sm text-gray-400 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
