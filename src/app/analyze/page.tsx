"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAnalysis } from "@/lib/analysisStore";

const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const MIN_DURATION = 3; // seconds
const MAX_DURATION = 60; // seconds

type Mode = "choose" | "upload" | "record";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getVideoDuration(file: File | Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (video.duration === Infinity || isNaN(video.duration)) {
        reject(new Error("Could not determine video duration"));
      } else {
        resolve(video.duration);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load video metadata"));
    };
    video.src = url;
  });
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function UploadIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <path
        d="M10 28C5 28 5 21 9 19C9 13 14 10 19 13C24 10 29 13 29 19C33 21 33 28 28 28"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 18V32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 23L20 18L25 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className}>
      <rect x="4" y="12" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M28 17L36 13V29L28 25Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="21" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
      <path d="M4 10L8 14L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <path d="M3 6H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 6V4C8 3.45 8.45 3 9 3H11C11.55 3 12 3.45 12 4V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 6L6 16C6 16.55 6.45 17 7 17H13C13.55 17 14 16.55 14 16L15 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Animated Skeleton Figure ────────────────────────────────────────────────

function SkeletonFigure() {
  return (
    <div className="relative w-40 h-56 mx-auto">
      {/* Glow behind figure */}
      <div className="absolute inset-0 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" />
      <svg viewBox="0 0 120 180" fill="none" className="relative w-full h-full animate-skeleton-squat">
        {/* Head */}
        <circle cx="60" cy="20" r="10" stroke="#22d3ee" strokeWidth="2" fill="none" opacity="0.8" />
        {/* Spine */}
        <line x1="60" y1="30" x2="60" y2="80" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        {/* Shoulders */}
        <line x1="35" y1="45" x2="85" y2="45" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        {/* Left arm */}
        <line x1="35" y1="45" x2="28" y2="72" stroke="#22d3ee" strokeWidth="1.5" opacity="0.4" />
        {/* Right arm */}
        <line x1="85" y1="45" x2="92" y2="72" stroke="#22d3ee" strokeWidth="1.5" opacity="0.4" />
        {/* Hips */}
        <line x1="45" y1="80" x2="75" y2="80" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        {/* Left leg */}
        <line x1="45" y1="80" x2="35" y2="120" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        <line x1="35" y1="120" x2="30" y2="160" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        {/* Right leg */}
        <line x1="75" y1="80" x2="85" y2="120" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        <line x1="85" y1="120" x2="90" y2="160" stroke="#22d3ee" strokeWidth="2" opacity="0.6" />
        {/* Joint dots */}
        {[[60, 20], [35, 45], [85, 45], [60, 80], [45, 80], [75, 80], [35, 120], [85, 120], [30, 160], [90, 160]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3" fill="#22d3ee" opacity="0.9">
            <animate
              attributeName="opacity"
              values="0.5;1;0.5"
              dur="2s"
              begin={`${i * 0.15}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
        {/* Scanning line */}
        <line x1="10" y1="0" x2="110" y2="0" stroke="#22d3ee" strokeWidth="1" opacity="0.3">
          <animate attributeName="y1" values="0;180;0" dur="3s" repeatCount="indefinite" />
          <animate attributeName="y2" values="0;180;0" dur="3s" repeatCount="indefinite" />
        </line>
      </svg>
    </div>
  );
}

// ─── Processing Screen ───────────────────────────────────────────────────────

function ProcessingScreen({
  progress,
  stage,
}: {
  progress: number;
  stage: string;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-[#0a0a0a] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <SkeletonFigure />

        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-white">{stage}</p>
          <p className="text-4xl font-bold font-mono text-cyan-400">{progress}%</p>
        </div>

        {/* Progress bar */}
        <div className="space-y-3">
          <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Stage indicators */}
          <div className="flex justify-between text-xs text-gray-500">
            <span className={progress >= 1 ? "text-cyan-400" : ""}>Loading model</span>
            <span className={progress >= 15 ? "text-cyan-400" : ""}>Detecting pose</span>
            <span className={progress >= 95 ? "text-cyan-400" : ""}>Analyzing form</span>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600">
          This may take 10–30 seconds depending on video length
        </p>
      </div>
    </div>
  );
}

// ─── Upload Drop Zone ────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  onBack,
}: {
  onFile: (file: File, duration: number) => void;
  onBack: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Unsupported file type. Please upload an MP4, MOV, or WebM video.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File is too large (${formatFileSize(file.size)}). Maximum size is 500 MB.`);
        return;
      }

      setValidating(true);
      try {
        const duration = await getVideoDuration(file);
        if (duration < MIN_DURATION) {
          setError(`Video is too short (${duration.toFixed(1)}s). Minimum duration is ${MIN_DURATION} seconds.`);
          setValidating(false);
          return;
        }
        if (duration > MAX_DURATION) {
          setError(`Video is too long (${formatTime(Math.round(duration))}). Maximum duration is ${MAX_DURATION} seconds.`);
          setValidating(false);
          return;
        }
        setValidating(false);
        onFile(file, duration);
      } catch {
        setError("Could not read video duration. The file may be corrupted.");
        setValidating(false);
      }
    },
    [onFile]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      dragCounter.current = 0;
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeftIcon /> Back
      </button>

      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-12 sm:p-16
          flex flex-col items-center justify-center text-center
          transition-all duration-200
          ${
            dragging
              ? "border-accent bg-accent/5 scale-[1.01]"
              : "border-gray-700 hover:border-gray-500 bg-surface"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          onChange={onInputChange}
          className="hidden"
        />

        <div className={`mb-4 ${dragging ? "text-accent" : "text-gray-500"} transition-colors`}>
          <UploadIcon className="w-12 h-12" />
        </div>

        <p className="text-base font-medium mb-1">
          {dragging ? "Drop your video here" : "Drag & drop your video here"}
        </p>
        <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
        <p className="text-xs text-gray-600">MP4, MOV, or WebM &middot; up to 500 MB &middot; 3–60 seconds</p>
      </div>

      {validating && (
        <div className="flex items-center gap-3 text-sm text-gray-300 bg-surface-light border border-border rounded-lg px-4 py-3">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
          Checking video...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Camera Recorder ─────────────────────────────────────────────────────────

function CameraRecorder({
  onRecorded,
  onBack,
}: {
  onRecorded: (blob: Blob) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError(
        "Could not access camera. Please allow camera permissions and try again."
      );
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      onRecorded(blob);
      stopStream();
    };
    mediaRecorderRef.current = mr;
    mr.start(100);

    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, [onRecorded, stopStream]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  const handleBack = useCallback(() => {
    if (recording) stopRecording();
    stopStream();
    onBack();
  }, [recording, stopRecording, stopStream, onBack]);

  return (
    <div className="space-y-4">
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeftIcon /> Back
      </button>

      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Loading state */}
        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Starting camera...</p>
            </div>
          </div>
        )}

        {/* Recording indicator */}
        {recording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-mono font-medium text-white">
              {formatTime(elapsed)}
            </span>
          </div>
        )}

        {/* Controls overlay */}
        {cameraReady && (
          <div className="absolute bottom-0 inset-x-0 flex justify-center pb-6 pt-12 bg-gradient-to-t from-black/60 to-transparent">
            {recording ? (
              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform"
                aria-label="Stop recording"
              >
                <div className="w-6 h-6 bg-red-500 rounded-sm" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform"
                aria-label="Start recording"
              >
                <div className="w-12 h-12 bg-red-500 rounded-full" />
              </button>
            )}
          </div>
        )}
      </div>

      {recording && (
        <p className="text-center text-sm text-gray-500">
          Tap the stop button when you&apos;re done recording your set.
        </p>
      )}

      {!recording && cameraReady && (
        <p className="text-center text-sm text-gray-500">
          Position your camera, then tap the record button to start.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
          {error}
          <button onClick={startCamera} className="ml-auto text-accent underline text-xs">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Video Preview + Analyze Button ──────────────────────────────────────────

function VideoPreview({
  videoUrl,
  fileName,
  fileSize,
  duration,
  onDiscard,
  onAnalyze,
  disabled,
}: {
  videoUrl: string;
  fileName: string;
  fileSize: number;
  duration: number;
  onDiscard: () => void;
  onAnalyze: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
        <video
          src={videoUrl}
          controls
          playsInline
          className="w-full h-full object-contain"
        />
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-400 shrink-0">
            <CheckIcon />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            <p className="text-xs text-gray-500">
              {formatFileSize(fileSize)} &middot; {duration.toFixed(1)}s &middot; Ready for analysis
            </p>
          </div>
        </div>

        <button
          onClick={onDiscard}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 text-sm transition-colors shrink-0 ${
            disabled ? "text-gray-600 cursor-not-allowed" : "text-gray-500 hover:text-red-400"
          }`}
        >
          <TrashIcon /> Discard
        </button>
      </div>

      <button
        onClick={onAnalyze}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 px-8 py-4 font-semibold rounded-xl transition-colors text-base ${
          disabled
            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
            : "bg-accent text-black hover:bg-accent-hover shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:shadow-[0_0_32px_rgba(34,211,238,0.35)]"
        }`}
      >
        Analyze My Form
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path
            fillRule="evenodd"
            d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const router = useRouter();
  const { setAnalysis } = useAnalysis();

  const [mode, setMode] = useState<Mode>("choose");
  const [videoFile, setVideoFile] = useState<File | Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("recorded-video.webm");
  const [videoSize, setVideoSize] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const clearVideo = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoName("");
    setVideoSize(0);
    setVideoDuration(0);
    setAnalyzing(false);
    setAnalysisProgress(0);
    setAnalysisStage("");
    setAnalysisError(null);
    setMode("choose");
  }, [videoUrl]);

  const handleFile = useCallback((file: File, duration: number) => {
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setVideoSize(file.size);
    setVideoDuration(duration);
  }, []);

  const handleRecorded = useCallback(async (blob: Blob) => {
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    setVideoFile(blob);
    setVideoUrl(URL.createObjectURL(blob));
    setVideoName(`recording-${Date.now()}.${ext}`);
    setVideoSize(blob.size);
    try {
      const dur = await getVideoDuration(blob);
      setVideoDuration(dur);
    } catch {
      setVideoDuration(0);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoUrl || !videoFile) return;
    setAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStage("Loading AI model...");
    setAnalysisError(null);

    try {
      const { processVideo } = await import("@/lib/poseDetection");
      const poseResult = await processVideo(videoUrl, (progress, stage) => {
        if (progress <= 90) {
          setAnalysisProgress(Math.round(progress * 0.9));
          setAnalysisStage(progress < 15 ? "Loading AI model..." : "Detecting pose...");
        }
      });

      setAnalysisProgress(90);
      setAnalysisStage("Analyzing form...");

      const { analyzeSquat, trimFramesToReps, rebaseReps } = await import("@/lib/squatAnalysis");
      const squatResult = analyzeSquat(poseResult.frames, poseResult.exerciseType, poseResult.cameraAngle);
      const trimmed = trimFramesToReps(poseResult.frames);
      squatResult.reps = rebaseReps(squatResult.reps, trimmed.trimStartIdx);

      setAnalysisProgress(100);
      setAnalysisStage("Done!");

      // Store in context and navigate
      setAnalysis(squatResult, trimmed.frames, videoFile, trimmed.startTimestamp, trimmed.endTimestamp);
      // Small delay so the user sees 100%
      await new Promise((r) => setTimeout(r, 400));
      router.push("/results");
    } catch (err) {
      console.error("Analysis failed:", err);
      setAnalyzing(false);
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    }
  }, [videoUrl, videoFile, setAnalysis, router]);

  const hasVideo = videoUrl !== null;

  // Show full-screen processing overlay when analyzing
  if (analyzing) {
    return <ProcessingScreen progress={analysisProgress} stage={analysisStage} />;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 sm:py-14">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          Analyze Your Form
        </h1>
        <p className="text-gray-400">
          Upload a video or record yourself to get AI-powered feedback on your
          squat.
        </p>
      </div>

      {/* Instruction panel */}
      <div className="bg-accent/5 border border-accent/15 rounded-xl px-5 py-4 mb-8">
        <p className="text-sm font-medium text-accent mb-2">For best results:</p>
        <ul className="text-sm text-gray-300 leading-relaxed space-y-1">
          <li className="flex gap-2"><span className="text-gray-500">&bull;</span>Film from the <span className="font-medium text-white">SIDE</span> (perpendicular to you)</li>
          <li className="flex gap-2"><span className="text-gray-500">&bull;</span>Make sure your full body is visible from head to feet</li>
          <li className="flex gap-2"><span className="text-gray-500">&bull;</span>Good lighting helps &mdash; avoid backlighting</li>
          <li className="flex gap-2"><span className="text-gray-500">&bull;</span>1&ndash;5 reps is ideal</li>
        </ul>
      </div>

      {/* ── Main content area ── */}
      {!hasVideo && mode === "choose" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setMode("upload")}
            className="group flex flex-col items-center gap-4 bg-surface border border-border rounded-2xl p-8 hover:border-accent/30 hover:bg-surface-light transition-all duration-200 text-center"
          >
            <div className="text-gray-500 group-hover:text-accent transition-colors">
              <UploadIcon className="w-12 h-12" />
            </div>
            <div>
              <p className="font-semibold text-base mb-1">Upload a Video</p>
              <p className="text-sm text-gray-500">
                Drag & drop or browse for a file
              </p>
            </div>
          </button>

          <button
            onClick={() => setMode("record")}
            className="group flex flex-col items-center gap-4 bg-surface border border-border rounded-2xl p-8 hover:border-accent/30 hover:bg-surface-light transition-all duration-200 text-center"
          >
            <div className="text-gray-500 group-hover:text-accent transition-colors">
              <CameraIcon className="w-12 h-12" />
            </div>
            <div>
              <p className="font-semibold text-base mb-1">Record Now</p>
              <p className="text-sm text-gray-500">
                Use your camera to film a set
              </p>
            </div>
          </button>
        </div>
      )}

      {!hasVideo && mode === "upload" && (
        <UploadZone onFile={handleFile} onBack={() => setMode("choose")} />
      )}

      {!hasVideo && mode === "record" && (
        <CameraRecorder onRecorded={handleRecorded} onBack={() => setMode("choose")} />
      )}

      {hasVideo && videoUrl && (
        <>
          <VideoPreview
            videoUrl={videoUrl}
            fileName={videoName}
            fileSize={videoSize}
            duration={videoDuration}
            onDiscard={clearVideo}
            onAnalyze={handleAnalyze}
            disabled={analyzing}
          />

          {/* Error state */}
          {analysisError && (
            <div className="mt-6 space-y-3 animate-fade-in-up">
              <div className="flex items-start gap-3 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 mt-0.5">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <p className="font-medium">{analysisError}</p>
                  <button
                    onClick={handleAnalyze}
                    className="mt-2 text-accent underline text-xs"
                  >
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
