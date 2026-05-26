import type { Pose } from "../pose/types";
import type { FrameSample } from "./types";

// MediaPipe BlazePose indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

const VISIBILITY_THRESHOLD = 0.4;

// Build a FrameSample from a raw MediaPipe pose. Returns null if essential
// keypoints are missing — caller filters those out.
export function sampleFromPose(pose: Pose, tSec: number): FrameSample | null {
  const k = pose.keypoints;
  const ls = k[LEFT_SHOULDER];
  const rs = k[RIGHT_SHOULDER];
  const lh = k[LEFT_HIP];
  const rh = k[RIGHT_HIP];
  const lk = k[LEFT_KNEE];
  const rk = k[RIGHT_KNEE];
  const la = k[LEFT_ANKLE];
  const ra = k[RIGHT_ANKLE];
  if (!ls || !rs || !lh || !rh || !lk || !rk || !la || !ra) return null;

  const visible =
    ls.score > VISIBILITY_THRESHOLD &&
    rs.score > VISIBILITY_THRESHOLD &&
    lh.score > VISIBILITY_THRESHOLD &&
    rh.score > VISIBILITY_THRESHOLD &&
    lk.score > VISIBILITY_THRESHOLD &&
    rk.score > VISIBILITY_THRESHOLD &&
    la.score > VISIBILITY_THRESHOLD &&
    ra.score > VISIBILITY_THRESHOLD;

  return {
    t: tSec,
    hipY: (lh.y + rh.y) / 2,
    kneeY: (lk.y + rk.y) / 2,
    shoulderY: (ls.y + rs.y) / 2,
    ankleY: (la.y + ra.y) / 2,
    visible,
  };
}
