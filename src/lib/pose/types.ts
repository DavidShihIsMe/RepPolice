// Common pose representation used by all detector adapters.
// All coordinates are normalized to [0, 1] relative to the source video's
// intrinsic dimensions. The drawing layer scales them to canvas pixels.

export interface Keypoint {
  x: number; // 0..1
  y: number; // 0..1
  score: number; // 0..1 confidence
  name: string;
}

export interface Pose {
  keypoints: Keypoint[];
  // Adjacency list of [aIdx, bIdx] keypoint pairs for skeleton edges.
  edges: ReadonlyArray<readonly [number, number]>;
}

export interface PoseDetector {
  name: string;
  detect(video: HTMLVideoElement, timestampMs: number): Promise<Pose | null>;
  dispose(): Promise<void> | void;
}
