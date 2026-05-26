import type { Pose } from "./types";

const KP_RADIUS = 4;
const EDGE_WIDTH = 3;
const MIN_SCORE = 0.3;

export function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: Pose | null,
  options: { color?: string; minScore?: number } = {}
) {
  const { color = "#22d3ee", minScore = MIN_SCORE } = options;
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!pose) return;

  const { keypoints, edges } = pose;

  // Edges first so points draw on top.
  ctx.strokeStyle = color;
  ctx.lineWidth = EDGE_WIDTH;
  ctx.lineCap = "round";
  for (const [a, b] of edges) {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb) continue;
    if (ka.score < minScore || kb.score < minScore) continue;
    ctx.beginPath();
    ctx.moveTo(ka.x * width, ka.y * height);
    ctx.lineTo(kb.x * width, kb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = color;
  for (const k of keypoints) {
    if (k.score < minScore) continue;
    ctx.beginPath();
    ctx.arc(k.x * width, k.y * height, KP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Make canvas's intrinsic pixel size match video's intrinsic size.
// Critical for overlay alignment: pose coords are normalized [0..1] of the
// video's *intrinsic* dimensions, so canvas internal pixels must match.
// CSS sizing (width: 100%; height: 100%) handles the scaled display.
export function syncCanvasToVideo(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement
): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return false;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return true;
}
