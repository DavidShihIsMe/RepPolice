"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PoseOverlay from "@/components/PoseOverlay";

export default function LabClient() {
  const [file, setFile] = useState<File | null>(null);
  const blobUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return (
    <div className="space-y-6">
      <FilePicker file={file} onPick={setFile} />

      {blobUrl ? (
        <PoseOverlay src={blobUrl} label="MediaPipe Pose (Full)" />
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-gray-400">
          Pick a video above to start.
        </div>
      )}
    </div>
  );
}

function FilePicker({
  file,
  onPick,
}: {
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface border border-border px-4 py-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-3.5 py-1.5 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors"
      >
        Choose video
      </button>
      <p className="text-sm text-gray-400 truncate flex-1">
        {file ? file.name : "MP4 / MOV / WebM"}
      </p>
      {file && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-xs text-gray-400 hover:text-white"
        >
          Clear
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
    </div>
  );
}
