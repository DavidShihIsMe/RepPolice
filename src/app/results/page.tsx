"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAnalysis } from "@/lib/analysisStore";
import type { MetricScore, MetricRating, MetricConfidence, RepData } from "@/lib/types";
import SkeletonReplay from "./SkeletonReplay";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ratingColor(rating: MetricRating) {
  if (rating === "green") return "text-green-400";
  if (rating === "yellow") return "text-yellow-400";
  return "text-red-400";
}

function ratingBg(rating: MetricRating) {
  if (rating === "green") return "bg-green-400";
  if (rating === "yellow") return "bg-yellow-400";
  return "bg-red-400";
}

function ratingBorder(rating: MetricRating) {
  if (rating === "green") return "border-green-400/30";
  if (rating === "yellow") return "border-yellow-400/30";
  return "border-red-400/30";
}

function ratingGlow(rating: MetricRating) {
  if (rating === "green") return "shadow-[0_0_24px_rgba(74,222,128,0.15)]";
  if (rating === "yellow") return "shadow-[0_0_24px_rgba(250,204,21,0.15)]";
  return "shadow-[0_0_24px_rgba(248,113,113,0.15)]";
}

function ratingStroke(rating: MetricRating) {
  if (rating === "green") return "#4ade80";
  if (rating === "yellow") return "#facc15";
  return "#f87171";
}

function overallRating(score: number): MetricRating {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

const COACHING_TIPS: Record<string, string> = {
  depth: "Try box squats or pause squats to build confidence at the bottom position.",
  kneeTracking: "Focus on spreading the floor with your feet and pushing knees out over toes.",
  backAngle: "Work on thoracic mobility and brace your core harder before descending.",
  barPath: "Keep the bar centered over your midfoot. Consider heel-elevated shoes.",
  symmetry: "Add single-leg accessory work like Bulgarian split squats to address imbalances.",
  buttWink: "Work on hip mobility and hamstring flexibility. Try limiting depth just above where the tuck begins.",
  tempo: "Use a metronome or count 2-3 seconds down, 1-2 seconds up. Controlled tempo builds strength and reduces injury risk.",
  heelRise: "Improve ankle dorsiflexion with calf stretches and ankle mobility drills. Heel-elevated shoes can also help.",
  stanceWidth: "Experiment with stance width — shoulder width or slightly wider is a good starting point for most people.",
  hipShift: "Strengthen your weaker side with single-leg exercises. Focus on driving evenly through both feet.",
  kneeValgus: "Strengthen your glutes with banded squats and clamshells. Focus on pushing knees out over toes.",
  kneeTravel: "Sit back more into the squat and focus on hip hinge. Ensure ankles have adequate mobility.",
  depthConsistency: "Pick a depth target and hit it every rep. Pause squats can help build awareness of your bottom position.",
  thoracicRounding: "Strengthen your upper back with rows and face pulls. Focus on pulling shoulder blades together.",
  hipRiseRate: "Focus on driving your chest up first during the ascent. Front squats can help build the pattern.",
  reversalControl: "Practice pause squats with a 2-second hold at the bottom. Avoid bouncing out of the hole.",
  stanceWidthShift: "Focus on keeping your feet planted firmly. Ensure your stance width is comfortable and stable.",
  headPosition: "Pick a spot on the wall at eye level and keep your gaze fixed there throughout the squat.",
};

// ─── Metric Icons ────────────────────────────────────────────────────────────

function MetricIcon({ metric }: { metric: string }) {
  const icons: Record<string, React.ReactNode> = {
    depth: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M16 4V28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 22L16 28L22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 12H26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3" opacity="0.5" />
      </svg>
    ),
    kneeTracking: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <circle cx="16" cy="16" r="2" fill="currentColor" />
        <path d="M16 2V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16 24V30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    backAngle: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M8 28L8 14L24 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 20Q12 17 14 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      </svg>
    ),
    barPath: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M16 4C16 4 14 12 15 16C16 20 18 24 16 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="4" r="2" fill="currentColor" opacity="0.8" />
        <circle cx="16" cy="28" r="2" fill="currentColor" opacity="0.8" />
        <path d="M24 4V28" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
      </svg>
    ),
    symmetry: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M16 2V30" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        <path d="M14 10L8 13L10 20L14 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 10L24 13L22 20L18 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    buttWink: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M10 8L10 18Q10 24 16 26Q22 24 22 18L22 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 18Q13 22 16 20Q19 22 22 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
    tempo: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <path d="M16 8V16L22 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="1.5" fill="currentColor" />
      </svg>
    ),
    heelRise: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M8 26H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
        <path d="M12 26L12 18L16 14L20 18L20 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 10L16 6L18 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      </svg>
    ),
    stanceWidth: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M4 20H28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
        <path d="M8 14V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M24 14V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 18L14 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M18 18L22 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M8 18L4 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M24 18L28 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    hipShift: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M16 4V28" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
        <ellipse cx="16" cy="16" rx="8" ry="4" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        <path d="M12 16Q14 12 20 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 14L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
    kneeValgus: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M10 6V14L14 20L10 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 6V14L18 20L22 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 20L18 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
    kneeTravel: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M12 8L12 16L18 24L12 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 24V28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M18 24L24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" opacity="0.4" />
      </svg>
    ),
    depthConsistency: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M6 20H26" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
        <path d="M8 16V24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 18V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 15V25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M26 17V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    thoracicRounding: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M10 28L10 14Q10 6 18 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14Q12 10 16 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <circle cx="18" cy="8" r="2" fill="currentColor" opacity="0.6" />
      </svg>
    ),
    hipRiseRate: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M8 24L16 12L24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 18L16 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M16 6L14 10H18L16 6Z" fill="currentColor" opacity="0.6" />
      </svg>
    ),
    reversalControl: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M8 8Q8 24 16 24Q24 24 24 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="16" cy="24" r="2.5" fill="currentColor" opacity="0.7" />
        <path d="M12 12L16 8L20 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
      </svg>
    ),
    stanceWidthShift: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <path d="M10 14V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 14V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 20L10 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M22 20L26 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        <path d="M8 10L12 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 2" opacity="0.3" />
        <path d="M20 10L24 10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 2" opacity="0.3" />
      </svg>
    ),
    headPosition: (
      <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
        <circle cx="16" cy="10" r="6" stroke="currentColor" strokeWidth="2" />
        <path d="M16 16V24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 28L16 24L22 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
        <path d="M14 9L18 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
  };
  return <>{icons[metric] || null}</>;
}

// ─── Score Gauge ─────────────────────────────────────────────────────────────

function ScoreGauge({ score, rating }: { score: number; rating: MetricRating }) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;

  useEffect(() => {
    let frame: number;
    const duration = 1500;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * score));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="relative w-48 h-48 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        {/* Background circle */}
        <circle
          cx="100" cy="100" r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="12"
        />
        {/* Score arc */}
        <circle
          cx="100" cy="100" r={radius}
          fill="none"
          stroke={ratingStroke(rating)}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-100"
        />
      </svg>
      {/* Score number in center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-5xl font-bold font-mono ${ratingColor(rating)} animate-count-up`}>
          {displayScore}
        </span>
        <span className="text-sm text-gray-500 mt-1">/ 100</span>
      </div>
    </div>
  );
}

// ─── Best View for Metric ────────────────────────────────────────────────────

const BEST_VIEW_FOR_METRIC: Record<string, string> = {
  depth: "side",
  kneeTracking: "front",
  backAngle: "side",
  barPath: "side",
  symmetry: "front",
  buttWink: "side",
  tempo: "any",
  heelRise: "side",
  stanceWidth: "front",
  hipShift: "front",
  kneeValgus: "front",
  kneeTravel: "side",
  depthConsistency: "side",
  thoracicRounding: "side",
  hipRiseRate: "side",
  reversalControl: "side",
  stanceWidthShift: "front",
  headPosition: "side",
};

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  metricKey,
  label,
  metric,
  delay,
}: {
  metricKey: string;
  label: string;
  metric: MetricScore;
  delay: number;
}) {
  const isLowConfidence = metric.confidence === "low";
  const bestView = BEST_VIEW_FOR_METRIC[metricKey] ?? "side";

  return (
    <div
      className={`bg-surface border ${isLowConfidence ? "border-white/5" : ratingBorder(metric.rating)} rounded-2xl p-5 ${isLowConfidence ? "" : ratingGlow(metric.rating)} animate-stagger-in ${isLowConfidence ? "opacity-50 grayscale" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={isLowConfidence ? "text-gray-600" : ratingColor(metric.rating)}>
          <MetricIcon metric={metricKey} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isLowConfidence ? "text-gray-500" : ""}`}>{label}</p>
          {isLowConfidence && (
            <span className="inline-block mt-1 text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full">
              Upload {bestView} view to analyze
            </span>
          )}
        </div>
        <div className={`text-2xl font-bold font-mono ${isLowConfidence ? "text-gray-600" : ratingColor(metric.rating)}`}>
          {isLowConfidence ? "—" : metric.score}
        </div>
      </div>

      {isLowConfidence ? (
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3" />
      ) : (
        <>
          {/* Score bar */}
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full ${ratingBg(metric.rating)} transition-all duration-1000 ease-out`}
              style={{ width: `${metric.score}%` }}
            />
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">{metric.summary}</p>

          {metric.score < 80 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-xs text-gray-500">
                <span className="text-accent font-medium">Tip:</span> {COACHING_TIPS[metricKey]}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Per-Rep Table ───────────────────────────────────────────────────────────

function RepBreakdown({ reps }: { reps: RepData[] }) {
  if (reps.length <= 1) return null;

  const metrics = ["depth", "kneeTracking", "backAngle", "barPath", "symmetry", "buttWink", "tempo", "heelRise", "stanceWidth", "hipShift", "kneeValgus", "kneeTravel", "depthConsistency", "thoracicRounding", "hipRiseRate", "reversalControl", "stanceWidthShift", "headPosition"] as const;
  const labels = ["Depth", "Knees", "Back", "Bar", "Sym.", "Wink", "Tempo", "Heel", "Stance", "Shift", "Valgus", "Travel", "Consist.", "T-Spine", "HipRate", "Reversal", "StShift", "Head"];

  // Find the weakest rep (lowest average score, only counting non-low-confidence metrics)
  const repAvgs = reps.map((rep) => {
    const confident = metrics.filter((m) => rep[m].confidence !== "low");
    if (confident.length === 0) return 0;
    return confident.reduce((sum, m) => sum + rep[m].score, 0) / confident.length;
  });
  const weakestIdx = repAvgs.indexOf(Math.min(...repAvgs));

  return (
    <div className="animate-stagger-in" style={{ animationDelay: "800ms" }}>
      <h2 className="text-lg font-semibold mb-4">Per-Rep Breakdown</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Rep</th>
              {labels.map((l) => (
                <th key={l} className="text-center py-2 px-3 text-gray-500 font-medium">{l}</th>
              ))}
              <th className="text-center py-2 px-3 text-gray-500 font-medium">Avg</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep, i) => {
              const avg = Math.round(repAvgs[i]);
              const avgRating = overallRating(avg);
              const isWeakest = i === weakestIdx;
              return (
                <tr
                  key={i}
                  className={`border-b border-white/5 ${isWeakest ? "bg-red-400/5" : ""}`}
                >
                  <td className="py-2.5 px-3 font-medium">
                    #{rep.repNumber}
                    {isWeakest && (
                      <span className="ml-2 text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
                        weakest
                      </span>
                    )}
                  </td>
                  {metrics.map((m) => {
                    const s = rep[m];
                    const isLow = s.confidence === "low";
                    return (
                      <td key={m} className={`text-center py-2.5 px-3 ${isLow ? "text-gray-700" : ""}`}>
                        {isLow ? (
                          <span className="font-mono text-gray-700">—</span>
                        ) : (
                          <span className={`font-mono font-semibold ${ratingColor(s.rating)}`}>
                            {s.score}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center py-2.5 px-3">
                    <span className={`font-mono font-bold ${ratingColor(avgRating)}`}>
                      {avg}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="mb-6 text-gray-600">
        <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 mx-auto">
          <rect x="8" y="8" width="48" height="48" rx="8" stroke="currentColor" strokeWidth="2" />
          <path d="M24 32L30 38L40 26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold mb-2">No Results Yet</h1>
      <p className="text-gray-500 mb-8">
        Analyze a video first to see your form report.
      </p>
      <Link
        href="/analyze"
        className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-black font-semibold rounded-xl hover:bg-accent-hover transition-colors"
      >
        Go to Analyze
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
        </svg>
      </Link>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const router = useRouter();
  const { data, clear } = useAnalysis();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!data) return;
    const { result } = data;
    const shareOverall = result.overall;
    const shareAllMetrics = [
      shareOverall.depth, shareOverall.kneeTracking, shareOverall.backAngle, shareOverall.barPath,
      shareOverall.symmetry, shareOverall.buttWink, shareOverall.tempo, shareOverall.heelRise,
      shareOverall.stanceWidth, shareOverall.hipShift, shareOverall.kneeValgus, shareOverall.kneeTravel,
      shareOverall.depthConsistency, shareOverall.thoracicRounding, shareOverall.hipRiseRate,
      shareOverall.reversalControl, shareOverall.stanceWidthShift, shareOverall.headPosition,
    ];
    const shareConfident = shareAllMetrics.filter((m) => m.confidence !== "low");
    const avg = shareConfident.length > 0
      ? Math.round(shareConfident.reduce((sum, m) => sum + m.score, 0) / shareConfident.length)
      : Math.round(shareAllMetrics.reduce((sum, m) => sum + m.score, 0) / shareAllMetrics.length);

    const metricLabel: Record<string, string> = {
      depth: "Depth", kneeTracking: "Knee Tracking", backAngle: "Back Angle",
      barPath: "Bar Path", symmetry: "Symmetry", buttWink: "Butt Wink",
      tempo: "Tempo", heelRise: "Heel Rise", stanceWidth: "Stance Width", hipShift: "Hip Shift",
      kneeValgus: "Knee Valgus", kneeTravel: "Knee Travel", depthConsistency: "Depth Consistency",
      thoracicRounding: "Thoracic Rounding", hipRiseRate: "Hip Rise Rate", reversalControl: "Reversal Control",
      stanceWidthShift: "Stance Width Shift", headPosition: "Head Position",
    };
    const metricKeys = ["depth", "kneeTracking", "backAngle", "barPath", "symmetry", "buttWink", "tempo", "heelRise", "stanceWidth", "hipShift", "kneeValgus", "kneeTravel", "depthConsistency", "thoracicRounding", "hipRiseRate", "reversalControl", "stanceWidthShift", "headPosition"] as const;

    const lines = [
      `RepPolice Squat Analysis`,
      `Overall: ${avg}/100`,
      `Reps: ${result.repCount}`,
      ``,
    ];

    for (const key of metricKeys) {
      const m = shareOverall[key];
      if (m.confidence === "low") {
        lines.push(`${metricLabel[key]}: — (upload ${BEST_VIEW_FOR_METRIC[key] ?? "side"} view)`);
      } else {
        lines.push(`${metricLabel[key]}: ${m.score}/100`);
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  }, [data]);

  const handleNewAnalysis = useCallback(() => {
    clear();
    router.push("/analyze");
  }, [clear, router]);

  if (!data) {
    return <EmptyState />;
  }

  const { result, frames, videoUrl } = data;
  const overall = result.overall;
  const allMetrics = [
    overall.depth, overall.kneeTracking, overall.backAngle, overall.barPath,
    overall.symmetry, overall.buttWink, overall.tempo, overall.heelRise,
    overall.stanceWidth, overall.hipShift, overall.kneeValgus, overall.kneeTravel,
    overall.depthConsistency, overall.thoracicRounding, overall.hipRiseRate,
    overall.reversalControl, overall.stanceWidthShift, overall.headPosition,
  ];
  const confidentMetrics = allMetrics.filter((m) => m.confidence !== "low");
  const overallScore = confidentMetrics.length > 0
    ? Math.round(confidentMetrics.reduce((sum, m) => sum + m.score, 0) / confidentMetrics.length)
    : Math.round(allMetrics.reduce((sum, m) => sum + m.score, 0) / allMetrics.length);
  const overallScoreRating = overallRating(overallScore);

  const metricEntries: { key: string; label: string; metric: MetricScore }[] = [
    { key: "depth", label: "Depth", metric: overall.depth },
    { key: "kneeTracking", label: "Knee Tracking", metric: overall.kneeTracking },
    { key: "backAngle", label: "Back Angle", metric: overall.backAngle },
    { key: "barPath", label: "Bar Path", metric: overall.barPath },
    { key: "symmetry", label: "Symmetry", metric: overall.symmetry },
    { key: "buttWink", label: "Butt Wink", metric: overall.buttWink },
    { key: "tempo", label: "Tempo", metric: overall.tempo },
    { key: "heelRise", label: "Heel Rise", metric: overall.heelRise },
    { key: "stanceWidth", label: "Stance Width", metric: overall.stanceWidth },
    { key: "hipShift", label: "Hip Shift", metric: overall.hipShift },
    { key: "kneeValgus", label: "Knee Valgus", metric: overall.kneeValgus },
    { key: "kneeTravel", label: "Knee Travel", metric: overall.kneeTravel },
    { key: "depthConsistency", label: "Depth Consistency", metric: overall.depthConsistency },
    { key: "thoracicRounding", label: "Thoracic Rounding", metric: overall.thoracicRounding },
    { key: "hipRiseRate", label: "Hip Rise Rate", metric: overall.hipRiseRate },
    { key: "reversalControl", label: "Reversal Control", metric: overall.reversalControl },
    { key: "stanceWidthShift", label: "Stance Width Shift", metric: overall.stanceWidthShift },
    { key: "headPosition", label: "Head Position", metric: overall.headPosition },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 sm:py-14">
      {/* ── Top Section: Overall Score ── */}
      <div className="text-center mb-12 animate-fade-in-up">
        <p className="text-accent text-sm font-medium tracking-widest uppercase mb-1">
          Form Analysis Report
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-1">
          Barbell Back Squat
        </h1>
        <p className="text-gray-500 mb-8">
          {result.repCount} rep{result.repCount !== 1 ? "s" : ""} detected
        </p>

        <ScoreGauge score={overallScore} rating={overallScoreRating} />

        <p className={`mt-4 text-sm font-medium ${ratingColor(overallScoreRating)}`}>
          {overallScore >= 80
            ? "Great form overall"
            : overallScore >= 50
              ? "Room for improvement"
              : "Needs work — see tips below"}
        </p>
      </div>

      {/* ── Video Replay with Skeleton Overlay ── */}
      {videoUrl && frames.length > 0 && (
        <div className="mb-10 animate-stagger-in" style={{ animationDelay: "200ms" }}>
          <SkeletonReplay
            videoUrl={videoUrl}
            frames={frames}
            reps={result.reps}
            startTimestamp={data.startTimestamp}
            endTimestamp={data.endTimestamp}
          />
        </div>
      )}

      {/* ── Metrics Grid ── */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-4 animate-stagger-in" style={{ animationDelay: "300ms" }}>
          Individual Scores
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metricEntries.map((entry, i) => (
            <MetricCard
              key={entry.key}
              metricKey={entry.key}
              label={entry.label}
              metric={entry.metric}
              delay={400 + i * 100}
            />
          ))}
        </div>
      </div>

      {/* ── Per-Rep Breakdown ── */}
      <div className="mb-12">
        <RepBreakdown reps={result.reps} />
      </div>

      {/* ── Bottom Actions ── */}
      <div
        className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-stagger-in"
        style={{ animationDelay: "1000ms" }}
      >
        <button
          onClick={handleNewAnalysis}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent text-black font-semibold rounded-xl hover:bg-accent-hover transition-colors text-base shadow-[0_0_24px_rgba(34,211,238,0.25)]"
        >
          Analyze Another Lift
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </button>

        <button
          onClick={handleShare}
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-surface border border-border text-gray-300 font-medium rounded-xl hover:bg-surface-light hover:border-gray-600 transition-colors text-sm"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-green-400">
                <path d="M4 10L8 14L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                <rect x="6" y="6" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 14V4C4 3.45 4.45 3 5 3H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Share Results
            </>
          )}
        </button>
      </div>
    </div>
  );
}
