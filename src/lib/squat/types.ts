// Compact per-frame sample collected during analysis playback.
// Stores only what's needed for rep detection + depth metric.
export interface FrameSample {
  t: number; // seconds, monotonically increasing
  hipY: number; // avg of landmarks 23, 24, normalized 0..1 (top=0)
  kneeY: number; // avg of landmarks 25, 26
  shoulderY: number; // avg of 11, 12 (used for body-height normalization)
  ankleY: number; // avg of 27, 28
  visible: boolean; // true if all four pairs are confidently visible
}

export type DepthLabel = "above" | "parallel" | "below";

export interface Rep {
  index: number; // 1-based for display
  startT: number; // seconds — top of descent (eccentric start)
  bottomT: number; // seconds — deepest hip position
  endT: number; // seconds — top of ascent (rep finish)
  depth: number; // normalized: (hipY − kneeY)_bottom / bodyHeight. Positive = below parallel.
  depthLabel: DepthLabel;
}

export interface AnalysisResult {
  reps: Rep[];
  framesProcessed: number;
  framesUsable: number; // visible-only
  bodyHeight: number; // normalized; median ankleY − shoulderY across the trajectory
  durationS: number;
}
