import type { FrameSample, Rep, DepthLabel, AnalysisResult } from "./types";

// Smoothing window for hip-Y trajectory before peak finding.
// 5 samples ≈ 0.17 s at 30 fps — knocks out per-frame noise without
// blurring real rep dynamics.
const SMOOTH_WINDOW = 5;

// A peak must rise this far above the higher of its two surrounding bases
// to count as a rep bottom. Expressed as fraction of body height
// (= median ankleY − shoulderY). 10% = ~20cm for a 200cm-tall person on screen.
const MIN_PROMINENCE_RATIO = 0.1;

// Reps closer than this many seconds collapse into the deeper of the two.
// Typical squat rep is 2–4s; 0.5s is well below that and well above bounce.
const MIN_REP_SEPARATION_S = 0.5;

// Depth thresholds — fraction of body height, applied to (hipY − kneeY) at bottom.
const DEPTH_PARALLEL_BAND = 0.02; // ±2% of body height = "parallel"

// We need a minimum of data before attempting analysis.
const MIN_VISIBLE_SAMPLES = 30;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function movingAverage(xs: number[], window: number): number[] {
  if (window <= 1) return xs.slice();
  const half = Math.floor(window / 2);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(xs.length - 1, i + half); j++) {
      sum += xs[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

// Topographic prominence: peak height minus the higher of the two surrounding
// "key cols" (lowest points before hitting a taller peak in each direction).
function prominence(y: number[], peakIdx: number): number {
  const h = y[peakIdx];
  let leftMin = h;
  for (let i = peakIdx - 1; i >= 0; i--) {
    if (y[i] > h) break;
    if (y[i] < leftMin) leftMin = y[i];
  }
  let rightMin = h;
  for (let i = peakIdx + 1; i < y.length; i++) {
    if (y[i] > h) break;
    if (y[i] < rightMin) rightMin = y[i];
  }
  return h - Math.max(leftMin, rightMin);
}

// Non-maximum suppression by time: of peaks within minSep seconds of each
// other, keep only the tallest.
function nmsByTime(
  peaks: number[],
  y: number[],
  ts: number[],
  minSep: number
): number[] {
  const sorted = [...peaks].sort((a, b) => y[b] - y[a]);
  const accepted: number[] = [];
  for (const p of sorted) {
    let ok = true;
    for (const a of accepted) {
      if (Math.abs(ts[p] - ts[a]) < minSep) {
        ok = false;
        break;
      }
    }
    if (ok) accepted.push(p);
  }
  return accepted.sort((a, b) => a - b);
}

export function analyze(samples: FrameSample[], durationS: number): AnalysisResult {
  const visible = samples.filter((s) => s.visible);
  const base: AnalysisResult = {
    reps: [],
    framesProcessed: samples.length,
    framesUsable: visible.length,
    bodyHeight: 0,
    durationS,
  };
  if (visible.length < MIN_VISIBLE_SAMPLES) return base;

  // Body-height proxy: vertical span shoulders → ankles. Use median across the
  // whole trajectory so it's robust to the bottom of a deep squat.
  const heights = visible.map((s) => s.ankleY - s.shoulderY).filter((h) => h > 0);
  const bodyHeight = median(heights);
  if (bodyHeight <= 0) return base;

  const ts = visible.map((s) => s.t);
  const rawY = visible.map((s) => s.hipY);
  const y = movingAverage(rawY, SMOOTH_WINDOW);

  // Local maxima of smoothed hipY (large y = low in image = deep squat).
  const candidates: number[] = [];
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] >= y[i + 1]) candidates.push(i);
  }

  const minProm = MIN_PROMINENCE_RATIO * bodyHeight;
  const prominentPeaks = candidates.filter((p) => prominence(y, p) >= minProm);
  const bottoms = nmsByTime(prominentPeaks, y, ts, MIN_REP_SEPARATION_S);

  // Build Rep objects. The rep's start/end are the lowest-y (highest hip)
  // sample in the window between this bottom and the neighboring bottom.
  const reps: Rep[] = [];
  for (let i = 0; i < bottoms.length; i++) {
    const p = bottoms[i];
    const prevBound = i > 0 ? bottoms[i - 1] : 0;
    const nextBound = i < bottoms.length - 1 ? bottoms[i + 1] : y.length - 1;

    let startIdx = prevBound;
    for (let j = prevBound; j < p; j++) if (y[j] < y[startIdx]) startIdx = j;

    let endIdx = nextBound;
    for (let j = p; j <= nextBound; j++) if (y[j] < y[endIdx]) endIdx = j;

    // Use the *unsmoothed* sample at the bottom for the depth metric.
    const bottomSample = visible[p];
    const depth = (bottomSample.hipY - bottomSample.kneeY) / bodyHeight;
    const depthLabel: DepthLabel =
      depth > DEPTH_PARALLEL_BAND
        ? "below"
        : depth >= -DEPTH_PARALLEL_BAND
          ? "parallel"
          : "above";

    reps.push({
      index: reps.length + 1,
      startT: ts[startIdx],
      bottomT: ts[p],
      endT: ts[endIdx],
      depth,
      depthLabel,
    });
  }

  return {
    reps,
    framesProcessed: samples.length,
    framesUsable: visible.length,
    bodyHeight,
    durationS,
  };
}
