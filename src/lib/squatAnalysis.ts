import type {
  Landmark,
  PoseFrame,
  MetricRating,
  MetricConfidence,
  MetricScore,
  RepData,
  SquatAnalysisResult,
  CameraAngle,
  ExerciseType,
} from "./types";
import { POSE_LANDMARKS } from "./types";

// ─── Geometry Helpers ────────────────────────────────────────────────────────

function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const baX = a.x - b.x;
  const baY = a.y - b.y;
  const bcX = c.x - b.x;
  const bcY = c.y - b.y;
  const dot = baX * bcX + baY * bcY;
  const magBA = Math.sqrt(baX * baX + baY * baY);
  const magBC = Math.sqrt(bcX * bcX + bcY * bcY);
  if (magBA === 0 || magBC === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: (a.visibility + b.visibility) / 2,
  };
}

function getRating(score: number): MetricRating {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Confidence Matrix ──────────────────────────────────────────────────────

const CONFIDENCE_MATRIX: Record<string, Record<CameraAngle, MetricConfidence>> = {
  depth:         { frontal: "medium", rear: "medium", left_side: "high",  right_side: "high",  diagonal: "high",   uncertain: "medium" },
  kneeTracking:  { frontal: "high",   rear: "high",   left_side: "low",   right_side: "low",   diagonal: "medium", uncertain: "medium" },
  backAngle:     { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
  barPath:       { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
  symmetry:      { frontal: "high",   rear: "high",   left_side: "low",   right_side: "low",   diagonal: "medium", uncertain: "medium" },
  buttWink:      { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
  tempo:         { frontal: "high",   rear: "high",   left_side: "high",  right_side: "high",  diagonal: "high",   uncertain: "high"   },
  heelRise:      { frontal: "medium", rear: "medium", left_side: "high",  right_side: "high",  diagonal: "high",   uncertain: "medium" },
  stanceWidth:   { frontal: "high",   rear: "high",   left_side: "low",   right_side: "low",   diagonal: "medium", uncertain: "medium" },
  hipShift:          { frontal: "high",   rear: "high",   left_side: "low",   right_side: "low",   diagonal: "medium", uncertain: "medium" },
  kneeValgus:        { frontal: "high",   rear: "high",   left_side: "low",   right_side: "low",   diagonal: "medium", uncertain: "medium" },
  kneeTravel:        { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
  depthConsistency:  { frontal: "medium", rear: "medium", left_side: "high",  right_side: "high",  diagonal: "high",   uncertain: "medium" },
  thoracicRounding:  { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
  hipRiseRate:       { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
  reversalControl:   { frontal: "medium", rear: "medium", left_side: "high",  right_side: "high",  diagonal: "high",   uncertain: "medium" },
  stanceWidthShift:  { frontal: "high",   rear: "high",   left_side: "low",   right_side: "low",   diagonal: "medium", uncertain: "medium" },
  headPosition:      { frontal: "low",    rear: "low",    left_side: "high",  right_side: "high",  diagonal: "medium", uncertain: "medium" },
};

export function getMetricConfidence(metric: string, cameraAngle: CameraAngle): MetricConfidence {
  const row = CONFIDENCE_MATRIX[metric];
  if (!row) return "medium";
  return row[cameraAngle] ?? "medium";
}

// ─── Smoothing ───────────────────────────────────────────────────────────────

function movingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = start; j <= end; j++) sum += values[j];
    result.push(sum / (end - start + 1));
  }
  return result;
}

// ─── Rep Detection ───────────────────────────────────────────────────────────

interface DetectedRep {
  startFrame: number;
  endFrame: number;
  bottomFrame: number;
}

/** Walk outward from a rep-bottom peak to find the nearest valley (standing position). */
function findValley(smoothed: number[], from: number, direction: -1 | 1, boundary: number): number {
  let i = from;
  while (true) {
    const next = i + direction;
    if (direction === -1 ? next < boundary : next > boundary) break;
    if (smoothed[next] > smoothed[i]) break; // stopped descending → valley found
    i = next;
  }
  return i;
}

function detectReps(frames: PoseFrame[]): DetectedRep[] {
  if (frames.length < 5) return [];

  // Track average hip Y across all frames
  const hipYValues = frames.map((f) => {
    const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
    return (lh.y + rh.y) / 2;
  });

  // Smooth to reduce noise
  const smoothed = movingAverage(hipYValues, 5);

  // Find local maxima (bottom of squat = highest Y value in normalized coords)
  const minProminence = 0.02; // minimum Y-change to qualify as a rep
  const bottoms: number[] = [];

  for (let i = 2; i < smoothed.length - 2; i++) {
    if (
      smoothed[i] > smoothed[i - 1] &&
      smoothed[i] > smoothed[i - 2] &&
      smoothed[i] > smoothed[i + 1] &&
      smoothed[i] > smoothed[i + 2]
    ) {
      // Check prominence: the peak should be meaningfully higher than surrounding valleys
      let leftMin = smoothed[i];
      for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
        leftMin = Math.min(leftMin, smoothed[j]);
      }
      let rightMin = smoothed[i];
      for (let j = i + 1; j <= Math.min(smoothed.length - 1, i + 15); j++) {
        rightMin = Math.min(rightMin, smoothed[j]);
      }
      const prominence = smoothed[i] - Math.max(leftMin, rightMin);
      if (prominence >= minProminence) {
        bottoms.push(i);
      }
    }
  }

  if (bottoms.length === 0) return [];

  // Segment frames into reps centered around each bottom
  const reps: DetectedRep[] = [];
  for (let i = 0; i < bottoms.length; i++) {
    const bottom = bottoms[i];
    const prevBottom = i > 0 ? bottoms[i - 1] : -1;
    const nextBottom = i < bottoms.length - 1 ? bottoms[i + 1] : frames.length;

    const start = prevBottom === -1
      ? findValley(smoothed, bottom, -1, 0)
      : Math.floor((prevBottom + bottom) / 2);
    const end = i === bottoms.length - 1
      ? findValley(smoothed, bottom, 1, smoothed.length - 1)
      : Math.floor((bottom + nextBottom) / 2) - 1;

    reps.push({
      startFrame: Math.max(0, start),
      endFrame: Math.min(frames.length - 1, end),
      bottomFrame: bottom,
    });
  }

  return reps;
}

// ─── Depth Score ─────────────────────────────────────────────────────────────

function scoreDepth(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const f = frames[rep.bottomFrame];
  const ls = f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rs = f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const lk = f.landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const rk = f.landmarks[POSE_LANDMARKS.RIGHT_KNEE];

  // Hip angle (angle at hip between shoulder-hip-knee)
  const leftHipAngle = angleBetween(ls, lh, lk);
  const rightHipAngle = angleBetween(rs, rh, rk);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const avgHipAngle = (leftHipAngle + rightHipAngle) / 2;

  // Check if hip crease is below knee top
  const avgHipY = (lh.y + rh.y) / 2;
  const avgKneeY = (lk.y + rk.y) / 2;
  const belowParallel = avgHipY > avgKneeY;

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (belowParallel) {
    // Below parallel: score 80-100 based on how deep
    const extraDepth = avgHipY - avgKneeY;
    score = clamp(80 + extraDepth * 200, 80, 100);
    summary = "Good depth — hips dropped below parallel";
  } else {
    // Check how close to parallel
    const deficit = avgKneeY - avgHipY;
    if (deficit < 0.03) {
      // Very close to parallel
      score = clamp(50 + (1 - deficit / 0.03) * 29, 50, 79);
      summary = "Close to parallel but hips didn't quite reach below knee level";
    } else {
      score = clamp(49 - deficit * 300, 0, 49);
      summary = "Squat depth is above parallel — try to get hips below knee level";
      issueFrames.push(rep.bottomFrame);
    }
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Active Zone Helper ─────────────────────────────────────────────────────

/** Returns true if the hip has descended at least 25% of the way to the bottom at this frame.
 *  Used to skip standing/setup frames at the start and end of each rep. */
function isActiveFrame(frames: PoseFrame[], rep: DetectedRep, frameIdx: number): boolean {
  const getHipY = (i: number) => {
    const f = frames[i];
    return (f.landmarks[POSE_LANDMARKS.LEFT_HIP].y + f.landmarks[POSE_LANDMARKS.RIGHT_HIP].y) / 2;
  };

  const standingY = getHipY(rep.startFrame);
  const bottomY = getHipY(rep.bottomFrame);
  const totalDrop = bottomY - standingY; // positive when squatting (Y increases downward)

  if (Math.abs(totalDrop) < 0.01) return true; // negligible movement, score everything

  const currentY = getHipY(frameIdx);
  const descent = currentY - standingY;
  const ratio = descent / totalDrop;

  return ratio >= 0.25; // hip must have descended at least 25% toward bottom
}

// ─── Knee Tracking Score ─────────────────────────────────────────────────────

function scoreKneeTracking(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const issueFrames: number[] = [];
  let maxDriftRatio = 0;

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    // Skip frames where person is just standing (setup/recovery)
    if (!isActiveFrame(frames, rep, i)) continue;

    const f = frames[i];
    const lk = f.landmarks[POSE_LANDMARKS.LEFT_KNEE];
    const rk = f.landmarks[POSE_LANDMARKS.RIGHT_KNEE];
    const la = f.landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const ra = f.landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

    const stanceWidth = Math.abs(la.x - ra.x);
    if (stanceWidth < 0.01) continue; // avoid division by zero

    const leftDrift = Math.abs(lk.x - la.x) / stanceWidth;
    const rightDrift = Math.abs(rk.x - ra.x) / stanceWidth;
    const maxFrameDrift = Math.max(leftDrift, rightDrift);

    if (maxFrameDrift > maxDriftRatio) {
      maxDriftRatio = maxFrameDrift;
    }
    if (maxFrameDrift > 0.1) {
      issueFrames.push(i);
    }
  }

  let score: number;
  let summary: string;

  if (maxDriftRatio < 0.05) {
    score = clamp(80 + (1 - maxDriftRatio / 0.05) * 20, 80, 100);
    summary = "Good knee tracking — knees stayed aligned over toes";
  } else if (maxDriftRatio < 0.1) {
    score = clamp(50 + ((0.1 - maxDriftRatio) / 0.05) * 29, 50, 79);
    summary = "Minor knee drift detected — focus on pushing knees out over toes";
  } else {
    score = clamp(49 - (maxDriftRatio - 0.1) * 200, 0, 49);
    summary = "Significant knee cave detected — knees collapsed inward during the squat";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Back Angle Score ────────────────────────────────────────────────────────

function scoreBackAngle(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const issueFrames: number[] = [];
  const angles: number[] = [];

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    const f = frames[i];
    const shoulderMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]
    );
    const hipMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_HIP],
      f.landmarks[POSE_LANDMARKS.RIGHT_HIP]
    );

    // Angle of shoulder->hip line relative to vertical
    // Vertical in normalized coords: straight down = (0, 1)
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y; // negative because shoulder is above hip (lower Y)
    const angleFromVertical = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;

    angles.push(angleFromVertical);
    if (angleFromVertical > 60) {
      issueFrames.push(i);
    }
  }

  if (angles.length === 0) {
    return { score: 50, rating: "yellow", summary: "Could not assess back angle", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const maxAngle = Math.max(...angles);
  const mean = angles.reduce((s, a) => s + a, 0) / angles.length;
  const variance = angles.reduce((s, a) => s + (a - mean) ** 2, 0) / angles.length;
  const stdDev = Math.sqrt(variance);

  let score: number;
  let summary: string;

  if (maxAngle <= 45 && stdDev < 10) {
    score = clamp(80 + (1 - maxAngle / 45) * 20, 80, 100);
    summary = "Good torso position — maintained an upright back angle";
  } else if (maxAngle <= 60) {
    score = clamp(50 + ((60 - maxAngle) / 15) * 29, 50, 79);
    summary = "Moderate forward lean — try to keep your chest more upright";
  } else {
    score = clamp(49 - (maxAngle - 60) * 2, 0, 49);
    summary = "Excessive forward lean — risk of lower back strain";
  }

  // Penalize inconsistency
  if (stdDev > 15) {
    score = Math.max(0, score - 10);
    summary += ". Torso angle was inconsistent throughout the rep";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Bar Path Score ──────────────────────────────────────────────────────────

function scoreBarPath(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const issueFrames: number[] = [];
  const xPositions: number[] = [];

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    const f = frames[i];
    const shoulderMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]
    );
    xPositions.push(shoulderMid.x);
  }

  if (xPositions.length === 0) {
    return { score: 50, rating: "yellow", summary: "Could not assess bar path", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const meanX = xPositions.reduce((s, x) => s + x, 0) / xPositions.length;
  const maxDeviation = Math.max(...xPositions.map((x) => Math.abs(x - meanX)));

  // Convert normalized coords to approximate inches
  // Assume ~6ft (72 inches) person fills most of the frame height
  const estimatedFrameHeightInches = 72;
  const deviationInches = maxDeviation * estimatedFrameHeightInches;

  // Flag frames with significant deviation
  for (let i = 0; i < xPositions.length; i++) {
    if (Math.abs(xPositions[i] - meanX) * estimatedFrameHeightInches > 4) {
      issueFrames.push(rep.startFrame + i);
    }
  }

  let score: number;
  let summary: string;

  if (deviationInches < 2) {
    score = clamp(80 + (1 - deviationInches / 2) * 20, 80, 100);
    summary = "Good bar path — minimal horizontal drift";
  } else if (deviationInches < 4) {
    score = clamp(50 + ((4 - deviationInches) / 2) * 29, 50, 79);
    summary = "Some horizontal drift in bar path — focus on keeping the bar over midfoot";
  } else {
    score = clamp(49 - (deviationInches - 4) * 5, 0, 49);
    summary = "Excessive bar path deviation — the bar shifted significantly forward or back";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Symmetry Score ──────────────────────────────────────────────────────────

function scoreSymmetry(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const f = frames[rep.bottomFrame];
  const ls = f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rs = f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const lk = f.landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const rk = f.landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const la = f.landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const ra = f.landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  // Hip height difference
  const hipHeightDiff = Math.abs(lh.y - rh.y);

  // Knee angle difference
  const leftKneeAngle = angleBetween(lh, lk, la);
  const rightKneeAngle = angleBetween(rh, rk, ra);
  const kneeAngleDiff = Math.abs(leftKneeAngle - rightKneeAngle);
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const kneeAnglePct = avgKneeAngle > 0 ? kneeAngleDiff / avgKneeAngle : 0;

  // Shoulder height difference
  const shoulderHeightDiff = Math.abs(ls.y - rs.y);

  // Average percentage differences
  // Use the body height (shoulder to ankle) as reference for positional diffs
  const bodyHeight = Math.abs(((ls.y + rs.y) / 2) - ((la.y + ra.y) / 2));
  const hipPct = bodyHeight > 0 ? hipHeightDiff / bodyHeight : 0;
  const shoulderPct = bodyHeight > 0 ? shoulderHeightDiff / bodyHeight : 0;

  const avgAsymmetry = (hipPct + kneeAnglePct + shoulderPct) / 3;

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (avgAsymmetry < 0.05) {
    score = clamp(80 + (1 - avgAsymmetry / 0.05) * 20, 80, 100);
    summary = "Good symmetry — both sides moved evenly";
  } else if (avgAsymmetry < 0.1) {
    score = clamp(50 + ((0.1 - avgAsymmetry) / 0.05) * 29, 50, 79);
    summary = "Minor asymmetry detected — one side is working slightly harder";
    issueFrames.push(rep.bottomFrame);
  } else {
    score = clamp(49 - (avgAsymmetry - 0.1) * 200, 0, 49);
    summary = "Significant asymmetry — noticeable imbalance between left and right sides";
    issueFrames.push(rep.bottomFrame);
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Butt Wink Score ─────────────────────────────────────────────────────────

function scoreButtWink(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // Measure spine angle (shoulder→hip vs vertical) change near bottom
  const bottomIdx = rep.bottomFrame;
  const windowSize = Math.max(1, Math.floor((rep.endFrame - rep.startFrame) * 0.15));

  // Get spine angle at approach (a few frames before bottom)
  const approachIdx = Math.max(rep.startFrame, bottomIdx - windowSize * 2);
  const approachAngles: number[] = [];
  for (let i = approachIdx; i < Math.min(bottomIdx - windowSize, rep.endFrame); i++) {
    const f = frames[i];
    const shoulderMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]
    );
    const hipMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_HIP],
      f.landmarks[POSE_LANDMARKS.RIGHT_HIP]
    );
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y;
    approachAngles.push((Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI);
  }

  // Get spine angle at bottom window
  const bottomStart = Math.max(rep.startFrame, bottomIdx - windowSize);
  const bottomEnd = Math.min(rep.endFrame, bottomIdx + windowSize);
  const bottomAngles: number[] = [];
  for (let i = bottomStart; i <= bottomEnd; i++) {
    const f = frames[i];
    const shoulderMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]
    );
    const hipMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_HIP],
      f.landmarks[POSE_LANDMARKS.RIGHT_HIP]
    );
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y;
    bottomAngles.push((Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI);
  }

  if (approachAngles.length === 0 || bottomAngles.length === 0) {
    return { score: 75, rating: "yellow", summary: "Could not fully assess butt wink", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const approachAngle = approachAngles.reduce((s, a) => s + a, 0) / approachAngles.length;
  const maxBottomAngle = Math.max(...bottomAngles);
  const angleIncrease = Math.max(0, maxBottomAngle - approachAngle);

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (angleIncrease < 10) {
    score = clamp(80 + (1 - angleIncrease / 10) * 20, 80, 100);
    summary = "Good pelvic control — minimal butt wink at the bottom";
  } else if (angleIncrease < 15) {
    score = clamp(50 + ((15 - angleIncrease) / 5) * 29, 50, 79);
    summary = "Moderate butt wink — some posterior pelvic tilt at depth";
    for (let i = bottomStart; i <= bottomEnd; i++) issueFrames.push(i);
  } else {
    score = clamp(49 - (angleIncrease - 15) * 3, 0, 49);
    summary = "Significant butt wink — pelvis tucks under at the bottom, risking lower back strain";
    for (let i = bottomStart; i <= bottomEnd; i++) issueFrames.push(i);
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Tempo Score ─────────────────────────────────────────────────────────────

function scoreTempo(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const startTime = frames[rep.startFrame].timestamp;
  const bottomTime = frames[rep.bottomFrame].timestamp;
  const endTime = frames[rep.endFrame].timestamp;

  const eccentricDuration = bottomTime - startTime; // descent
  const concentricDuration = endTime - bottomTime;   // ascent
  const totalDuration = endTime - startTime;

  const issueFrames: number[] = [];
  let score = 100;
  const issues: string[] = [];

  // Total too short
  if (totalDuration < 1) {
    score = Math.min(score, 30);
    issues.push("rep completed too quickly");
    for (let i = rep.startFrame; i <= rep.endFrame; i++) issueFrames.push(i);
  }

  // Fast descent
  if (eccentricDuration < 1) {
    score = Math.min(score, 60);
    issues.push("descent too fast (< 1s)");
  } else if (eccentricDuration >= 1.5 && eccentricDuration <= 4) {
    // Good eccentric
  } else if (eccentricDuration > 4) {
    score = Math.min(score, 70);
    issues.push("descent very slow");
  }

  // Concentric phase
  if (concentricDuration < 0.8) {
    // Very fast ascent — could be bouncing
    score = Math.min(score, 65);
    issues.push("ascent very fast");
  } else if (concentricDuration > 2.5 && concentricDuration <= 3) {
    score = Math.min(score, 75);
    issues.push("ascent slightly slow");
  } else if (concentricDuration > 3) {
    score = Math.min(score, 60);
    issues.push("ascent too slow (> 3s)");
  }

  // Ratio check
  if (eccentricDuration > 0 && concentricDuration > 0) {
    const ratio = eccentricDuration / concentricDuration;
    if (ratio >= 1.2 && ratio <= 2.5) {
      // Good ratio
    } else if (ratio < 1.0) {
      score = Math.min(score, 65);
      issues.push("concentric slower than eccentric");
    }
  }

  let summary: string;
  if (issues.length === 0) {
    summary = `Good tempo — ${eccentricDuration.toFixed(1)}s down, ${concentricDuration.toFixed(1)}s up`;
  } else {
    summary = `Tempo: ${eccentricDuration.toFixed(1)}s down, ${concentricDuration.toFixed(1)}s up — ${issues.join(", ")}`;
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Heel Rise Score ─────────────────────────────────────────────────────────

function scoreHeelRise(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // Track heel Y from start to bottom. If heel Y decreases (moves up), heel is lifting
  const startFrame = frames[rep.startFrame];
  const lHeelStart = startFrame.landmarks[POSE_LANDMARKS.LEFT_HEEL].y;
  const rHeelStart = startFrame.landmarks[POSE_LANDMARKS.RIGHT_HEEL].y;
  const avgHeelStart = (lHeelStart + rHeelStart) / 2;

  let maxRise = 0;
  const issueFrames: number[] = [];

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    const f = frames[i];
    const lHeel = f.landmarks[POSE_LANDMARKS.LEFT_HEEL].y;
    const rHeel = f.landmarks[POSE_LANDMARKS.RIGHT_HEEL].y;
    const avgHeel = (lHeel + rHeel) / 2;

    // In normalized coords, Y decreasing means heel moving up (rising)
    const rise = avgHeelStart - avgHeel;
    if (rise > maxRise) {
      maxRise = rise;
    }
    if (rise > 0.015) {
      issueFrames.push(i);
    }
  }

  let score: number;
  let summary: string;

  if (maxRise < 0.015) {
    score = clamp(80 + (1 - maxRise / 0.015) * 20, 80, 100);
    summary = "Good heel contact — feet stayed flat throughout the squat";
  } else if (maxRise < 0.03) {
    score = clamp(50 + ((0.03 - maxRise) / 0.015) * 29, 50, 79);
    summary = "Minor heel rise detected — work on ankle mobility or try heel-elevated shoes";
  } else {
    score = clamp(49 - (maxRise - 0.03) * 500, 0, 49);
    summary = "Significant heel rise — heels lifted off the ground during the squat";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Stance Width Score ──────────────────────────────────────────────────────

function scoreStanceWidth(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // At start frame, compare ankle-to-ankle distance vs hip width
  const f = frames[rep.startFrame];
  const la = f.landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const ra = f.landmarks[POSE_LANDMARKS.RIGHT_ANKLE];
  const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];

  const ankleWidth = Math.abs(la.x - ra.x);
  const hipWidth = Math.abs(lh.x - rh.x);

  if (hipWidth < 0.01) {
    return { score: 75, rating: "yellow", summary: "Could not assess stance width — hip width too small to measure", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const ratio = ankleWidth / hipWidth;

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (ratio >= 1.2 && ratio <= 1.8) {
    score = clamp(80 + (1 - Math.abs(ratio - 1.5) / 0.3) * 20, 80, 100);
    summary = `Good stance width — ankles are ${ratio.toFixed(1)}x hip width`;
  } else if ((ratio >= 1.1 && ratio < 1.2) || (ratio > 1.8 && ratio <= 2.0)) {
    score = clamp(50 + 29 * (1 - Math.min(Math.abs(ratio - 1.2), Math.abs(ratio - 1.8)) / 0.2), 50, 79);
    summary = ratio < 1.2
      ? "Stance slightly narrow — try widening your feet a bit"
      : "Stance slightly wide — consider narrowing your feet slightly";
    issueFrames.push(rep.startFrame);
  } else {
    score = ratio < 1.1
      ? clamp(49 - (1.1 - ratio) * 200, 0, 49)
      : clamp(49 - (ratio - 2.0) * 100, 0, 49);
    summary = ratio < 1.1
      ? "Stance too narrow — feet are closer than hip width, limiting stability"
      : "Stance very wide — this may strain your inner thighs and limit depth";
    issueFrames.push(rep.startFrame);
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Hip Shift Score ─────────────────────────────────────────────────────────

function scoreHipShift(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // Track hip midpoint X during ascent (bottom→end). Measure max lateral deviation from mean.
  const xPositions: number[] = [];
  for (let i = rep.bottomFrame; i <= rep.endFrame; i++) {
    const f = frames[i];
    const hipMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_HIP],
      f.landmarks[POSE_LANDMARKS.RIGHT_HIP]
    );
    xPositions.push(hipMid.x);
  }

  if (xPositions.length < 2) {
    return { score: 75, rating: "yellow", summary: "Could not assess hip shift", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const meanX = xPositions.reduce((s, x) => s + x, 0) / xPositions.length;
  const maxDeviation = Math.max(...xPositions.map((x) => Math.abs(x - meanX)));

  // Convert to approximate inches (assume 72" person fills frame)
  const estimatedFrameHeightInches = 72;
  const deviationInches = maxDeviation * estimatedFrameHeightInches;

  const issueFrames: number[] = [];
  for (let i = 0; i < xPositions.length; i++) {
    if (Math.abs(xPositions[i] - meanX) * estimatedFrameHeightInches > 1.5) {
      issueFrames.push(rep.bottomFrame + i);
    }
  }

  let score: number;
  let summary: string;

  if (deviationInches < 1.5) {
    score = clamp(80 + (1 - deviationInches / 1.5) * 20, 80, 100);
    summary = "Good hip stability — hips stayed centered during ascent";
  } else if (deviationInches < 3) {
    score = clamp(50 + ((3 - deviationInches) / 1.5) * 29, 50, 79);
    summary = "Minor hip shift detected — hips drifted laterally during ascent";
  } else {
    score = clamp(49 - (deviationInches - 3) * 5, 0, 49);
    summary = "Significant hip shift — hips swayed to one side, suggesting a strength imbalance";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Knee Valgus Score ──────────────────────────────────────────────────────

function scoreKneeValgus(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const issueFrames: number[] = [];
  let maxValgusAngle = 0;

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    if (!isActiveFrame(frames, rep, i)) continue;
    const f = frames[i];
    const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
    const lk = f.landmarks[POSE_LANDMARKS.LEFT_KNEE];
    const la = f.landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
    const rk = f.landmarks[POSE_LANDMARKS.RIGHT_KNEE];
    const ra = f.landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

    // In frontal view, measure if knee X is inside the hip-ankle line
    // Valgus = knee collapses inward relative to hip-ankle alignment
    const leftInward = lk.x - ((lh.x + la.x) / 2); // positive = inward for left leg
    const rightInward = ((rh.x + ra.x) / 2) - rk.x; // positive = inward for right leg

    // Approximate valgus angle from lateral deviation
    const hipToAnkleY = Math.abs(lh.y - la.y);
    const leftAngle = hipToAnkleY > 0 ? (Math.atan2(Math.abs(leftInward), hipToAnkleY) * 180) / Math.PI : 0;
    const rightAngle = hipToAnkleY > 0 ? (Math.atan2(Math.abs(rightInward), hipToAnkleY) * 180) / Math.PI : 0;

    // Only count inward deviation (positive values)
    const leftValgus = leftInward > 0 ? leftAngle : 0;
    const rightValgus = rightInward > 0 ? rightAngle : 0;
    const frameMax = Math.max(leftValgus, rightValgus);

    if (frameMax > maxValgusAngle) maxValgusAngle = frameMax;
    if (frameMax > 10) issueFrames.push(i);
  }

  let score: number;
  let summary: string;

  if (maxValgusAngle < 10) {
    score = clamp(80 + (1 - maxValgusAngle / 10) * 20, 80, 100);
    summary = "Good knee alignment — knees tracked in line with toes";
  } else if (maxValgusAngle < 15) {
    score = clamp(50 + ((15 - maxValgusAngle) / 5) * 29, 50, 79);
    summary = "Minor knee valgus — knees collapsed slightly inward";
  } else {
    score = clamp(49 - (maxValgusAngle - 15) * 3, 0, 49);
    summary = "Significant knee valgus — knees caved inward, increasing injury risk";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Knee Travel Score ──────────────────────────────────────────────────────

function scoreKneeTravel(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const f = frames[rep.bottomFrame];
  const lk = f.landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const rk = f.landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const lft = f.landmarks[POSE_LANDMARKS.LEFT_FOOT_INDEX];
  const rft = f.landmarks[POSE_LANDMARKS.RIGHT_FOOT_INDEX];

  // In sagittal view, measure how far knees pass toe line
  // Knee X past foot-index X (sign depends on which side faces camera)
  const leftTravel = lk.x - lft.x;
  const rightTravel = rk.x - rft.x;

  // Use whichever side has more forward travel (more visible side)
  // Both positive and negative can indicate forward travel depending on facing direction
  const maxTravel = Math.max(Math.abs(leftTravel), Math.abs(rightTravel));

  // Convert to approximate inches
  const estimatedFrameHeightInches = 72;
  const travelInches = maxTravel * estimatedFrameHeightInches;

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (travelInches < 2) {
    score = clamp(80 + (1 - travelInches / 2) * 20, 80, 100);
    summary = "Good knee position — knees stayed near or behind toe line";
  } else if (travelInches < 4) {
    score = clamp(50 + ((4 - travelInches) / 2) * 29, 50, 79);
    summary = "Moderate knee travel — knees tracked slightly past toes";
    issueFrames.push(rep.bottomFrame);
  } else {
    score = clamp(49 - (travelInches - 4) * 5, 0, 49);
    summary = "Excessive forward knee travel — knees extended well past toes, increasing knee stress";
    issueFrames.push(rep.bottomFrame);
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Depth Consistency Score ────────────────────────────────────────────────

function scoreDepthConsistency(frames: PoseFrame[], allReps: DetectedRep[]): MetricScore {
  if (allReps.length < 2) {
    return { score: 100, rating: "green", summary: "Single rep — consistency not applicable", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  // Collect hip Y at bottom for each rep
  const bottomDepths = allReps.map((rep) => {
    const f = frames[rep.bottomFrame];
    const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
    return (lh.y + rh.y) / 2;
  });

  const mean = bottomDepths.reduce((s, v) => s + v, 0) / bottomDepths.length;
  const variance = bottomDepths.reduce((s, v) => s + (v - mean) ** 2, 0) / bottomDepths.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0; // coefficient of variation

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (cv < 0.02) {
    score = clamp(80 + (1 - cv / 0.02) * 20, 80, 100);
    summary = "Excellent depth consistency — bottom position was very consistent across reps";
  } else if (cv < 0.05) {
    score = clamp(50 + ((0.05 - cv) / 0.03) * 29, 50, 79);
    summary = "Minor depth variation — some reps were deeper than others";
    // Flag the shallowest rep
    const minDepth = Math.min(...bottomDepths);
    const shallowest = bottomDepths.indexOf(minDepth);
    issueFrames.push(allReps[shallowest].bottomFrame);
  } else {
    score = clamp(49 - (cv - 0.05) * 500, 0, 49);
    summary = "Inconsistent depth — significant variation in bottom position between reps";
    for (const rep of allReps) issueFrames.push(rep.bottomFrame);
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Thoracic Rounding Score ────────────────────────────────────────────────

function scoreThoracicRounding(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const issueFrames: number[] = [];
  let maxRounding = 0;

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    if (!isActiveFrame(frames, rep, i)) continue;
    const f = frames[i];
    const ls = f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rs = f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];

    const shoulderMid = midpoint(ls, rs);
    const hipMid = midpoint(lh, rh);

    // Upper back angle: measure shoulder-to-hip angle relative to vertical
    // For thoracic rounding specifically, compare the upper portion of the trunk
    // Use nose as proxy for upper thoracic position
    const nose = f.landmarks[POSE_LANDMARKS.NOSE];

    // Angle of nose→shoulder relative to vertical (shoulder→hip is forward lean)
    // A rounded upper back causes the nose to drop forward relative to shoulders
    const trunkDx = shoulderMid.x - hipMid.x;
    const trunkDy = shoulderMid.y - hipMid.y;
    const trunkAngle = (Math.atan2(Math.abs(trunkDx), Math.abs(trunkDy)) * 180) / Math.PI;

    const upperDx = nose.x - shoulderMid.x;
    const upperDy = nose.y - shoulderMid.y;
    const upperAngle = (Math.atan2(Math.abs(upperDx), Math.abs(upperDy)) * 180) / Math.PI;

    // Thoracic rounding = upper segment is angled more forward than the trunk overall
    const rounding = Math.max(0, upperAngle - trunkAngle);

    if (rounding > maxRounding) maxRounding = rounding;
    if (rounding > 20) issueFrames.push(i);
  }

  let score: number;
  let summary: string;

  if (maxRounding < 15) {
    score = clamp(80 + (1 - maxRounding / 15) * 20, 80, 100);
    summary = "Good upper back position — thoracic spine stayed neutral";
  } else if (maxRounding < 25) {
    score = clamp(50 + ((25 - maxRounding) / 10) * 29, 50, 79);
    summary = "Moderate thoracic rounding — upper back collapsed slightly under load";
  } else {
    score = clamp(49 - (maxRounding - 25) * 2, 0, 49);
    summary = "Significant thoracic rounding — upper back rounded excessively";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Hip Rise Rate Score ────────────────────────────────────────────────────

function scoreHipRiseRate(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // During ascent (bottom → end), compare hip Y change rate vs shoulder Y change rate
  // If hips rise much faster than shoulders = "good morning" pattern
  const bottomIdx = rep.bottomFrame;
  const endIdx = rep.endFrame;
  const ascentFrames = endIdx - bottomIdx;

  if (ascentFrames < 3) {
    return { score: 75, rating: "yellow", summary: "Could not assess hip rise rate — ascent too short", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const issueFrames: number[] = [];
  let maxRateRatio = 0;

  // Sample the ascent in chunks to detect good-morning pattern
  const chunkSize = Math.max(2, Math.floor(ascentFrames / 5));
  for (let i = bottomIdx; i < endIdx - chunkSize; i += Math.max(1, Math.floor(chunkSize / 2))) {
    const f1 = frames[i];
    const f2 = frames[Math.min(i + chunkSize, endIdx)];

    const hipY1 = (f1.landmarks[POSE_LANDMARKS.LEFT_HIP].y + f1.landmarks[POSE_LANDMARKS.RIGHT_HIP].y) / 2;
    const hipY2 = (f2.landmarks[POSE_LANDMARKS.LEFT_HIP].y + f2.landmarks[POSE_LANDMARKS.RIGHT_HIP].y) / 2;
    const shoulderY1 = (f1.landmarks[POSE_LANDMARKS.LEFT_SHOULDER].y + f1.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].y) / 2;
    const shoulderY2 = (f2.landmarks[POSE_LANDMARKS.LEFT_SHOULDER].y + f2.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].y) / 2;

    // Y decreasing = rising in normalized coords
    const hipRise = hipY1 - hipY2;
    const shoulderRise = shoulderY1 - shoulderY2;

    if (shoulderRise > 0.001) {
      const rateRatio = hipRise / shoulderRise;
      if (rateRatio > maxRateRatio) maxRateRatio = rateRatio;
      if (rateRatio > 1.5) issueFrames.push(i);
    } else if (hipRise > 0.01) {
      // Hips rising but shoulders not — definite good-morning
      maxRateRatio = Math.max(maxRateRatio, 3);
      issueFrames.push(i);
    }
  }

  let score: number;
  let summary: string;

  if (maxRateRatio < 1.3) {
    score = clamp(80 + (1 - maxRateRatio / 1.3) * 20, 80, 100);
    summary = "Good ascent mechanics — hips and shoulders rose together";
  } else if (maxRateRatio < 1.8) {
    score = clamp(50 + ((1.8 - maxRateRatio) / 0.5) * 29, 50, 79);
    summary = "Hips rising slightly ahead of chest — mild good-morning tendency";
  } else {
    score = clamp(49 - (maxRateRatio - 1.8) * 15, 0, 49);
    summary = "Good-morning pattern — hips shot up while chest stayed low, risking lower back strain";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Reversal Control Score ─────────────────────────────────────────────────

function scoreReversalControl(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // Measure velocity change at the bottom of the squat
  // A hard bounce = high velocity change, controlled = smooth deceleration/acceleration
  const bottomIdx = rep.bottomFrame;
  const windowSize = Math.max(2, Math.floor((rep.endFrame - rep.startFrame) * 0.1));

  const getHipY = (idx: number) => {
    const f = frames[idx];
    return (f.landmarks[POSE_LANDMARKS.LEFT_HIP].y + f.landmarks[POSE_LANDMARKS.RIGHT_HIP].y) / 2;
  };

  // Compute velocities before and after bottom
  const preStart = Math.max(rep.startFrame, bottomIdx - windowSize);
  const postEnd = Math.min(rep.endFrame, bottomIdx + windowSize);

  if (postEnd - preStart < 3) {
    return { score: 75, rating: "yellow", summary: "Could not assess reversal control", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  // Velocity before bottom (descent speed)
  const preVelocities: number[] = [];
  for (let i = preStart; i < bottomIdx; i++) {
    const dt = frames[i + 1].timestamp - frames[i].timestamp;
    if (dt > 0) preVelocities.push((getHipY(i + 1) - getHipY(i)) / dt);
  }

  // Velocity after bottom (ascent speed)
  const postVelocities: number[] = [];
  for (let i = bottomIdx; i < postEnd; i++) {
    const dt = frames[i + 1].timestamp - frames[i].timestamp;
    if (dt > 0) postVelocities.push((getHipY(i + 1) - getHipY(i)) / dt);
  }

  if (preVelocities.length === 0 || postVelocities.length === 0) {
    return { score: 75, rating: "yellow", summary: "Could not assess reversal control", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  // Average descent velocity (should be positive — hip moving down)
  const avgPreVel = preVelocities.reduce((s, v) => s + v, 0) / preVelocities.length;
  // Average ascent velocity (should be negative — hip moving up)
  const avgPostVel = postVelocities.reduce((s, v) => s + v, 0) / postVelocities.length;

  // Velocity change at reversal point — higher = more abrupt bounce
  const velocityChange = Math.abs(avgPreVel - avgPostVel);

  const issueFrames: number[] = [];
  let score: number;
  let summary: string;

  if (velocityChange < 0.3) {
    score = clamp(80 + (1 - velocityChange / 0.3) * 20, 80, 100);
    summary = "Good reversal control — smooth, controlled transition at the bottom";
  } else if (velocityChange < 0.6) {
    score = clamp(50 + ((0.6 - velocityChange) / 0.3) * 29, 50, 79);
    summary = "Moderate bounce at bottom — try pausing briefly at the bottom for more control";
    issueFrames.push(bottomIdx);
  } else {
    score = clamp(49 - (velocityChange - 0.6) * 30, 0, 49);
    summary = "Hard bounce at bottom — rapid direction change increases injury risk";
    for (let i = preStart; i <= postEnd; i++) issueFrames.push(i);
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Stance Width Shift Score ───────────────────────────────────────────────

function scoreStanceWidthShift(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  // Compare ankle-to-ankle distance at start vs throughout rep
  const startFrame = frames[rep.startFrame];
  const startAnkleWidth = Math.abs(
    startFrame.landmarks[POSE_LANDMARKS.LEFT_ANKLE].x -
    startFrame.landmarks[POSE_LANDMARKS.RIGHT_ANKLE].x
  );

  if (startAnkleWidth < 0.01) {
    return { score: 75, rating: "yellow", summary: "Could not assess stance width shift", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  let maxShiftPct = 0;
  const issueFrames: number[] = [];

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    const f = frames[i];
    const currentWidth = Math.abs(
      f.landmarks[POSE_LANDMARKS.LEFT_ANKLE].x -
      f.landmarks[POSE_LANDMARKS.RIGHT_ANKLE].x
    );
    const shiftPct = Math.abs(currentWidth - startAnkleWidth) / startAnkleWidth;

    if (shiftPct > maxShiftPct) maxShiftPct = shiftPct;
    if (shiftPct > 0.1) issueFrames.push(i);
  }

  let score: number;
  let summary: string;

  if (maxShiftPct < 0.08) {
    score = clamp(80 + (1 - maxShiftPct / 0.08) * 20, 80, 100);
    summary = "Good stance stability — feet stayed in position throughout the rep";
  } else if (maxShiftPct < 0.15) {
    score = clamp(50 + ((0.15 - maxShiftPct) / 0.07) * 29, 50, 79);
    summary = "Minor stance shift — feet drifted slightly during the rep";
    issueFrames.push(rep.bottomFrame);
  } else {
    score = clamp(49 - (maxShiftPct - 0.15) * 200, 0, 49);
    summary = "Significant stance shift — feet moved noticeably wider or narrower mid-rep";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Head Position Score ────────────────────────────────────────────────────

function scoreHeadPosition(frames: PoseFrame[], rep: DetectedRep): MetricScore {
  const issueFrames: number[] = [];
  let maxDeviation = 0;

  for (let i = rep.startFrame; i <= rep.endFrame; i++) {
    if (!isActiveFrame(frames, rep, i)) continue;
    const f = frames[i];
    const nose = f.landmarks[POSE_LANDMARKS.NOSE];
    const shoulderMid = midpoint(
      f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]
    );

    // Measure cervical angle: nose position relative to shoulder midpoint
    // Neutral head = nose roughly above shoulders (slight forward offset is normal)
    const dx = nose.x - shoulderMid.x;
    const dy = nose.y - shoulderMid.y; // negative because nose is above shoulders

    // Angle from vertical (0° = looking straight, positive = forward/down)
    const headAngle = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;

    if (headAngle > maxDeviation) maxDeviation = headAngle;
    if (headAngle > 35) issueFrames.push(i);
  }

  let score: number;
  let summary: string;

  if (maxDeviation < 25) {
    score = clamp(80 + (1 - maxDeviation / 25) * 20, 80, 100);
    summary = "Good head position — neck stayed in neutral alignment";
  } else if (maxDeviation < 40) {
    score = clamp(50 + ((40 - maxDeviation) / 15) * 29, 50, 79);
    summary = "Head position slightly off — avoid excessive neck extension or flexion";
  } else {
    score = clamp(49 - (maxDeviation - 40) * 2, 0, 49);
    summary = "Poor head position — neck was excessively extended or flexed, risking cervical strain";
  }

  return { score: Math.round(score), rating: getRating(Math.round(score)), summary, issueFrames, confidence: "high" as MetricConfidence };
}

// ─── Averaging Helpers ───────────────────────────────────────────────────────

function averageMetricScores(scores: MetricScore[]): MetricScore {
  if (scores.length === 0) {
    return { score: 0, rating: "red", summary: "No reps detected", issueFrames: [], confidence: "high" as MetricConfidence };
  }

  const avgScore = Math.round(scores.reduce((s, m) => s + m.score, 0) / scores.length);
  const allIssueFrames = scores.flatMap((m) => m.issueFrames);

  // Pick the most representative summary (use the median-scored rep)
  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const medianSummary = sorted[Math.floor(sorted.length / 2)].summary;

  // Append rep count context
  const goodReps = scores.filter((s) => s.score >= 80).length;
  let summary = medianSummary;
  if (scores.length > 1) {
    summary += ` (${goodReps}/${scores.length} reps rated good)`;
  }

  // Pass through confidence from the first rep (all reps share the same confidence for a given metric)
  const confidence = scores[0].confidence;

  return {
    score: avgScore,
    rating: getRating(avgScore),
    summary,
    issueFrames: allIssueFrames,
    confidence,
  };
}

// ─── Main Analysis ───────────────────────────────────────────────────────────

export function analyzeSquat(
  frames: PoseFrame[],
  exerciseType?: ExerciseType,
  cameraAngle?: CameraAngle
): SquatAnalysisResult {
  const detectedReps = detectReps(frames);

  // If no clear reps detected via peak detection, check if there's meaningful
  // hip movement at all. If there is, treat entire video as one rep.
  let repsToAnalyze: DetectedRep[];

  if (detectedReps.length > 0) {
    repsToAnalyze = detectedReps;
  } else {
    // Check for any meaningful vertical hip movement
    const hipYValues = frames.map((f) => {
      const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
      const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
      return (lh.y + rh.y) / 2;
    });
    const minY = Math.min(...hipYValues);
    const maxY = Math.max(...hipYValues);
    const range = maxY - minY;

    if (range < 0.005) {
      throw new Error("Could not detect any squat reps. Make sure your video shows at least one full squat repetition.");
    }

    // Treat entire video as one rep with deepest point as the bottom
    let bottomIdx = 0;
    let peakY = -Infinity;
    for (let i = 0; i < hipYValues.length; i++) {
      if (hipYValues[i] > peakY) {
        peakY = hipYValues[i];
        bottomIdx = i;
      }
    }
    repsToAnalyze = [{ startFrame: 0, endFrame: frames.length - 1, bottomFrame: bottomIdx }];
  }

  const angle = cameraAngle ?? "uncertain";
  const metricKeys = ["depth", "kneeTracking", "backAngle", "barPath", "symmetry", "buttWink", "tempo", "heelRise", "stanceWidth", "hipShift", "kneeValgus", "kneeTravel", "depthConsistency", "thoracicRounding", "hipRiseRate", "reversalControl", "stanceWidthShift", "headPosition"] as const;

  // Pre-compute depth consistency (cross-rep metric)
  const depthConsistencyScore = scoreDepthConsistency(frames, repsToAnalyze);

  const reps: RepData[] = repsToAnalyze.map((rep, idx) => {
    const repData: RepData = {
      repNumber: idx + 1,
      startFrame: rep.startFrame,
      endFrame: rep.endFrame,
      bottomFrame: rep.bottomFrame,
      depth: scoreDepth(frames, rep),
      kneeTracking: scoreKneeTracking(frames, rep),
      backAngle: scoreBackAngle(frames, rep),
      barPath: scoreBarPath(frames, rep),
      symmetry: scoreSymmetry(frames, rep),
      buttWink: scoreButtWink(frames, rep),
      tempo: scoreTempo(frames, rep),
      heelRise: scoreHeelRise(frames, rep),
      stanceWidth: scoreStanceWidth(frames, rep),
      hipShift: scoreHipShift(frames, rep),
      kneeValgus: scoreKneeValgus(frames, rep),
      kneeTravel: scoreKneeTravel(frames, rep),
      depthConsistency: depthConsistencyScore, // same for all reps (cross-rep metric)
      thoracicRounding: scoreThoracicRounding(frames, rep),
      hipRiseRate: scoreHipRiseRate(frames, rep),
      reversalControl: scoreReversalControl(frames, rep),
      stanceWidthShift: scoreStanceWidthShift(frames, rep),
      headPosition: scoreHeadPosition(frames, rep),
    };

    // Stamp confidence based on camera angle
    for (const key of metricKeys) {
      repData[key].confidence = getMetricConfidence(key, angle);
    }

    return repData;
  });

  return {
    reps,
    overall: {
      depth: averageMetricScores(reps.map((r) => r.depth)),
      kneeTracking: averageMetricScores(reps.map((r) => r.kneeTracking)),
      backAngle: averageMetricScores(reps.map((r) => r.backAngle)),
      barPath: averageMetricScores(reps.map((r) => r.barPath)),
      symmetry: averageMetricScores(reps.map((r) => r.symmetry)),
      buttWink: averageMetricScores(reps.map((r) => r.buttWink)),
      tempo: averageMetricScores(reps.map((r) => r.tempo)),
      heelRise: averageMetricScores(reps.map((r) => r.heelRise)),
      stanceWidth: averageMetricScores(reps.map((r) => r.stanceWidth)),
      hipShift: averageMetricScores(reps.map((r) => r.hipShift)),
      kneeValgus: averageMetricScores(reps.map((r) => r.kneeValgus)),
      kneeTravel: averageMetricScores(reps.map((r) => r.kneeTravel)),
      depthConsistency: depthConsistencyScore,
      thoracicRounding: averageMetricScores(reps.map((r) => r.thoracicRounding)),
      hipRiseRate: averageMetricScores(reps.map((r) => r.hipRiseRate)),
      reversalControl: averageMetricScores(reps.map((r) => r.reversalControl)),
      stanceWidthShift: averageMetricScores(reps.map((r) => r.stanceWidthShift)),
      headPosition: averageMetricScores(reps.map((r) => r.headPosition)),
    },
    repCount: reps.length,
    exerciseType,
    cameraAngle,
  };
}

// ─── Trim Frames to Rep Range ───────────────────────────────────────────────

export function trimFramesToReps(frames: PoseFrame[]): {
  frames: PoseFrame[];
  startTimestamp: number;
  endTimestamp: number;
} {
  if (frames.length === 0) {
    return { frames, startTimestamp: 0, endTimestamp: 0 };
  }

  const reps = detectReps(frames);

  if (reps.length === 0) {
    return {
      frames,
      startTimestamp: frames[0].timestamp,
      endTimestamp: frames[frames.length - 1].timestamp,
    };
  }

  const firstRep = reps[0];
  const lastRep = reps[reps.length - 1];

  // Add ~2.5 seconds of buffer before first rep and after last rep
  const BUFFER_SECONDS = 2.5;
  const avgFrameDuration = frames.length > 1
    ? (frames[frames.length - 1].timestamp - frames[0].timestamp) / (frames.length - 1)
    : 1 / 30;
  const bufferFrames = Math.ceil(BUFFER_SECONDS / avgFrameDuration);

  const trimStart = Math.max(0, firstRep.startFrame - bufferFrames);
  const trimEnd = Math.min(frames.length - 1, lastRep.endFrame + bufferFrames);

  const trimmedFrames = frames.slice(trimStart, trimEnd + 1);

  return {
    frames: trimmedFrames,
    startTimestamp: frames[trimStart].timestamp,
    endTimestamp: frames[trimEnd].timestamp,
  };
}
