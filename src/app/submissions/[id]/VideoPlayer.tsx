"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { Pose } from "@/lib/pose/types";
import { sampleFromPose } from "@/lib/squat/samples";
import { analyze } from "@/lib/squat/reps";
import type {
  AnalysisResult,
  ButtWinkLabel,
  DepthLabel,
  FrameSample,
  HipRiseLabel,
  HipShiftLabel,
  LeanLabel,
  Rep,
  SymmetryLabel,
  TempoLabel,
  ThoracicLabel,
  ValgusLabel,
  View,
} from "@/lib/squat/types";

type Severity = "good" | "warn" | "bad";

interface RepChip {
  label: string; // short criterion name
  value: string; // formatted measurement
  severity: Severity;
}

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
  const { reps, durationS, view } = result;
  const chipsPerRep = reps.map((r) => chipsForRep(r, view));
  const highRiskCount = chipsPerRep.reduce(
    (acc, chips) => acc + chips.filter((c) => c.severity === "bad").length,
    0
  );

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs uppercase tracking-wider text-gray-500">
              Result
            </p>
            <ViewBadge view={view} />
          </div>
          <h3 className="text-xl font-semibold">
            {reps.length} {reps.length === 1 ? "rep" : "reps"}
          </h3>
        </div>
        <div className="text-xs text-right pt-1">
          {highRiskCount > 0 ? (
            <span className="text-red-300">
              {highRiskCount} high-risk issue{highRiskCount === 1 ? "" : "s"}
            </span>
          ) : reps.length > 0 ? (
            <span className="text-green-300">No high-risk issues</span>
          ) : null}
        </div>
      </div>

      {view === "front" && (
        <div className="px-5 py-3 border-b border-border bg-accent/5 text-xs text-gray-300">
          Front view detected. Showing knee tracking, hip shift, and symmetry
          grades — depth and forward lean require a side angle.
        </div>
      )}
      {view === "unclear" && (
        <div className="px-5 py-3 border-b border-border bg-yellow-500/5 text-xs text-yellow-200/80">
          Couldn&apos;t tell if this is a clean side or front view. Grades shown
          below may be unreliable — for best results, film perpendicular to the lifter.
        </div>
      )}

      {/* Timeline strip — depth-colored (most visually meaningful single signal) */}
      <div className="px-5 py-4 border-b border-border">
        <div className="relative h-8 bg-border/50 rounded-md">
          {reps.map((r) => {
            const left = durationS > 0 ? (r.bottomT / durationS) * 100 : 0;
            return (
              <button
                key={r.index}
                type="button"
                onClick={() => onJump(r.bottomT)}
                title={`Rep ${r.index}`}
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

      {/* Per-rep rows */}
      <ul className="divide-y divide-border">
        {reps.map((r, i) => (
          <li key={r.index}>
            <button
              type="button"
              onClick={() => onJump(r.bottomT)}
              className="w-full flex items-start justify-between gap-4 px-5 py-3 hover:bg-surface-light transition-colors text-left"
            >
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <span className="text-xs text-gray-500 w-8 flex-shrink-0 tabular-nums pt-1">
                  #{r.index}
                </span>
                <div className="flex flex-wrap gap-1.5 min-w-0">
                  {chipsPerRep[i].map((c) => (
                    <Chip key={c.label} chip={c} />
                  ))}
                </div>
              </div>
              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0 pt-1">
                {formatTime(r.bottomT)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Chip builders ----

function chipsForRep(r: Rep, view: View): RepChip[] {
  // Unclear view falls back to the side-view chip set as a best guess.
  if (view === "front") return frontChips(r);
  return sideChips(r);
}

function sideChips(r: Rep): RepChip[] {
  return [
    { label: "Depth", value: formatDepth(r.depth), severity: depthSeverity(r.depthLabel) },
    { label: "Lean", value: `${r.leanDeg.toFixed(0)}°`, severity: leanSeverity(r.leanLabel) },
    { label: "Tempo", value: `${r.tempoS.toFixed(1)}s`, severity: tempoSeverity(r.tempoLabel) },
    {
      label: "Wink",
      value: `${r.buttWinkDeg.toFixed(0)}°`,
      severity: buttWinkSeverity(r.buttWinkLabel),
    },
    {
      label: "Round",
      value: `${r.thoracicDeg.toFixed(0)}°`,
      severity: thoracicSeverity(r.thoracicLabel),
    },
    {
      label: "Rise",
      value: `${r.hipRiseRatio.toFixed(2)}×`,
      severity: hipRiseSeverity(r.hipRiseLabel),
    },
  ];
}

function frontChips(r: Rep): RepChip[] {
  return [
    {
      label: "Valgus",
      value: `${r.valgusDeg.toFixed(0)}°`,
      severity: valgusSeverity(r.valgusLabel),
    },
    {
      label: "Shift",
      value: `${(r.hipShiftPct * 100).toFixed(0)}%`,
      severity: hipShiftSeverity(r.hipShiftLabel),
    },
    {
      label: "Symm",
      value: `${(r.symmetryPct * 100).toFixed(1)}%`,
      severity: symmetrySeverity(r.symmetryLabel),
    },
    {
      label: "Rise",
      value: `${r.hipRiseRatio.toFixed(2)}×`,
      severity: hipRiseSeverity(r.hipRiseLabel),
    },
  ];
}

// ---- Chip + severity helpers ----

function Chip({ chip }: { chip: RepChip }) {
  return (
    <span
      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border tabular-nums ${severityStyles(chip.severity)}`}
    >
      <span className="uppercase tracking-wider opacity-70 mr-1">{chip.label}</span>
      {chip.value}
    </span>
  );
}

function severityStyles(s: Severity): string {
  switch (s) {
    case "good":
      return "bg-green-500/15 text-green-300 border-green-500/30";
    case "warn":
      return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
    case "bad":
      return "bg-red-500/15 text-red-300 border-red-500/30";
  }
}

function depthSeverity(l: DepthLabel): Severity {
  // Below parallel and at parallel are both fine. Above-parallel is the failure.
  return l === "above" ? "bad" : "good";
}

function leanSeverity(l: LeanLabel): Severity {
  switch (l) {
    case "upright":
      return "good";
    case "moderate":
      return "warn";
    case "excessive":
      return "bad";
  }
}

function tempoSeverity(l: TempoLabel): Severity {
  switch (l) {
    case "controlled":
      return "good";
    case "slow":
      return "warn";
    case "divebomb":
      return "bad";
  }
}

function buttWinkSeverity(l: ButtWinkLabel): Severity {
  switch (l) {
    case "none":
      return "good";
    case "mild":
      return "warn";
    case "severe":
      return "bad";
  }
}

function thoracicSeverity(l: ThoracicLabel): Severity {
  switch (l) {
    case "neutral":
      return "good";
    case "rounded":
      return "warn";
    case "excessive":
      return "bad";
  }
}

function hipRiseSeverity(l: HipRiseLabel): Severity {
  switch (l) {
    case "balanced":
      return "good";
    case "chest_first":
      return "warn";
    case "good_morning":
      return "bad";
  }
}

function valgusSeverity(l: ValgusLabel): Severity {
  switch (l) {
    case "tracking":
      return "good";
    case "mild_cave":
      return "warn";
    case "severe_cave":
      return "bad";
  }
}

function hipShiftSeverity(l: HipShiftLabel): Severity {
  return l === "stable" ? "good" : "warn";
}

function symmetrySeverity(l: SymmetryLabel): Severity {
  switch (l) {
    case "balanced":
      return "good";
    case "asymmetric":
      return "warn";
    case "severe":
      return "bad";
  }
}

function ViewBadge({ view }: { view: View }) {
  const labels: Record<View, string> = {
    side: "Side view",
    front: "Front view",
    unclear: "Angle unclear",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${viewBadgeStyles(view)}`}
    >
      {labels[view]}
    </span>
  );
}

function viewBadgeStyles(view: View): string {
  switch (view) {
    case "side":
      return "bg-green-500/15 text-green-300 border-green-500/30";
    case "front":
      return "bg-accent/15 text-accent border-accent/30";
    case "unclear":
      return "bg-yellow-500/15 text-yellow-300 border-yellow-500/30";
  }
}

function depthBg(label: DepthLabel): string {
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
  const sign = d > 0 ? "+" : "";
  return `${sign}${(d * 100).toFixed(0)}%`;
}
