import type { Pose } from "./types";

// 1€ filter (Casiez et al.) — adaptive low-pass: heavy smoothing at rest,
// light smoothing during fast motion. Standard for pose stabilization.
function createOneEuro(minCutoff: number, beta: number, dCutoff: number) {
  let prevX: number | null = null;
  let prevDx = 0;
  let prevT = 0;

  const alphaFor = (cutoff: number, dt: number) => {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };

  return function filter(x: number, tSec: number): number {
    if (prevX === null) {
      prevX = x;
      prevT = tSec;
      return x;
    }
    const dt = Math.max(tSec - prevT, 1e-6);
    const dx = (x - prevX) / dt;
    const alphaD = alphaFor(dCutoff, dt);
    const dxSmooth = alphaD * dx + (1 - alphaD) * prevDx;
    const cutoff = minCutoff + beta * Math.abs(dxSmooth);
    const alpha = alphaFor(cutoff, dt);
    const filtered = alpha * x + (1 - alpha) * prevX;
    prevX = filtered;
    prevDx = dxSmooth;
    prevT = tSec;
    return filtered;
  };
}

// Hysteresis thresholds on MediaPipe's visibility score.
// ON: needs to be confidently seen at least once before drawing.
// OFF: stays drawn until score really drops (occluded knee dips to ~0.3, but
// rarely below 0.15 once tracking is established).
const VIS_ON = 0.5;
const VIS_OFF = 0.15;

// 1€ params. Tuned for normalized [0..1] coords at ~30 fps.
// Lower min_cutoff = more smoothing at rest; higher beta = more responsive
// during fast motion (squat reversal at the bottom).
const MIN_CUTOFF = 1.5;
const BETA = 0.05;
const D_CUTOFF = 1.0;

export interface PoseSmoother {
  smooth(pose: Pose | null, tSec: number): Pose | null;
  reset(): void;
}

export function createPoseSmoother(): PoseSmoother {
  let xFilters: Array<(x: number, t: number) => number> | null = null;
  let yFilters: Array<(y: number, t: number) => number> | null = null;
  let visible: boolean[] | null = null;

  function ensure(n: number) {
    if (xFilters && xFilters.length === n) return;
    xFilters = Array.from({ length: n }, () =>
      createOneEuro(MIN_CUTOFF, BETA, D_CUTOFF)
    );
    yFilters = Array.from({ length: n }, () =>
      createOneEuro(MIN_CUTOFF, BETA, D_CUTOFF)
    );
    visible = new Array(n).fill(false);
  }

  return {
    smooth(pose, tSec) {
      if (!pose) return null;
      const n = pose.keypoints.length;
      ensure(n);
      const xf = xFilters!;
      const yf = yFilters!;
      const vis = visible!;
      return {
        ...pose,
        keypoints: pose.keypoints.map((k, i) => {
          // Hysteresis on visibility
          if (k.score >= VIS_ON) vis[i] = true;
          else if (k.score < VIS_OFF) vis[i] = false;
          // Otherwise: sticky — last decision holds.

          const x = xf[i](k.x, tSec);
          const y = yf[i](k.y, tSec);

          // Collapse score to binary: anything below the drawPose threshold
          // hides the point, anything at/above it draws.
          return { ...k, x, y, score: vis[i] ? 1 : 0 };
        }),
      };
    },
    reset() {
      xFilters = null;
      yFilters = null;
      visible = null;
    },
  };
}
