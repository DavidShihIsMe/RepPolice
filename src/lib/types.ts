// ─── Pose Detection Types ────────────────────────────────────────────────────

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: Landmark[];
}

export type CameraAngle = "frontal" | "rear" | "left_side" | "right_side" | "diagonal" | "uncertain";
export type ExerciseType = "squat" | "deadlift" | "other" | "unknown";

export interface PoseAnalysisResult {
  frames: PoseFrame[];
  videoDuration: number;
  fps: number;
  frameCount: number;
  cameraAngle?: CameraAngle;
  exerciseType?: ExerciseType;
}

export type ProgressCallback = (progress: number, stage: string) => void;

/** Named indices for the 33 MediaPipe Pose landmarks */
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

// ─── Squat Analysis Types ────────────────────────────────────────────────────

export type MetricRating = "green" | "yellow" | "red";
export type MetricConfidence = "high" | "medium" | "low";

export interface MetricScore {
  score: number;
  rating: MetricRating;
  summary: string;
  issueFrames: number[];
  confidence: MetricConfidence;
}

export interface RepData {
  repNumber: number;
  startFrame: number;
  endFrame: number;
  bottomFrame: number;
  depth: MetricScore;
  kneeTracking: MetricScore;
  backAngle: MetricScore;
  barPath: MetricScore;
  symmetry: MetricScore;
  buttWink: MetricScore;
  tempo: MetricScore;
  heelRise: MetricScore;
  stanceWidth: MetricScore;
  hipShift: MetricScore;
  kneeValgus: MetricScore;
  kneeTravel: MetricScore;
  depthConsistency: MetricScore;
  thoracicRounding: MetricScore;
  hipRiseRate: MetricScore;
  reversalControl: MetricScore;
  stanceWidthShift: MetricScore;
  headPosition: MetricScore;
}

export interface SquatAnalysisResult {
  reps: RepData[];
  overall: {
    depth: MetricScore;
    kneeTracking: MetricScore;
    backAngle: MetricScore;
    barPath: MetricScore;
    symmetry: MetricScore;
    buttWink: MetricScore;
    tempo: MetricScore;
    heelRise: MetricScore;
    stanceWidth: MetricScore;
    hipShift: MetricScore;
    kneeValgus: MetricScore;
    kneeTravel: MetricScore;
    depthConsistency: MetricScore;
    thoracicRounding: MetricScore;
    hipRiseRate: MetricScore;
    reversalControl: MetricScore;
    stanceWidthShift: MetricScore;
    headPosition: MetricScore;
  };
  repCount: number;
  exerciseType?: ExerciseType;
  cameraAngle?: CameraAngle;
}
