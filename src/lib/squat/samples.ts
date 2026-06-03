import type { Keypoint, Pose } from "../pose/types";
import type { FrameSample } from "./types";

// MediaPipe BlazePose indices
const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

// Per-keypoint raw visibility floor for accepting a sample. MediaPipe's
// scores for partially-occluded joints (e.g., far ankle in side view) commonly
// sit in the 0.25–0.40 range even when the spatial prediction is fine.
// 0.25 lets those frames through; the analyze pipeline still filters obvious
// nonsense via prominence / NMS / body-height checks downstream.
const VISIBILITY_THRESHOLD = 0.25;

// Head midpoint = avg of nose + visible ears. Ears are often occluded in side
// view, so fall back to nose alone rather than dropping the sample.
function headMidpoint(
  nose: Keypoint,
  le: Keypoint | undefined,
  re: Keypoint | undefined
): { x: number; y: number } {
  const parts: Keypoint[] = [nose];
  if (le && le.score > VISIBILITY_THRESHOLD) parts.push(le);
  if (re && re.score > VISIBILITY_THRESHOLD) parts.push(re);
  let x = 0;
  let y = 0;
  for (const p of parts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / parts.length, y: y / parts.length };
}

// Build a FrameSample from a raw MediaPipe pose. Returns null if essential
// keypoints are missing — caller filters those out.
export function sampleFromPose(pose: Pose, tSec: number): FrameSample | null {
  const k = pose.keypoints;
  const nose = k[NOSE];
  const le = k[LEFT_EAR];
  const re = k[RIGHT_EAR];
  const ls = k[LEFT_SHOULDER];
  const rs = k[RIGHT_SHOULDER];
  const lh = k[LEFT_HIP];
  const rh = k[RIGHT_HIP];
  const lk = k[LEFT_KNEE];
  const rk = k[RIGHT_KNEE];
  const la = k[LEFT_ANKLE];
  const ra = k[RIGHT_ANKLE];
  if (!nose || !ls || !rs || !lh || !rh || !lk || !rk || !la || !ra) return null;

  // Required for all grading: 8 main joints + nose (head anchor). Ears are
  // optional — headMidpoint falls back to nose if they're missing.
  const visible =
    nose.score > VISIBILITY_THRESHOLD &&
    ls.score > VISIBILITY_THRESHOLD &&
    rs.score > VISIBILITY_THRESHOLD &&
    lh.score > VISIBILITY_THRESHOLD &&
    rh.score > VISIBILITY_THRESHOLD &&
    lk.score > VISIBILITY_THRESHOLD &&
    rk.score > VISIBILITY_THRESHOLD &&
    la.score > VISIBILITY_THRESHOLD &&
    ra.score > VISIBILITY_THRESHOLD;

  const head = headMidpoint(nose, le, re);

  return {
    t: tSec,
    hipY: (lh.y + rh.y) / 2,
    hipX: (lh.x + rh.x) / 2,
    kneeY: (lk.y + rk.y) / 2,
    shoulderY: (ls.y + rs.y) / 2,
    shoulderX: (ls.x + rs.x) / 2,
    ankleY: (la.y + ra.y) / 2,
    shoulderWidth: Math.abs(ls.x - rs.x),
    hipWidth: Math.abs(lh.x - rh.x),
    headX: head.x,
    headY: head.y,
    leftShoulderX: ls.x,
    leftShoulderY: ls.y,
    rightShoulderX: rs.x,
    rightShoulderY: rs.y,
    leftHipX: lh.x,
    leftHipY: lh.y,
    rightHipX: rh.x,
    rightHipY: rh.y,
    leftKneeX: lk.x,
    leftKneeY: lk.y,
    rightKneeX: rk.x,
    rightKneeY: rk.y,
    leftAnkleX: la.x,
    leftAnkleY: la.y,
    rightAnkleX: ra.x,
    rightAnkleY: ra.y,
    visible,
  };
}
