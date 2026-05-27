// Compact per-frame sample collected during analysis playback.
// Stores midpoints + widths for rep detection / depth / lean / view, plus
// per-side joint coords + head landmark for the HIGH-risk grading criteria.
export interface FrameSample {
  t: number; // seconds, monotonically increasing

  // Midpoints — used by rep detection and existing depth/lean/view code.
  hipY: number; // avg of landmarks 23, 24, normalized 0..1 (top=0)
  hipX: number; // avg of 23, 24 — needed for torso angle
  kneeY: number; // avg of landmarks 25, 26
  shoulderY: number; // avg of 11, 12 (used for body-height normalization)
  shoulderX: number; // avg of 11, 12 — needed for torso angle
  ankleY: number; // avg of 27, 28

  // Horizontal spread between left/right of each pair. Used for view detection:
  // wide in front view (shoulders/hips visible across frame), narrow in side
  // view (far landmark occluded behind near one).
  shoulderWidth: number;
  hipWidth: number;

  // Head midpoint — avg of nose (0), leftEar (7), rightEar (8). Used for
  // thoracic rounding (head-vs-torso-axis angle).
  headX: number;
  headY: number;

  // Per-side joint coords. Needed for knee valgus (femur angle from each
  // hip-to-knee), hip shift (hipMid drift normalized by ankle spread), and
  // left/right symmetry (vertical asymmetry between paired joints).
  leftShoulderX: number;
  leftShoulderY: number;
  rightShoulderX: number;
  rightShoulderY: number;
  leftHipX: number;
  leftHipY: number;
  rightHipX: number;
  rightHipY: number;
  leftKneeX: number;
  leftKneeY: number;
  rightKneeX: number;
  rightKneeY: number;
  leftAnkleX: number;
  leftAnkleY: number;
  rightAnkleX: number;
  rightAnkleY: number;

  visible: boolean; // true if all required landmarks are confidently visible
}

export type DepthLabel = "above" | "parallel" | "below";
export type LeanLabel = "upright" | "moderate" | "excessive";
export type View = "side" | "front" | "unclear";

// HIGH-risk criterion labels.
export type TempoLabel = "divebomb" | "controlled" | "slow";
export type ButtWinkLabel = "none" | "mild" | "severe";
export type ThoracicLabel = "neutral" | "rounded" | "excessive";
export type HipRiseLabel = "balanced" | "good_morning" | "chest_first";
export type ValgusLabel = "tracking" | "mild_cave" | "severe_cave";
export type HipShiftLabel = "stable" | "shifted";
export type SymmetryLabel = "balanced" | "asymmetric" | "severe";

export interface Rep {
  index: number; // 1-based for display
  startT: number; // seconds — top of descent (eccentric start)
  bottomT: number; // seconds — deepest hip position
  endT: number; // seconds — top of ascent (rep finish)

  // Depth (side-view applicable).
  depth: number; // normalized: (hipY − kneeY)_bottom / bodyHeight. Positive = below parallel.
  depthLabel: DepthLabel;

  // Forward lean (side-view applicable). Max torso angle vs. vertical across
  // the rep window — typically at bottom, but "good-morning" ascents peak later.
  leanDeg: number;
  leanLabel: LeanLabel;
  leanAtT: number; // seconds — timestamp of the max-lean frame, for jump-to

  // Eccentric tempo (side). Descent time in seconds.
  tempoS: number;
  tempoLabel: TempoLabel;

  // Butt wink approximation (side). Lean-angle change in the last 0.3s before
  // bottom — proxies the late-rep pelvic tuck.
  buttWinkDeg: number;
  buttWinkLabel: ButtWinkLabel;

  // Thoracic rounding (side). Angle between head-from-shoulder and
  // shoulder-from-hip vectors at bottom of rep.
  thoracicDeg: number;
  thoracicLabel: ThoracicLabel;

  // Hip rise rate (both views). Ratio of hip vs shoulder percentage-risen at
  // mid-ascent. >1.15 = good-morning, <0.85 = chest-first.
  hipRiseRatio: number;
  hipRiseLabel: HipRiseLabel;

  // Knee valgus (front). Max inward femur tilt at bottom across both legs.
  valgusDeg: number;
  valgusLabel: ValgusLabel;

  // Hip shift (front). Max lateral hip-midpoint drift / ankle spread.
  hipShiftPct: number;
  hipShiftLabel: HipShiftLabel;

  // Left/right symmetry (front). Max paired-joint vertical asymmetry / body height.
  symmetryPct: number;
  symmetryLabel: SymmetryLabel;
}

export interface AnalysisResult {
  reps: Rep[];
  framesProcessed: number;
  framesUsable: number; // visible-only
  bodyHeight: number; // normalized; median ankleY − shoulderY across the trajectory
  durationS: number;
  view: View;
  viewRatio: number; // median (shoulderWidth + hipWidth)/2 / bodyHeight
}
