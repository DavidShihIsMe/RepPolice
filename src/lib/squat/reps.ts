import type {
  FrameSample,
  Rep,
  DepthLabel,
  LeanLabel,
  View,
  AnalysisResult,
  TempoLabel,
  ButtWinkLabel,
  ThoracicLabel,
  HipRiseLabel,
  ValgusLabel,
  HipShiftLabel,
  SymmetryLabel,
} from "./types";

// HIGH-risk criteria NOT implemented in this pipeline:
//   - Bar Stability         (needs bar/plate detection)
//   - Brace Quality/Timing/Maintenance (need IAP/breath signal)
//   - Spinal Neutrality     (composite of butt wink + thoracic — redundant)

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

// Forward-lean thresholds (degrees of torso vs. vertical). PDF criteria just
// say "excessive shifts load to lower back" — these are biomechanics defaults:
// <30° = high-bar upright, 30–50° = low-bar acceptable, >50° = good-morning.
const LEAN_UPRIGHT_MAX_DEG = 30;
const LEAN_MODERATE_MAX_DEG = 50;

// Torso angle vs. vertical (degrees, always positive). Image-space vector
// shoulder − hip → magnitude of angle off the vertical axis.
function torsoAngleDeg(s: FrameSample): number {
  const dx = s.shoulderX - s.hipX;
  const dy = s.shoulderY - s.hipY; // negative when shoulder is above hip
  const rad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return (rad * 180) / Math.PI;
}

function leanLabelFor(deg: number): LeanLabel {
  if (deg < LEAN_UPRIGHT_MAX_DEG) return "upright";
  if (deg < LEAN_MODERATE_MAX_DEG) return "moderate";
  return "excessive";
}

// View-detection thresholds. Ratio = median((shoulderWidth + hipWidth)/2) / bodyHeight.
// Front view: shoulders/hips spread across the frame → ≈ 0.18–0.28.
// Side view: far landmarks occlude behind near ones → ≈ 0.03–0.08.
// Gap between thresholds → "unclear" (angled / three-quarter / view changed).
const VIEW_SIDE_MAX_RATIO = 0.1;
const VIEW_FRONT_MIN_RATIO = 0.18;

function viewFor(ratio: number): View {
  if (ratio <= VIEW_SIDE_MAX_RATIO) return "side";
  if (ratio >= VIEW_FRONT_MIN_RATIO) return "front";
  return "unclear";
}

// Eccentric tempo (seconds of descent). PDF: "<1s at moderate+ load = dive-bombing."
const TEMPO_DIVEBOMB_MAX_S = 1.0;
const TEMPO_CONTROLLED_MAX_S = 3.0;

function tempoLabelFor(sec: number): TempoLabel {
  if (sec < TEMPO_DIVEBOMB_MAX_S) return "divebomb";
  if (sec <= TEMPO_CONTROLLED_MAX_S) return "controlled";
  return "slow";
}

// Butt wink approximation. True butt wink is posterior pelvic tilt — not
// directly observable from 2D pose. Proxy: lean-angle change in the last
// BUTT_WINK_WINDOW_S before the bottom. A sudden forward jerk of the torso
// at the bottom is the visible signature.
const BUTT_WINK_WINDOW_S = 0.3;
const BUTT_WINK_MILD_DEG = 8;
const BUTT_WINK_SEVERE_DEG = 15;

function buttWinkLabelFor(deg: number): ButtWinkLabel {
  if (deg < BUTT_WINK_MILD_DEG) return "none";
  if (deg < BUTT_WINK_SEVERE_DEG) return "mild";
  return "severe";
}

// Thoracic rounding: angle between (head − shoulder) and (shoulder − hip).
// Neutral spine: 0°. Tucked head/rounded upper back: >0°.
const THORACIC_ROUNDED_DEG = 10;
const THORACIC_EXCESSIVE_DEG = 20;

function thoracicLabelFor(deg: number): ThoracicLabel {
  if (deg < THORACIC_ROUNDED_DEG) return "neutral";
  if (deg < THORACIC_EXCESSIVE_DEG) return "rounded";
  return "excessive";
}

// Hip rise rate: ratio of hip-pct-risen to shoulder-pct-risen at mid-ascent.
// Clean rep ≈ 1.0 (hips and shoulders rise together). >1.15 = good-morning
// pattern (hips outpacing chest). <0.85 = chest-first (atypical, usually weakness).
const HIP_RISE_GOOD_MORNING = 1.15;
const HIP_RISE_CHEST_FIRST = 0.85;
const HIP_RISE_MIN_TRAVEL = 0.02; // min Y travel as fraction of body height to trust the ratio

function hipRiseLabelFor(ratio: number): HipRiseLabel {
  if (ratio > HIP_RISE_GOOD_MORNING) return "good_morning";
  if (ratio < HIP_RISE_CHEST_FIRST) return "chest_first";
  return "balanced";
}

// Knee valgus (front view): max inward femur tilt across both legs at bottom.
// PDF: ">10–15° deviation."
const VALGUS_MILD_DEG = 10;
const VALGUS_SEVERE_DEG = 15;

function valgusLabelFor(deg: number): ValgusLabel {
  if (deg < VALGUS_MILD_DEG) return "tracking";
  if (deg < VALGUS_SEVERE_DEG) return "mild_cave";
  return "severe_cave";
}

// Hip shift (front view): max lateral hip-midpoint drift / ankle spread.
const HIP_SHIFT_THRESHOLD = 0.1; // 10% of ankle spread

function hipShiftLabelFor(pct: number): HipShiftLabel {
  return pct < HIP_SHIFT_THRESHOLD ? "stable" : "shifted";
}

// Left/right symmetry (front view): max paired-joint vertical asymmetry /
// body height.
const SYMMETRY_ASYMMETRIC_PCT = 0.03;
const SYMMETRY_SEVERE_PCT = 0.06;

function symmetryLabelFor(pct: number): SymmetryLabel {
  if (pct < SYMMETRY_ASYMMETRIC_PCT) return "balanced";
  if (pct < SYMMETRY_SEVERE_PCT) return "asymmetric";
  return "severe";
}

// ---- Per-criterion compute functions ----

// Lean-angle delta over the last BUTT_WINK_WINDOW_S before the bottom.
function computeButtWink(visible: FrameSample[], ts: number[], bottomIdx: number): number {
  const targetT = ts[bottomIdx] - BUTT_WINK_WINDOW_S;
  let priorIdx = bottomIdx;
  for (let j = bottomIdx - 1; j >= 0; j--) {
    priorIdx = j;
    if (ts[j] <= targetT) break;
  }
  if (priorIdx === bottomIdx) return 0; // window doesn't fit in clip
  return torsoAngleDeg(visible[bottomIdx]) - torsoAngleDeg(visible[priorIdx]);
}

// Angle (degrees) between the head-from-shoulder vector and the
// shoulder-from-hip vector. Both in image coordinates.
function computeThoracic(s: FrameSample): number {
  const ax = s.headX - s.shoulderX;
  const ay = s.headY - s.shoulderY;
  const bx = s.shoulderX - s.hipX;
  const by = s.shoulderY - s.hipY;
  const dotAB = ax * bx + ay * by;
  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  if (magA < 1e-4 || magB < 1e-4) return 0;
  const cos = Math.max(-1, Math.min(1, dotAB / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Hip rise vs shoulder rise during the ascent. Sampled at mid-ascent so the
// ratio reflects relative *timing*, not total travel.
function computeHipRiseRate(
  visible: FrameSample[],
  ts: number[],
  bottomIdx: number,
  endIdx: number,
  bodyHeight: number
): number {
  if (endIdx <= bottomIdx + 1) return 1;
  const midT = (ts[bottomIdx] + ts[endIdx]) / 2;
  let midIdx = bottomIdx;
  for (let j = bottomIdx; j <= endIdx; j++) {
    if (ts[j] >= midT) {
      midIdx = j;
      break;
    }
  }
  const hipTotal = visible[bottomIdx].hipY - visible[endIdx].hipY;
  const shoulderTotal = visible[bottomIdx].shoulderY - visible[endIdx].shoulderY;
  // If either joint barely moved, the ratio is meaningless — call it balanced.
  if (
    Math.abs(hipTotal) < HIP_RISE_MIN_TRAVEL * bodyHeight ||
    Math.abs(shoulderTotal) < HIP_RISE_MIN_TRAVEL * bodyHeight
  ) {
    return 1;
  }
  const hipPctRisen = (visible[bottomIdx].hipY - visible[midIdx].hipY) / hipTotal;
  const shoulderPctRisen =
    (visible[bottomIdx].shoulderY - visible[midIdx].shoulderY) / shoulderTotal;
  if (Math.abs(shoulderPctRisen) < 1e-3) return 1;
  return hipPctRisen / shoulderPctRisen;
}

// Worst inward femur tilt across both legs at the rep bottom.
// User's left leg sits on screen-right in a front-facing video (so
// leftHipX > leftKneeX would mean knee has caved toward midline).
function computeValgus(s: FrameSample): number {
  const leftDx = s.leftHipX - s.leftKneeX; // positive = knee medial to hip
  const leftDy = s.leftKneeY - s.leftHipY; // positive if knee below hip
  const rightDx = s.rightKneeX - s.rightHipX; // positive = knee medial to hip (mirror)
  const rightDy = s.rightKneeY - s.rightHipY;
  const leftDeg = leftDy > 0 ? (Math.atan2(Math.max(0, leftDx), leftDy) * 180) / Math.PI : 0;
  const rightDeg =
    rightDy > 0 ? (Math.atan2(Math.max(0, rightDx), rightDy) * 180) / Math.PI : 0;
  return Math.max(leftDeg, rightDeg);
}

// Hip shift: max |hipMidX − median(hipMidX over rep)| / ankle spread.
function computeHipShift(visible: FrameSample[], startIdx: number, endIdx: number): number {
  const window = visible.slice(startIdx, endIdx + 1);
  if (window.length === 0) return 0;
  const hipXs = window.map((s) => s.hipX);
  const center = median(hipXs);
  const ankleSpread = median(window.map((s) => Math.abs(s.leftAnkleX - s.rightAnkleX)));
  if (ankleSpread < 1e-4) return 0;
  let maxDev = 0;
  for (const x of hipXs) {
    const d = Math.abs(x - center);
    if (d > maxDev) maxDev = d;
  }
  return maxDev / ankleSpread;
}

// Symmetry: worst per-frame paired-joint vertical asymmetry (shoulders or hips)
// across the rep, normalized by body height.
function computeSymmetry(
  visible: FrameSample[],
  startIdx: number,
  endIdx: number,
  bodyHeight: number
): number {
  let maxTilt = 0;
  for (let j = startIdx; j <= endIdx; j++) {
    const s = visible[j];
    const sTilt = Math.abs(s.leftShoulderY - s.rightShoulderY);
    const hTilt = Math.abs(s.leftHipY - s.rightHipY);
    if (sTilt > maxTilt) maxTilt = sTilt;
    if (hTilt > maxTilt) maxTilt = hTilt;
  }
  return maxTilt / bodyHeight;
}

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
    view: "unclear",
    viewRatio: 0,
  };
  if (visible.length < MIN_VISIBLE_SAMPLES) return base;

  // Body-height proxy: vertical span shoulders → ankles. Use median across the
  // whole trajectory so it's robust to the bottom of a deep squat.
  const heights = visible.map((s) => s.ankleY - s.shoulderY).filter((h) => h > 0);
  const bodyHeight = median(heights);
  if (bodyHeight <= 0) return base;

  // Classify camera angle from how spread shoulders/hips appear horizontally
  // relative to body height. Robust to mid-rep occlusions via median.
  const widths = visible.map((s) => (s.shoulderWidth + s.hipWidth) / 2);
  const viewRatio = median(widths) / bodyHeight;
  const view = viewFor(viewRatio);

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

    // Max torso lean across the full rep window (eccentric + bottom + concentric).
    // Catches good-morning ascents where hips rise faster than chest after the bottom.
    let leanDeg = 0;
    let leanIdx = p;
    for (let j = startIdx; j <= endIdx; j++) {
      const d = torsoAngleDeg(visible[j]);
      if (d > leanDeg) {
        leanDeg = d;
        leanIdx = j;
      }
    }

    // HIGH-risk criteria.
    const tempoS = ts[p] - ts[startIdx];
    const buttWinkDeg = computeButtWink(visible, ts, p);
    const thoracicDeg = computeThoracic(visible[p]);
    const hipRiseRatio = computeHipRiseRate(visible, ts, p, endIdx, bodyHeight);
    const valgusDeg = computeValgus(visible[p]);
    const hipShiftPct = computeHipShift(visible, startIdx, endIdx);
    const symmetryPct = computeSymmetry(visible, startIdx, endIdx, bodyHeight);

    reps.push({
      index: reps.length + 1,
      startT: ts[startIdx],
      bottomT: ts[p],
      endT: ts[endIdx],
      depth,
      depthLabel,
      leanDeg,
      leanLabel: leanLabelFor(leanDeg),
      leanAtT: ts[leanIdx],
      tempoS,
      tempoLabel: tempoLabelFor(tempoS),
      buttWinkDeg,
      buttWinkLabel: buttWinkLabelFor(buttWinkDeg),
      thoracicDeg,
      thoracicLabel: thoracicLabelFor(thoracicDeg),
      hipRiseRatio,
      hipRiseLabel: hipRiseLabelFor(hipRiseRatio),
      valgusDeg,
      valgusLabel: valgusLabelFor(valgusDeg),
      hipShiftPct,
      hipShiftLabel: hipShiftLabelFor(hipShiftPct),
      symmetryPct,
      symmetryLabel: symmetryLabelFor(symmetryPct),
    });
  }

  return {
    reps,
    framesProcessed: samples.length,
    framesUsable: visible.length,
    bodyHeight,
    durationS,
    view,
    viewRatio,
  };
}
