import type { Landmark, PoseFrame, PoseAnalysisResult, ProgressCallback, CameraAngle, ExerciseType } from "./types";
import { POSE_LANDMARKS } from "./types";

const CDN_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

type PoseLandmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number
  ) => { landmarks: Array<Array<{ x: number; y: number; z: number; visibility: number }>> };
  close: () => void;
};

async function createLandmarker(onProgress?: ProgressCallback): Promise<PoseLandmarker> {
  onProgress?.(2, "Loading pose detection model...");

  const vision = await import("@mediapipe/tasks-vision");
  const { FilesetResolver, PoseLandmarker: PL } = vision;

  onProgress?.(5, "Initializing vision runtime...");

  const filesetResolver = await FilesetResolver.forVisionTasks(CDN_URL);

  onProgress?.(8, "Creating pose landmarker...");

  // Try GPU first, fall back to CPU if unavailable
  let landmarker: Awaited<ReturnType<typeof PL.createFromOptions>>;
  try {
    landmarker = await PL.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch {
    console.warn("[PoseDetection] GPU delegate failed, falling back to CPU");
    landmarker = await PL.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  onProgress?.(10, "Model loaded");
  return landmarker as unknown as PoseLandmarker;
}

// ─── One Euro Filter ────────────────────────────────────────────────────────

class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number;
  private dxPrev: number;
  private tPrev: number;
  private initialized: boolean;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = 0;
    this.dxPrev = 0;
    this.tPrev = 0;
    this.initialized = false;
  }

  private smoothingFactor(cutoff: number, dt: number): number {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }

  filter(x: number, t: number): number {
    if (!this.initialized) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      this.initialized = true;
      return x;
    }

    const dt = t - this.tPrev;
    if (dt <= 0) return this.xPrev;

    // Derivative
    const dx = (x - this.xPrev) / dt;
    const aD = this.smoothingFactor(this.dCutoff, dt);
    const dxSmoothed = aD * dx + (1 - aD) * this.dxPrev;

    // Adaptive cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(dxSmoothed);
    const a = this.smoothingFactor(cutoff, dt);

    const xFiltered = a * x + (1 - a) * this.xPrev;

    this.xPrev = xFiltered;
    this.dxPrev = dxSmoothed;
    this.tPrev = t;

    return xFiltered;
  }
}

// ─── Per-landmark-group filter parameters ───────────────────────────────────

const CORE_TORSO = new Set([11, 12, 23, 24]);
const LEGS = new Set([25, 26, 27, 28]);

function getFilterParams(landmarkIndex: number): { minCutoff: number; beta: number } {
  if (CORE_TORSO.has(landmarkIndex)) return { minCutoff: 1.5, beta: 0.005 };
  if (LEGS.has(landmarkIndex)) return { minCutoff: 0.8, beta: 0.01 };
  return { minCutoff: 0.5, beta: 0.015 }; // Extremities
}

// ─── Outlier rejection ──────────────────────────────────────────────────────

type RawLandmark = { x: number; y: number; z: number; visibility: number };

function estimateBodyHeight(landmarks: RawLandmark[]): number {
  const ls = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rs = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const la = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
  const ra = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  const shoulderY = (ls.y + rs.y) / 2;
  const ankleY = (la.y + ra.y) / 2;
  return Math.abs(ankleY - shoulderY);
}

function rejectOutliers(
  rawLandmarks: RawLandmark[],
  prevLandmarks: RawLandmark[] | null,
  bodyHeight: number
): RawLandmark[] {
  if (!prevLandmarks || bodyHeight <= 0) return rawLandmarks;

  const threshold = bodyHeight * 0.15;
  return rawLandmarks.map((lm, i) => {
    const prev = prevLandmarks[i];
    const dx = lm.x - prev.x;
    const dy = lm.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > threshold) {
      return { ...prev, visibility: lm.visibility };
    }
    return lm;
  });
}

// ─── Native FPS detection ───────────────────────────────────────────────────

function detectNativeFps(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(video as any).requestVideoFrameCallback) {
      resolve(30);
      return;
    }

    const timestamps: number[] = [];
    const TARGET_FRAMES = 15;
    let done = false;

    const finish = (fps: number) => {
      if (done) return;
      done = true;
      video.pause();
      video.currentTime = 0;
      resolve(fps);
    };

    const timeout = setTimeout(() => finish(30), 5000);

    const onFrame = (_now: number, metadata: { mediaTime: number }) => {
      if (done) return;
      timestamps.push(metadata.mediaTime);

      if (timestamps.length >= TARGET_FRAMES) {
        clearTimeout(timeout);
        const intervals: number[] = [];
        for (let i = 1; i < timestamps.length; i++) {
          const dt = timestamps[i] - timestamps[i - 1];
          if (dt > 0) intervals.push(dt);
        }
        if (intervals.length === 0) {
          finish(30);
          return;
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const fps = Math.round(1 / avgInterval);
        finish(fps > 0 ? fps : 30);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (video as any).requestVideoFrameCallback(onFrame);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (video as any).requestVideoFrameCallback(onFrame);
    video.play().catch(() => {
      clearTimeout(timeout);
      finish(30);
    });
  });
}

// ─── Video Helpers ──────────────────────────────────────────────────────────

function prepareVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.preload = "auto";
    // MediaPipe needs the video element to be in the DOM
    video.style.position = "fixed";
    video.style.top = "-9999px";
    video.style.left = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    document.body.appendChild(video);

    video.onloadeddata = () => resolve(video);
    video.onerror = () => {
      document.body.removeChild(video);
      reject(new Error("Failed to load video for analysis"));
    };
    video.src = src;
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.01) {
      resolve();
      return;
    }
    video.onseeked = () => {
      video.onseeked = null;
      resolve();
    };
    video.currentTime = time;
  });
}

// ─── Camera Angle Detection ─────────────────────────────────────────────────

function detectCameraAngle(frames: PoseFrame[]): CameraAngle {
  if (frames.length < 5) return "uncertain";

  // Step 1: Find stable frames — first run of 5 consecutive frames with shoulder visibility >= 0.3
  let stableStart = -1;
  for (let i = 0; i <= frames.length - 5; i++) {
    let allVisible = true;
    for (let j = i; j < i + 5; j++) {
      const ls = frames[j].landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
      const rs = frames[j].landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
      if (ls.visibility < 0.3 || rs.visibility < 0.3) {
        allVisible = false;
        break;
      }
    }
    if (allVisible) {
      stableStart = i;
      break;
    }
  }

  if (stableStart === -1) return "uncertain";

  // Sample up to 15 frames from the stable start
  const maxSamples = 15;
  const sampleEnd = Math.min(frames.length, stableStart + maxSamples);
  const sampleFrames = frames.slice(stableStart, sampleEnd);

  // Step 2: Per-frame classification
  const votes: CameraAngle[] = [];
  let totalShoulderSpread = 0;
  let totalFaceVis = 0;
  let validCount = 0;

  for (const f of sampleFrames) {
    const ls = f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rs = f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];

    if (ls.visibility < 0.3 || rs.visibility < 0.3) continue;

    const shoulderSpread = Math.abs(ls.x - rs.x);
    totalShoulderSpread += shoulderSpread;

    const nose = f.landmarks[POSE_LANDMARKS.NOSE];
    const leftEye = f.landmarks[POSE_LANDMARKS.LEFT_EYE];
    const rightEye = f.landmarks[POSE_LANDMARKS.RIGHT_EYE];
    const faceVis = (nose.visibility + leftEye.visibility + rightEye.visibility) / 3;
    totalFaceVis += faceVis;
    validCount++;

    if (shoulderSpread < 0.08) {
      // Side view — determine which side faces camera
      // Compare avg visibility of left landmarks (11,13,15) vs right (12,14,16)
      const leftVis = (
        f.landmarks[POSE_LANDMARKS.LEFT_SHOULDER].visibility +
        f.landmarks[POSE_LANDMARKS.LEFT_ELBOW].visibility +
        f.landmarks[POSE_LANDMARKS.LEFT_WRIST].visibility
      ) / 3;
      const rightVis = (
        f.landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].visibility +
        f.landmarks[POSE_LANDMARKS.RIGHT_ELBOW].visibility +
        f.landmarks[POSE_LANDMARKS.RIGHT_WRIST].visibility
      ) / 3;
      votes.push(leftVis >= rightVis ? "left_side" : "right_side");
    } else if (shoulderSpread > 0.20) {
      // Frontal or rear
      votes.push(faceVis > 0.5 ? "frontal" : "rear");
    } else {
      // Diagonal (0.08 <= shoulderSpread <= 0.20)
      votes.push("diagonal");
    }
  }

  if (votes.length === 0) return "uncertain";

  // Step 3: Majority vote
  const voteCounts = new Map<CameraAngle, number>();
  for (const v of votes) {
    voteCounts.set(v, (voteCounts.get(v) ?? 0) + 1);
  }

  let bestAngle: CameraAngle = "uncertain";
  let bestCount = 0;
  voteCounts.forEach((count, angle) => {
    if (count > bestCount) {
      bestCount = count;
      bestAngle = angle;
    }
  });

  const confidence = bestCount / votes.length;
  const avgShoulderSpread = validCount > 0 ? totalShoulderSpread / validCount : 0;
  const avgFaceVis = validCount > 0 ? totalFaceVis / validCount : 0;

  // Step 4: Confidence threshold
  const finalAngle = confidence >= 0.6 ? bestAngle : "uncertain";

  // Print summary to console
  console.log(
    `[Camera Angle Detection] angle=${finalAngle}, confidence=${(confidence * 100).toFixed(1)}%` +
    `, votes=${votes.length}, shoulderSpread=${avgShoulderSpread.toFixed(3)}` +
    `, faceVis=${avgFaceVis.toFixed(3)}` +
    (finalAngle === "uncertain" ? `, bestGuess=${bestAngle}` : "")
  );

  return finalAngle;
}

// ─── Exercise Type Detection ────────────────────────────────────────────────

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

function detectExerciseType(frames: PoseFrame[]): ExerciseType {
  if (frames.length < 4) return "unknown";

  const hipYValues: number[] = [];
  const hipXValues: number[] = [];
  const kneeAngles: number[] = [];

  for (const f of frames) {
    const lh = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rh = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
    const lk = f.landmarks[POSE_LANDMARKS.LEFT_KNEE];
    const rk = f.landmarks[POSE_LANDMARKS.RIGHT_KNEE];
    const la = f.landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const ra = f.landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

    if (lh.visibility < 0.3 || rh.visibility < 0.3) continue;

    hipYValues.push((lh.y + rh.y) / 2);
    hipXValues.push((lh.x + rh.x) / 2);

    if (lk.visibility > 0.3 && la.visibility > 0.3) {
      kneeAngles.push(angleBetween(lh, lk, la));
    }
    if (rk.visibility > 0.3 && ra.visibility > 0.3) {
      kneeAngles.push(angleBetween(rh, rk, ra));
    }
  }

  if (hipYValues.length < 2) return "unknown";

  const hipYRange = Math.max(...hipYValues) - Math.min(...hipYValues);
  const hipXRange = Math.max(...hipXValues) - Math.min(...hipXValues);
  const kneeAngleRange = kneeAngles.length > 0 ? Math.max(...kneeAngles) - Math.min(...kneeAngles) : 0;

  // Squat: meaningful hip Y range with knee bend
  if (hipYRange > 0.1 && kneeAngleRange > 30) return "squat";
  // Deadlift: moderate hip Y range, more hip X movement, less knee bend
  if (hipYRange > 0.08 && hipXRange > 0.05 && kneeAngleRange < 30) return "deadlift";
  // If there's any meaningful vertical movement, assume squat (prefer false positive over rejection)
  if (hipYRange > 0.05) return "squat";

  return "other";
}

// ─── Main Processing ────────────────────────────────────────────────────────

export async function processVideo(
  videoSrc: string,
  onProgress?: ProgressCallback
): Promise<PoseAnalysisResult> {
  let landmarker: PoseLandmarker | null = null;
  let videoEl: HTMLVideoElement | null = null;

  try {
    // Phase 1: Load model (0-10%)
    landmarker = await createLandmarker(onProgress);

    // Phase 2: Prepare video (10-12%)
    onProgress?.(10, "Preparing video...");
    videoEl = await prepareVideo(videoSrc);
    const duration = videoEl.duration;
    onProgress?.(12, "Video ready");

    // Phase 2b: Detect native FPS (12-14%)
    onProgress?.(12, "Detecting video frame rate...");
    const detectedFps = await detectNativeFps(videoEl);
    onProgress?.(14, `Detected ${detectedFps} fps`);

    // Phase 3: Process frames (15-100%)
    const timeStep = 1 / detectedFps;
    const totalSteps = Math.floor(duration / timeStep);
    const frames: PoseFrame[] = [];

    // Create 33×3 One Euro Filters with per-landmark-group tuning
    const filters: OneEuroFilter[][] = Array.from({ length: 33 }, (_, i) => {
      const { minCutoff, beta } = getFilterParams(i);
      return [
        new OneEuroFilter(minCutoff, beta, 1.0),
        new OneEuroFilter(minCutoff, beta, 1.0),
        new OneEuroFilter(minCutoff, beta, 1.0),
      ];
    });

    // Outlier rejection state
    let prevLandmarks: RawLandmark[] | null = null;
    let bodyHeight = 0;

    for (let i = 0; i <= totalSteps; i++) {
      const time = i * timeStep;
      if (time > duration) break;

      await seekTo(videoEl, time);

      const timestampMs = Math.round(time * 1000);
      const result = landmarker.detectForVideo(videoEl, timestampMs);

      if (result.landmarks && result.landmarks.length > 0) {
        let rawLandmarks = result.landmarks[0];

        // Estimate body height on first valid frame
        if (bodyHeight === 0) {
          bodyHeight = estimateBodyHeight(rawLandmarks);
        }

        // Outlier rejection (before filtering)
        rawLandmarks = rejectOutliers(rawLandmarks, prevLandmarks, bodyHeight);
        prevLandmarks = rawLandmarks;

        // One Euro Filter
        const landmarks: Landmark[] = rawLandmarks.map((lm, j) => ({
          x: filters[j][0].filter(lm.x, time),
          y: filters[j][1].filter(lm.y, time),
          z: filters[j][2].filter(lm.z, time),
          visibility: lm.visibility,
        }));
        frames.push({ timestamp: time, landmarks });
      }

      const progress = 15 + (i / totalSteps) * 85;
      onProgress?.(Math.round(progress), `Processing frame ${i + 1} of ${totalSteps + 1}...`);
    }

    onProgress?.(100, "Analysis complete");

    // Check if we detected a person at all
    if (frames.length === 0) {
      throw new Error("Could not detect a person in the video. Make sure your full body is visible and the lighting is good.");
    }

    // Check visibility of squat-critical landmarks across detected frames
    const KEY_LANDMARKS = [
      POSE_LANDMARKS.LEFT_HIP,
      POSE_LANDMARKS.RIGHT_HIP,
      POSE_LANDMARKS.LEFT_KNEE,
      POSE_LANDMARKS.RIGHT_KNEE,
      POSE_LANDMARKS.LEFT_ANKLE,
      POSE_LANDMARKS.RIGHT_ANKLE,
    ];
    const avgVisibility =
      frames.reduce((sum, f) => {
        const vis = KEY_LANDMARKS.reduce((s, idx) => s + f.landmarks[idx].visibility, 0) / KEY_LANDMARKS.length;
        return sum + vis;
      }, 0) / frames.length;

    if (avgVisibility < 0.3) {
      throw new Error("Please film from the side for best results. The camera angle made it difficult to accurately detect your pose.");
    }

    // Detect camera angle and exercise type
    const cameraAngle = detectCameraAngle(frames);
    const exerciseType = detectExerciseType(frames);

    // Gate on exercise type
    if (exerciseType === "deadlift") {
      throw new Error("This looks like a deadlift, not a squat. RepPolice currently only supports squat analysis. Deadlift support coming soon!");
    }
    if (exerciseType === "other") {
      throw new Error("Could not identify this as a squat exercise. Make sure the video shows a clear squat movement with visible hip and knee flexion.");
    }

    return {
      frames,
      videoDuration: duration,
      fps: detectedFps,
      frameCount: frames.length,
      cameraAngle,
      exerciseType,
    };
  } finally {
    if (landmarker) {
      try {
        landmarker.close();
      } catch {
        // ignore cleanup errors
      }
    }
    if (videoEl && videoEl.parentNode) {
      videoEl.parentNode.removeChild(videoEl);
    }
  }
}
