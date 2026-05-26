import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Pose, PoseDetector } from "./types";

// MediaPipe BlazePose has 33 landmarks (indices match
// https://developers.google.com/mediapipe/solutions/vision/pose_landmarker#models).
const MP_KEYPOINT_NAMES = [
  "nose",
  "left_eye_inner", "left_eye", "left_eye_outer",
  "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear",
  "mouth_left", "mouth_right",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_pinky", "right_pinky",
  "left_index", "right_index",
  "left_thumb", "right_thumb",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle",
  "left_heel", "right_heel",
  "left_foot_index", "right_foot_index",
];

// Body skeleton edges (excludes face/hand detail for clarity).
const MP_EDGES: ReadonlyArray<readonly [number, number]> = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // shoulder→hip
  [23, 24], // hips
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], // left leg + foot
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32], // right leg + foot
];

export async function createMediaPipeDetector(): Promise<PoseDetector> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
  );

  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return {
    name: "MediaPipe Pose (Full)",
    async detect(video, t): Promise<Pose | null> {
      // detectForVideo is synchronous and returns latest pose for this frame.
      const result = landmarker.detectForVideo(video, t);
      const landmarks = result.landmarks?.[0];
      if (!landmarks || landmarks.length === 0) return null;
      return {
        keypoints: landmarks.map((lm, i) => ({
          x: lm.x,
          y: lm.y,
          score: lm.visibility ?? 1,
          name: MP_KEYPOINT_NAMES[i] ?? `kp_${i}`,
        })),
        edges: MP_EDGES,
      };
    },
    dispose() {
      landmarker.close();
    },
  };
}
