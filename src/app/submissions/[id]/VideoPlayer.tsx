"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyzeVideoSrc } from "@/lib/squat/runner";
import type {
  AnalysisResult,
  ButtWinkLabel,
  DepthLabel,
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
  | { kind: "error"; message: string };

// Pad applied around the rep window when clipping playback. Gives a beat of
// stance/setup before the first descent and a beat of recovery after the last.
const CLIP_PAD_S = 1;

export default function VideoPlayer({
  src,
  submissionId,
  analysis: initialAnalysis,
}: {
  src: string;
  submissionId: string;
  analysis: AnalysisResult | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(initialAnalysis);
  const [analyzeState, setAnalyzeState] = useState<AnalyzeState>({ kind: "idle" });

  const hasReps = !!analysis && analysis.reps.length > 0;
  // Clip window: pad CLIP_PAD_S either side of the rep span, clamped to the
  // video's duration. The original full file stays in storage; we just don't
  // play the clutter.
  const clipStart = hasReps
    ? Math.max(0, analysis!.reps[0].startT - CLIP_PAD_S)
    : undefined;
  const clipEnd = hasReps
    ? Math.min(analysis!.durationS, analysis!.reps[analysis!.reps.length - 1].endT + CLIP_PAD_S)
    : undefined;

  async function runAnalysis() {
    setAnalyzeState({ kind: "running", pct: 0 });
    try {
      const result = await analyzeVideoSrc(src, {
        onProgress: (pct) =>
          setAnalyzeState({ kind: "running", pct: pct * 100 }),
      });
      // Persist on the row. If RLS rejects (rare — auth expired) we still
      // surface the result to the user; the warning lets us debug later.
      const supabase = createClient();
      const { error } = await supabase
        .from("submissions")
        .update({ analysis: result })
        .eq("id", submissionId);
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("Could not persist analysis", error);
      }
      setAnalysis(result);
      setAnalyzeState({ kind: "idle" });
      if (result.reps.length === 0) {
        // eslint-disable-next-line no-console
        console.warn("Analysis returned 0 reps", {
          framesProcessed: result.framesProcessed,
          framesUsable: result.framesUsable,
          durationS: result.durationS,
          view: result.view,
          viewRatio: result.viewRatio,
        });
      }
    } catch (e) {
      setAnalyzeState({
        kind: "error",
        message: e instanceof Error ? e.message : "Analysis failed.",
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
        clipStart={clipStart}
        clipEnd={clipEnd}
      />

      <AnalyzeBar
        state={analyzeState}
        onStart={runAnalysis}
        hasResult={hasReps}
        emptyResult={!!analysis && analysis.reps.length === 0}
      />

      {hasReps && <ReportCard result={analysis!} onJump={jumpTo} />}
    </div>
  );
}

function AnalyzeBar({
  state,
  onStart,
  hasResult,
  emptyResult,
}: {
  state: AnalyzeState;
  onStart: () => void;
  hasResult: boolean;
  emptyResult: boolean;
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
      </div>
    );
  }

  const buttonLabel = hasResult
    ? "Re-analyze"
    : state.kind === "error"
      ? "Try again"
      : "Analyze";

  const description = hasResult
    ? "Re-run the form analysis on this video. Replaces the stored result."
    : emptyResult
      ? "Previous analysis found no reps. Try again — maybe the camera angle was off."
      : "Detect reps and measure depth, lean, tempo, and other form criteria.";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold mb-0.5">Form analysis</h2>
          <p className="text-xs text-gray-500">{description}</p>
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
  const scoresPerRep = chipsPerRep.map(scoreFromChips);
  const overallScore = scoresPerRep.length
    ? Math.round(scoresPerRep.reduce((a, b) => a + b, 0) / scoresPerRep.length)
    : 0;
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
          {highRiskCount > 0 ? (
            <p className="text-xs text-red-300 mt-1">
              {highRiskCount} high-risk issue{highRiskCount === 1 ? "" : "s"}
            </p>
          ) : reps.length > 0 ? (
            <p className="text-xs text-green-300 mt-1">No high-risk issues</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
            Score
          </p>
          <p className={`text-3xl font-bold tabular-nums ${scoreColor(overallScore)}`}>
            {overallScore}
            <span className="text-base text-gray-500 font-normal">/100</span>
          </p>
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
              <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
                <span className={`text-sm font-semibold tabular-nums ${scoreColor(scoresPerRep[i])}`}>
                  {scoresPerRep[i]}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {formatTime(r.bottomT)}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Scoring ----

// Calibrated so a typical squat (a few minor warns, one big issue) lands at
// ~85, a clean squat lands at 90+, and a perfect rep stays at 100.
//   warn  → −3 (borderline / moderate-severity criterion)
//   bad   → −8 (high-severity criterion — depth fail, divebomb, severe wink, etc.)
//   floor 30 so a brutal rep is still a number, not zero.
const WARN_PENALTY = 3;
const BAD_PENALTY = 8;
const MIN_SCORE = 30;

function scoreFromChips(chips: RepChip[]): number {
  let score = 100;
  for (const c of chips) {
    if (c.severity === "warn") score -= WARN_PENALTY;
    else if (c.severity === "bad") score -= BAD_PENALTY;
  }
  return Math.max(MIN_SCORE, Math.min(100, score));
}

function scoreColor(n: number): string {
  if (n >= 90) return "text-green-300";
  if (n >= 80) return "text-yellow-300";
  return "text-red-300";
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
