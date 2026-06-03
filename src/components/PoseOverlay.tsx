"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Pose, PoseDetector } from "@/lib/pose/types";
import { drawPose, syncCanvasToVideo } from "@/lib/pose/draw";
import { createMediaPipeDetector } from "@/lib/pose/mediapipe";
import { createPoseSmoother } from "@/lib/pose/smooth";

export type DetectorFactory = () => Promise<PoseDetector>;

type Status =
  | { kind: "loading-model" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export interface PoseOverlayProps {
  src: string;
  factory?: DetectorFactory;
  color?: string;
  label?: string | null;
  controls?: boolean;
  className?: string;
  /**
   * Called once per detected video frame with the *raw* (unsmoothed) pose
   * and the media timestamp in seconds. Used by analysis consumers to
   * accumulate landmarks.
   */
  onPose?: (pose: Pose | null, tSec: number) => void;
  /**
   * Optional ref the parent reads the inner <video> element from. Passed
   * as a regular prop (not via forwardRef) so it survives next/dynamic
   * wrapping — dynamic() with ssr:false strips refs from forwardRef components.
   */
  videoElementRef?: RefObject<HTMLVideoElement>;
  /**
   * Optional playback window. When both set:
   *  - Seeks to clipStart once metadata is available.
   *  - Pauses + clamps to clipEnd when the video's currentTime crosses it.
   * Native scrubber still spans the full file; we don't fight manual scrubs.
   */
  clipStart?: number;
  clipEnd?: number;
}

export default function PoseOverlay({
  src,
  factory = createMediaPipeDetector,
  color = "#22d3ee",
  label = "MediaPipe Pose",
  controls = true,
  className,
  onPose,
  videoElementRef,
  clipStart,
  clipEnd,
}: PoseOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<PoseDetector | null>(null);
  const lastTimestampRef = useRef<number>(-1);
  const inferMsRef = useRef<number>(0);
  const rvfcIdRef = useRef<number | null>(null);

  const onPoseRef = useRef(onPose);
  useEffect(() => {
    onPoseRef.current = onPose;
  }, [onPose]);

  // Hold clip bounds in refs so the detection loop reads the latest values
  // without remounting (which would tear down the detector).
  const clipStartRef = useRef(clipStart);
  const clipEndRef = useRef(clipEnd);
  useEffect(() => {
    clipStartRef.current = clipStart;
    clipEndRef.current = clipEnd;
  }, [clipStart, clipEnd]);

  // Mirror the element into both the internal ref and (if provided) the parent's.
  const setVideoEl = (el: HTMLVideoElement | null) => {
    (videoRef as { current: HTMLVideoElement | null }).current = el;
    if (videoElementRef) {
      (videoElementRef as { current: HTMLVideoElement | null }).current = el;
    }
  };

  const [status, setStatus] = useState<Status>({ kind: "loading-model" });
  const [inferMs, setInferMs] = useState<number>(0);
  const [hasPose, setHasPose] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading-model" });
    factory()
      .then((d) => {
        if (cancelled) {
          d.dispose();
          return;
        }
        detectorRef.current = d;
        setStatus({ kind: "ready" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setStatus({ kind: "error", message: msg });
      });
    return () => {
      cancelled = true;
      const d = detectorRef.current;
      detectorRef.current = null;
      d?.dispose();
    };
  }, [factory]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const smoother = createPoseSmoother();
    const uiInterval = window.setInterval(
      () => setInferMs(inferMsRef.current),
      250
    );

    let stopped = false;

    type RvfcMeta = { mediaTime: number; expectedDisplayTime: number };
    type VideoWithRvfc = HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, metadata: RvfcMeta) => void
      ) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    const v = video as VideoWithRvfc;

    async function onFrame(_now: number, metadata: RvfcMeta) {
      if (stopped) return;
      const detector = detectorRef.current;
      if (detector && video && ctx && canvas) {
        if (syncCanvasToVideo(canvas, video)) {
          const tMs = Math.max(
            lastTimestampRef.current + 1,
            Math.round(metadata.mediaTime * 1000)
          );
          lastTimestampRef.current = tMs;
          const t0 = performance.now();
          try {
            const raw = await detector.detect(video, tMs);
            const pose = smoother.smooth(raw, tMs / 1000);
            inferMsRef.current = performance.now() - t0;
            setHasPose(!!raw);
            drawPose(ctx, pose, { color });
            onPoseRef.current?.(raw, metadata.mediaTime);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn("PoseOverlay frame error", e);
          }
        }
      }
      // Clip-end clamp: pause playback once we cross the end-of-clip mark.
      // Doesn't fight manual scrubs — only acts during forward playback.
      const clipEndNow = clipEndRef.current;
      if (
        clipEndNow != null &&
        video &&
        !video.paused &&
        video.currentTime >= clipEndNow
      ) {
        video.pause();
      }
      if (v.requestVideoFrameCallback) {
        rvfcIdRef.current = v.requestVideoFrameCallback(onFrame);
      }
    }

    let started = false;
    function startLoop() {
      if (started) return;
      started = true;
      if (v.requestVideoFrameCallback) {
        rvfcIdRef.current = v.requestVideoFrameCallback(onFrame);
      } else {
        const tick = async () => {
          if (stopped) return;
          await onFrame(performance.now(), {
            mediaTime: v.currentTime,
            expectedDisplayTime: performance.now(),
          });
          if (!stopped) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }

    function resetTimestamp() {
      lastTimestampRef.current = -1;
      smoother.reset();
    }

    // Seek to clipStart once metadata is in so the timeline opens on the
    // first rep instead of the start of the file. One-shot — manual scrubs
    // afterward are honored.
    function applyClipStart() {
      const s = clipStartRef.current;
      if (s != null && s > 0 && v.duration > 0) {
        const safe = Math.min(Math.max(0, s), v.duration);
        if (Math.abs(v.currentTime - safe) > 0.05) {
          v.currentTime = safe;
        }
      }
    }

    video.addEventListener("loadedmetadata", startLoop);
    video.addEventListener("loadedmetadata", applyClipStart);
    video.addEventListener("seeking", resetTimestamp);
    if (video.readyState >= 1) {
      startLoop();
      applyClipStart();
    }

    return () => {
      stopped = true;
      window.clearInterval(uiInterval);
      video.removeEventListener("loadedmetadata", startLoop);
      video.removeEventListener("loadedmetadata", applyClipStart);
      video.removeEventListener("seeking", resetTimestamp);
      if (rvfcIdRef.current != null && v.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(rvfcIdRef.current);
      }
      rvfcIdRef.current = null;
    };
  }, [src, color]);

  return (
    <div
      className={`rounded-2xl border border-border bg-surface overflow-hidden ${className ?? ""}`}
    >
      {label !== null && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-sm font-medium truncate">{label}</span>
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-3 flex-shrink-0">
            {status.kind === "loading-model" && <span>loading model…</span>}
            {status.kind === "ready" && (
              <>
                <span>{inferMs.toFixed(0)} ms/frame</span>
                <span className={hasPose ? "text-green-400" : "text-gray-600"}>
                  {hasPose ? "● detected" : "○ no pose"}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="relative bg-black">
        <video
          ref={setVideoEl}
          src={src}
          controls={controls}
          playsInline
          muted
          crossOrigin="anonymous"
          className="block w-full h-auto"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        {status.kind === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-red-300 px-6 text-center">
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}
