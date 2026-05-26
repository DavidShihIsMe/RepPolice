"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { Pose } from "@/lib/pose/types";
import { sampleFromPose } from "@/lib/squat/samples";
import { analyze } from "@/lib/squat/reps";
import type { AnalysisResult, FrameSample, Rep } from "@/lib/squat/types";

// MediaPipe/WebGL load only in the browser.
const PoseOverlay = dynamic(() => import("@/components/PoseOverlay"), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-video rounded-2xl border border-border bg-black flex items-center justify-center text-sm text-gray-500">
      Loading player…
    </div>
  ),
});

type AnalyzeState =
  | { kind: "idle" }
  | { kind: "running"; pct: number }
  | { kind: "done"; result: AnalysisResult }
  | { kind: "error"; message: string };

// How fast to drive playback during analysis. Most modern browsers handle
// 8x for typical phone-resolution clips; we cap there to keep MediaPipe
// from missing frames.
const ANALYZE_PLAYBACK_RATE = 8;

export default function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const samplesRef = useRef<FrameSample[]>([]);
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>({ kind: "idle" });
  const isCapturingRef = useRef(false);

  const onPose = useCallback((pose: Pose | null, tSec: number) => {
    if (!isCapturingRef.current || !pose) return;
    const sample = sampleFromPose(pose, tSec);
    if (sample) samplesRef.current.push(sample);
  }, []);

  function finishAnalysis() {
    const video = videoRef.current;
    if (!video) return;
    isCapturingRef.current = false;
    video.playbackRate = 1;
    video.pause();
    const result = analyze(samplesRef.current, video.duration || 0);
    if (result.reps.length === 0) {
      setAnalyzeState({
        kind: "error",
        message:
          result.framesUsable < 30
            ? "Couldn't see enough of the body to analyze. Re-shoot with the full body in frame from the side."
            : "No reps detected. Make sure the video shows a full squat or two.",
      });
    } else {
      setAnalyzeState({ kind: "done", result });
    }
  }

  async function startAnalysis() {
    const video = videoRef.current;
    if (!video) return;

    samplesRef.current = [];
    setAnalyzeState({ kind: "running", pct: 0 });
    isCapturingRef.current = true;

    video.playbackRate = ANALYZE_PLAYBACK_RATE;
    video.currentTime = 0;

    const onTime = () => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const pct = Math.min(100, (video.currentTime / video.duration) * 100);
      setAnalyzeState((s) => (s.kind === "running" ? { kind: "running", pct } : s));
    };
    const onEnded = () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      finishAnalysis();
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);

    try {
      await video.play();
    } catch (e) {
      isCapturingRef.current = false;
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
      setAnalyzeState({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not start playback.",
      });
    }
  }

  function jumpTo(t: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    video.pause();
  }

  return (
    <div className="space-y-6">
      <PoseOverlay
        videoElementRef={videoRef}
        src={src}
        label="MediaPipe Pose (Full)"
        onPose={onPose}
      />

      <AnalyzeBar state={analyzeState} onStart={startAnalysis} />

      {analyzeState.kind === "done" && (
        <ReportCard result={analyzeState.result} onJump={jumpTo} />
      )}
    </div>
  );
}

function AnalyzeBar({
  state,
  onStart,
}: {
  state: AnalyzeState;
  onStart: () => void;
}) {
  if (state.kind === "running") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span>Analyzing…</span>
          <span className="text-gray-500 text-xs">{Math.round(state.pct)}%</span>
        </div>
        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${state.pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Playing at {ANALYZE_PLAYBACK_RATE}× to capture landmarks.
        </p>
      </div>
    );
  }

  const buttonLabel =
    state.kind === "done"
      ? "Re-analyze"
      : state.kind === "error"
        ? "Try again"
        : "Analyze";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold mb-0.5">Form analysis</h2>
          <p className="text-xs text-gray-500">
            Plays the video back at {ANALYZE_PLAYBACK_RATE}× to detect reps and measure depth.
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors flex-shrink-0"
        >
          {buttonLabel}
        </button>
      </div>
      {state.kind === "error" && (
        <div className="mt-3 text-sm rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-300">
          {state.message}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  result,
  onJump,
}: {
  result: AnalysisResult;
  onJump: (t: number) => void;
}) {
  const { reps, durationS } = result;
  const counts = reps.reduce(
    (acc, r) => {
      acc[r.depthLabel]++;
      return acc;
    },
    { above: 0, parallel: 0, below: 0 }
  );

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Result
          </p>
          <h3 className="text-xl font-semibold">
            {reps.length} {reps.length === 1 ? "rep" : "reps"}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <DepthChip label="below" count={counts.below} />
          <DepthChip label="parallel" count={counts.parallel} />
          <DepthChip label="above" count={counts.above} />
        </div>
      </div>

      {/* Timeline strip */}
      <div className="px-5 py-4 border-b border-border">
        <div className="relative h-8 bg-border/50 rounded-md">
          {reps.map((r) => {
            const left = durationS > 0 ? (r.bottomT / durationS) * 100 : 0;
            return (
              <button
                key={r.index}
                type="button"
                onClick={() => onJump(r.bottomT)}
                title={`Rep ${r.index} — ${r.depthLabel}`}
                className={`absolute top-1 bottom-1 w-2 rounded-sm transition-transform hover:scale-y-110 hover:w-2.5 ${depthBg(r.depthLabel)}`}
                style={{ left: `calc(${left}% - 4px)` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-1.5">
          <span>0:00</span>
          <span>{formatTime(durationS)}</span>
        </div>
      </div>

      {/* Per-rep table */}
      <ul className="divide-y divide-border">
        {reps.map((r) => (
          <li key={r.index}>
            <button
              type="button"
              onClick={() => onJump(r.bottomT)}
              className="w-full flex items-center justify-between gap-4 px-5 py-3 hover:bg-surface-light transition-colors text-left"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-xs text-gray-500 w-8 flex-shrink-0 tabular-nums">
                  #{r.index}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${depthChipStyles(r.depthLabel)}`}
                >
                  {r.depthLabel}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">
                  depth {formatDepth(r.depth)}
                </span>
              </div>
              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                {formatTime(r.bottomT)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DepthChip({
  label,
  count,
}: {
  label: "above" | "parallel" | "below";
  count: number;
}) {
  if (count === 0) return null;
  return (
    <span
      className={`px-2 py-0.5 rounded-full border ${depthChipStyles(label)}`}
    >
      {count} {label}
    </span>
  );
}

function depthChipStyles(label: Rep["depthLabel"]): string {
  switch (label) {
    case "below":
      return "bg-green-500/15 text-green-300 border-green-500/30";
    case "parallel":
      return "bg-accent/15 text-accent border-accent/30";
    case "above":
      return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  }
}

function depthBg(label: Rep["depthLabel"]): string {
  switch (label) {
    case "below":
      return "bg-green-400";
    case "parallel":
      return "bg-accent";
    case "above":
      return "bg-yellow-400";
  }
}

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatDepth(d: number): string {
  // Render as percentage of body height. Positive = below parallel.
  const sign = d > 0 ? "+" : "";
  return `${sign}${(d * 100).toFixed(0)}%`;
}
