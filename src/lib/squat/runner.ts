import { createMediaPipeDetector } from "../pose/mediapipe";
import { sampleFromPose } from "./samples";
import { analyze } from "./reps";
import type { AnalysisResult, FrameSample } from "./types";

interface RvfcMeta {
  mediaTime: number;
  expectedDisplayTime: number;
}
type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    cb: (now: number, metadata: RvfcMeta) => void
  ) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export interface AnalyzeVideoOptions {
  playbackRate?: number; // default 2; see VideoPlayer for rationale
  onProgress?: (pct: number) => void;
}

/**
 * Headless analysis: load `src` into an offscreen video, run MediaPipe over
 * every frame, return the AnalysisResult. Used both at upload time (before
 * the file is in storage) and from the Re-analyze button.
 *
 * The video element is appended to document.body with display:none — it is
 * not visible but it has to be in the DOM for `requestVideoFrameCallback` to
 * fire reliably on some browsers.
 */
export async function analyzeVideoSrc(
  src: string,
  opts: AnalyzeVideoOptions = {}
): Promise<AnalysisResult> {
  const playbackRate = opts.playbackRate ?? 2;

  const video = document.createElement("video") as VideoWithRvfc;
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "-10000px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  const samples: FrameSample[] = [];
  let detector = await createMediaPipeDetector();
  let rvfcId: number | null = null;
  let lastTs = -1;
  let stopped = false;

  // Wait until metadata is ready so we have duration/dimensions.
  await new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener(
      "error",
      () => reject(new Error("Could not load video for analysis.")),
      { once: true }
    );
  });

  function cleanup() {
    stopped = true;
    if (rvfcId != null && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(rvfcId);
    }
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.removeAttribute("src");
    video.load();
    video.remove();
    detector.dispose();
  }

  return new Promise<AnalysisResult>((resolve, reject) => {
    async function onFrame(_now: number, metadata: RvfcMeta) {
      if (stopped) return;
      try {
        const tMs = Math.max(lastTs + 1, Math.round(metadata.mediaTime * 1000));
        lastTs = tMs;
        const pose = await detector.detect(video, tMs);
        if (pose) {
          const sample = sampleFromPose(pose, metadata.mediaTime);
          if (sample) samples.push(sample);
        }
        if (opts.onProgress && video.duration > 0) {
          opts.onProgress(Math.min(1, metadata.mediaTime / video.duration));
        }
      } catch (e) {
        // Drop the frame on detector hiccups (HEVC seeks etc.) — keep going.
        // eslint-disable-next-line no-console
        console.warn("analyzeVideoSrc frame error", e);
      }
      if (!stopped && video.requestVideoFrameCallback) {
        rvfcId = video.requestVideoFrameCallback(onFrame);
      }
    }

    function onEnded() {
      if (stopped) return;
      try {
        const result = analyze(samples, video.duration || 0);
        if (opts.onProgress) opts.onProgress(1);
        cleanup();
        resolve(result);
      } catch (e) {
        cleanup();
        reject(e);
      }
    }

    function onError() {
      cleanup();
      reject(new Error("Video error during analysis."));
    }

    video.addEventListener("ended", onEnded, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.playbackRate = playbackRate;
    video.currentTime = 0;

    if (video.requestVideoFrameCallback) {
      rvfcId = video.requestVideoFrameCallback(onFrame);
    } else {
      // rAF fallback for older browsers.
      const tick = async () => {
        if (stopped || video.ended) return;
        await onFrame(performance.now(), {
          mediaTime: video.currentTime,
          expectedDisplayTime: performance.now(),
        });
        if (!stopped) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    video.play().catch((e) => {
      cleanup();
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}
