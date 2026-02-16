"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { PoseFrame, RepData, MetricRating } from "@/lib/types";
import { POSE_LANDMARKS } from "@/lib/types";

// ─── Skeleton topology ───────────────────────────────────────────────────────

type SegmentGroup = "torso" | "leftLeg" | "rightLeg" | "leftArm" | "rightArm" | "head";

interface Connection {
  from: number;
  to: number;
  group: SegmentGroup;
}

const CONNECTIONS: Connection[] = [
  // Head / neck
  { from: POSE_LANDMARKS.NOSE, to: POSE_LANDMARKS.LEFT_SHOULDER, group: "head" },
  { from: POSE_LANDMARKS.NOSE, to: POSE_LANDMARKS.RIGHT_SHOULDER, group: "head" },
  // Torso
  { from: POSE_LANDMARKS.LEFT_SHOULDER, to: POSE_LANDMARKS.RIGHT_SHOULDER, group: "torso" },
  { from: POSE_LANDMARKS.LEFT_SHOULDER, to: POSE_LANDMARKS.LEFT_HIP, group: "torso" },
  { from: POSE_LANDMARKS.RIGHT_SHOULDER, to: POSE_LANDMARKS.RIGHT_HIP, group: "torso" },
  { from: POSE_LANDMARKS.LEFT_HIP, to: POSE_LANDMARKS.RIGHT_HIP, group: "torso" },
  // Left arm
  { from: POSE_LANDMARKS.LEFT_SHOULDER, to: POSE_LANDMARKS.LEFT_ELBOW, group: "leftArm" },
  { from: POSE_LANDMARKS.LEFT_ELBOW, to: POSE_LANDMARKS.LEFT_WRIST, group: "leftArm" },
  // Right arm
  { from: POSE_LANDMARKS.RIGHT_SHOULDER, to: POSE_LANDMARKS.RIGHT_ELBOW, group: "rightArm" },
  { from: POSE_LANDMARKS.RIGHT_ELBOW, to: POSE_LANDMARKS.RIGHT_WRIST, group: "rightArm" },
  // Left leg
  { from: POSE_LANDMARKS.LEFT_HIP, to: POSE_LANDMARKS.LEFT_KNEE, group: "leftLeg" },
  { from: POSE_LANDMARKS.LEFT_KNEE, to: POSE_LANDMARKS.LEFT_ANKLE, group: "leftLeg" },
  { from: POSE_LANDMARKS.LEFT_ANKLE, to: POSE_LANDMARKS.LEFT_HEEL, group: "leftLeg" },
  { from: POSE_LANDMARKS.LEFT_ANKLE, to: POSE_LANDMARKS.LEFT_FOOT_INDEX, group: "leftLeg" },
  // Right leg
  { from: POSE_LANDMARKS.RIGHT_HIP, to: POSE_LANDMARKS.RIGHT_KNEE, group: "rightLeg" },
  { from: POSE_LANDMARKS.RIGHT_KNEE, to: POSE_LANDMARKS.RIGHT_ANKLE, group: "rightLeg" },
  { from: POSE_LANDMARKS.RIGHT_ANKLE, to: POSE_LANDMARKS.RIGHT_HEEL, group: "rightLeg" },
  { from: POSE_LANDMARKS.RIGHT_ANKLE, to: POSE_LANDMARKS.RIGHT_FOOT_INDEX, group: "rightLeg" },
];

const JOINT_INDICES = [
  POSE_LANDMARKS.NOSE,
  POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER,
  POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.RIGHT_ELBOW,
  POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.RIGHT_WRIST,
  POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP,
  POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.RIGHT_KNEE,
  POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.RIGHT_ANKLE,
];

// ─── Neon colors ─────────────────────────────────────────────────────────────

const NEON = {
  green: { stroke: "rgba(74, 222, 128, 0.85)", glow: "#4ade80", joint: "rgba(74, 222, 128, 0.95)" },
  yellow: { stroke: "rgba(250, 204, 21, 0.85)", glow: "#facc15", joint: "rgba(250, 204, 21, 0.95)" },
  red: { stroke: "rgba(248, 113, 113, 0.85)", glow: "#f87171", joint: "rgba(248, 113, 113, 0.95)" },
  neutral: { stroke: "rgba(107, 114, 128, 0.35)", glow: "#374151", joint: "rgba(107, 114, 128, 0.4)" },
} as const;

// ─── Per-frame analysis helpers ──────────────────────────────────────────────

interface IssueTag {
  label: string;
  segments: SegmentGroup[];
  rating: MetricRating;
}

interface FrameAnnotation {
  overall: MetricRating;
  segmentOverrides: Partial<Record<SegmentGroup, MetricRating>>;
  repNumber: number | null;
  feedback: string;
  issues: IssueTag[];
}

function buildFrameAnnotations(
  frames: PoseFrame[],
  reps: RepData[]
): FrameAnnotation[] {
  // Build issue-frame sets per metric per rep
  const kneeIssues = new Set<number>();
  const backIssues = new Set<number>();
  const barIssues = new Set<number>();
  const depthIssues = new Set<number>();
  const symIssues = new Set<number>();
  const buttWinkIssues = new Set<number>();
  const tempoIssues = new Set<number>();
  const heelRiseIssues = new Set<number>();
  const stanceWidthIssues = new Set<number>();
  const hipShiftIssues = new Set<number>();
  const kneeValgusIssues = new Set<number>();
  const kneeTravelIssues = new Set<number>();
  const depthConsistencyIssues = new Set<number>();
  const thoracicRoundingIssues = new Set<number>();
  const hipRiseRateIssues = new Set<number>();
  const reversalControlIssues = new Set<number>();
  const stanceWidthShiftIssues = new Set<number>();
  const headPositionIssues = new Set<number>();

  // Map frameIdx → repData
  const frameToRep = new Map<number, RepData>();

  for (const rep of reps) {
    for (let i = rep.startFrame; i <= rep.endFrame && i < frames.length; i++) {
      frameToRep.set(i, rep);
    }
    for (const fi of rep.kneeTracking.issueFrames) kneeIssues.add(fi);
    for (const fi of rep.backAngle.issueFrames) backIssues.add(fi);
    for (const fi of rep.barPath.issueFrames) barIssues.add(fi);
    for (const fi of rep.depth.issueFrames) depthIssues.add(fi);
    for (const fi of rep.symmetry.issueFrames) symIssues.add(fi);
    for (const fi of rep.buttWink.issueFrames) buttWinkIssues.add(fi);
    for (const fi of rep.tempo.issueFrames) tempoIssues.add(fi);
    for (const fi of rep.heelRise.issueFrames) heelRiseIssues.add(fi);
    for (const fi of rep.stanceWidth.issueFrames) stanceWidthIssues.add(fi);
    for (const fi of rep.hipShift.issueFrames) hipShiftIssues.add(fi);
    for (const fi of rep.kneeValgus.issueFrames) kneeValgusIssues.add(fi);
    for (const fi of rep.kneeTravel.issueFrames) kneeTravelIssues.add(fi);
    for (const fi of rep.depthConsistency.issueFrames) depthConsistencyIssues.add(fi);
    for (const fi of rep.thoracicRounding.issueFrames) thoracicRoundingIssues.add(fi);
    for (const fi of rep.hipRiseRate.issueFrames) hipRiseRateIssues.add(fi);
    for (const fi of rep.reversalControl.issueFrames) reversalControlIssues.add(fi);
    for (const fi of rep.stanceWidthShift.issueFrames) stanceWidthShiftIssues.add(fi);
    for (const fi of rep.headPosition.issueFrames) headPositionIssues.add(fi);
  }

  return frames.map((_, idx) => {
    const rep = frameToRep.get(idx) ?? null;
    const segmentOverrides: Partial<Record<SegmentGroup, MetricRating>> = {};
    const issues: string[] = [];
    const issueTags: IssueTag[] = [];

    const hasKnee = kneeIssues.has(idx);
    const hasBack = backIssues.has(idx);
    const hasBar = barIssues.has(idx);
    const hasDepth = depthIssues.has(idx);
    const hasSym = symIssues.has(idx);
    const hasButtWink = buttWinkIssues.has(idx);
    const hasTempo = tempoIssues.has(idx);
    const hasHeelRise = heelRiseIssues.has(idx);
    const hasStanceWidth = stanceWidthIssues.has(idx);
    const hasHipShift = hipShiftIssues.has(idx);
    const hasKneeValgus = kneeValgusIssues.has(idx);
    const hasKneeTravel = kneeTravelIssues.has(idx);
    const hasDepthConsistency = depthConsistencyIssues.has(idx);
    const hasThoracicRounding = thoracicRoundingIssues.has(idx);
    const hasHipRiseRate = hipRiseRateIssues.has(idx);
    const hasReversalControl = reversalControlIssues.has(idx);
    const hasStanceWidthShift = stanceWidthShiftIssues.has(idx);
    const hasHeadPosition = headPositionIssues.has(idx);

    if (hasKnee) {
      const r = rep?.kneeTracking.rating ?? "yellow";
      segmentOverrides.leftLeg = r;
      segmentOverrides.rightLeg = r;
      issues.push("Knee cave");
      issueTags.push({ label: "Knee cave", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasBack) {
      const r = rep?.backAngle.rating ?? "yellow";
      segmentOverrides.torso = r;
      segmentOverrides.head = r;
      issues.push("Forward lean");
      issueTags.push({ label: "Forward lean", segments: ["torso", "head"], rating: r });
    }
    if (hasBar) {
      const r = rep?.barPath.rating ?? "yellow";
      segmentOverrides.leftArm = r;
      segmentOverrides.rightArm = r;
      issues.push("Bar drift");
      issueTags.push({ label: "Bar drift", segments: ["leftArm", "rightArm"], rating: r });
    }
    if (hasDepth) {
      const r = rep?.depth.rating ?? "yellow";
      segmentOverrides.leftLeg = segmentOverrides.leftLeg ?? r;
      segmentOverrides.rightLeg = segmentOverrides.rightLeg ?? r;
      issues.push("Shallow depth");
      issueTags.push({ label: "Shallow depth", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasSym) {
      const r = rep?.symmetry.rating ?? "yellow";
      issues.push("Asymmetric");
      issueTags.push({ label: "Asymmetric", segments: [], rating: r });
    }
    if (hasButtWink) {
      const r = rep?.buttWink.rating ?? "yellow";
      segmentOverrides.torso = segmentOverrides.torso ?? r;
      issues.push("Butt wink");
      issueTags.push({ label: "Butt wink", segments: ["torso"], rating: r });
    }
    if (hasTempo) {
      const r = rep?.tempo.rating ?? "yellow";
      issues.push("Tempo");
      issueTags.push({ label: "Tempo", segments: [], rating: r });
    }
    if (hasHeelRise) {
      const r = rep?.heelRise.rating ?? "yellow";
      segmentOverrides.leftLeg = segmentOverrides.leftLeg ?? r;
      segmentOverrides.rightLeg = segmentOverrides.rightLeg ?? r;
      issues.push("Heel rise");
      issueTags.push({ label: "Heel rise", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasStanceWidth) {
      const r = rep?.stanceWidth.rating ?? "yellow";
      segmentOverrides.leftLeg = segmentOverrides.leftLeg ?? r;
      segmentOverrides.rightLeg = segmentOverrides.rightLeg ?? r;
      issues.push("Stance width");
      issueTags.push({ label: "Stance width", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasHipShift) {
      const r = rep?.hipShift.rating ?? "yellow";
      segmentOverrides.torso = segmentOverrides.torso ?? r;
      issues.push("Hip shift");
      issueTags.push({ label: "Hip shift", segments: ["torso"], rating: r });
    }
    if (hasKneeValgus) {
      const r = rep?.kneeValgus.rating ?? "yellow";
      segmentOverrides.leftLeg = segmentOverrides.leftLeg ?? r;
      segmentOverrides.rightLeg = segmentOverrides.rightLeg ?? r;
      issues.push("Knee valgus");
      issueTags.push({ label: "Knee valgus", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasKneeTravel) {
      const r = rep?.kneeTravel.rating ?? "yellow";
      segmentOverrides.leftLeg = segmentOverrides.leftLeg ?? r;
      segmentOverrides.rightLeg = segmentOverrides.rightLeg ?? r;
      issues.push("Knee travel");
      issueTags.push({ label: "Knee travel", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasDepthConsistency) {
      const r = rep?.depthConsistency.rating ?? "yellow";
      issues.push("Depth inconsistent");
      issueTags.push({ label: "Depth inconsistent", segments: [], rating: r });
    }
    if (hasThoracicRounding) {
      const r = rep?.thoracicRounding.rating ?? "yellow";
      segmentOverrides.torso = segmentOverrides.torso ?? r;
      issues.push("T-spine rounding");
      issueTags.push({ label: "T-spine rounding", segments: ["torso"], rating: r });
    }
    if (hasHipRiseRate) {
      const r = rep?.hipRiseRate.rating ?? "yellow";
      segmentOverrides.torso = segmentOverrides.torso ?? r;
      issues.push("Good-morning");
      issueTags.push({ label: "Good-morning", segments: ["torso"], rating: r });
    }
    if (hasReversalControl) {
      const r = rep?.reversalControl.rating ?? "yellow";
      issues.push("Hard bounce");
      issueTags.push({ label: "Hard bounce", segments: [], rating: r });
    }
    if (hasStanceWidthShift) {
      const r = rep?.stanceWidthShift.rating ?? "yellow";
      segmentOverrides.leftLeg = segmentOverrides.leftLeg ?? r;
      segmentOverrides.rightLeg = segmentOverrides.rightLeg ?? r;
      issues.push("Stance shift");
      issueTags.push({ label: "Stance shift", segments: ["leftLeg", "rightLeg"], rating: r });
    }
    if (hasHeadPosition) {
      const r = rep?.headPosition.rating ?? "yellow";
      segmentOverrides.head = segmentOverrides.head ?? r;
      issues.push("Head position");
      issueTags.push({ label: "Head position", segments: ["head"], rating: r });
    }

    let overall: MetricRating = "green";
    const allOverrides = Object.values(segmentOverrides) as MetricRating[];
    if (allOverrides.includes("red") || hasSym && rep?.symmetry.rating === "red") overall = "red";
    else if (allOverrides.includes("yellow") || hasSym && rep?.symmetry.rating === "yellow") overall = "yellow";

    let feedback = "Good form";
    if (issues.length > 0) feedback = issues.join(" · ");
    if (!rep) {
      overall = "green"; // between reps — neutral
      feedback = "";
    }

    return {
      overall,
      segmentOverrides,
      repNumber: rep?.repNumber ?? null,
      feedback,
      issues: issueTags,
    };
  });
}

function findNearestFrameIdx(frames: PoseFrame[], time: number): number {
  if (frames.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(frames[0].timestamp - time);
  for (let i = 1; i < frames.length; i++) {
    const dist = Math.abs(frames[i].timestamp - time);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    } else {
      break; // timestamps are sorted, once we pass minimum, stop
    }
  }
  return best;
}

// ─── Canvas drawing ──────────────────────────────────────────────────────────

function getVideoDisplayRect(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
) {
  // Use CSS pixel dimensions (not physical) since ctx.setTransform(dpr) handles scaling
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const vw = video.videoWidth || cw;
  const vh = video.videoHeight || ch;
  const containerAspect = cw / ch;
  const videoAspect = vw / vh;

  let dw: number, dh: number, ox: number, oy: number;
  if (videoAspect > containerAspect) {
    dw = cw;
    dh = cw / videoAspect;
    ox = 0;
    oy = (ch - dh) / 2;
  } else {
    dh = ch;
    dw = ch * videoAspect;
    ox = (cw - dw) / 2;
    oy = 0;
  }
  return { dw, dh, ox, oy };
}

function drawSkeletonFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: PoseFrame,
  annotation: FrameAnnotation,
  highlightedSegments: Set<SegmentGroup> | null
) {
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const { dw, dh, ox, oy } = getVideoDisplayRect(video, canvas);

  function toCanvas(lmIdx: number): { x: number; y: number; vis: number } | null {
    const lm = frame.landmarks[lmIdx];
    if (!lm || lm.visibility < 0.15) return null;
    return { x: ox + lm.x * dw, y: oy + lm.y * dh, vis: lm.visibility };
  }

  function getNeon(group: SegmentGroup) {
    const override = annotation.segmentOverrides[group];
    if (override) return NEON[override];
    if (!annotation.repNumber) return NEON.neutral;
    return NEON[annotation.overall] || NEON.green;
  }

  // Hover highlight helper: returns alpha multiplier for a segment group
  function getSegmentAlpha(group: SegmentGroup): number {
    if (!highlightedSegments) return 1; // no hover active
    if (highlightedSegments.size === 0) return 1; // empty set = highlight all
    return highlightedSegments.has(group) ? 1 : 0.15;
  }

  // Draw connections
  for (const conn of CONNECTIONS) {
    const a = toCanvas(conn.from);
    const b = toCanvas(conn.to);
    if (!a || !b) continue;

    const neon = getNeon(conn.group);
    const alpha = Math.min(a.vis, b.vis);
    const segAlpha = getSegmentAlpha(conn.group);
    const isHighlighted = highlightedSegments !== null && highlightedSegments.size > 0 && highlightedSegments.has(conn.group);

    ctx.save();
    ctx.globalAlpha = alpha * segAlpha;
    ctx.strokeStyle = neon.stroke;
    ctx.lineWidth = conn.group === "head" || conn.group === "leftArm" || conn.group === "rightArm" ? 2.5 : 3.5;
    if (isHighlighted) ctx.lineWidth *= 1.4;
    ctx.lineCap = "round";
    ctx.shadowBlur = isHighlighted ? 24 : 16;
    ctx.shadowColor = neon.glow;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Double-draw for stronger glow
    ctx.shadowBlur = isHighlighted ? 12 : 8;
    ctx.lineWidth = ctx.lineWidth * 0.6;
    ctx.globalAlpha = alpha * segAlpha * 0.5;
    ctx.stroke();

    ctx.restore();
  }

  // Draw joint dots
  for (const idx of JOINT_INDICES) {
    const pt = toCanvas(idx);
    if (!pt) continue;

    // Determine which group this joint belongs to for coloring
    let group: SegmentGroup = "torso";
    if (idx === POSE_LANDMARKS.NOSE) group = "head";
    else if (idx === POSE_LANDMARKS.LEFT_ELBOW || idx === POSE_LANDMARKS.LEFT_WRIST) group = "leftArm";
    else if (idx === POSE_LANDMARKS.RIGHT_ELBOW || idx === POSE_LANDMARKS.RIGHT_WRIST) group = "rightArm";
    else if (idx === POSE_LANDMARKS.LEFT_HIP || idx === POSE_LANDMARKS.LEFT_KNEE || idx === POSE_LANDMARKS.LEFT_ANKLE) group = "leftLeg";
    else if (idx === POSE_LANDMARKS.RIGHT_HIP || idx === POSE_LANDMARKS.RIGHT_KNEE || idx === POSE_LANDMARKS.RIGHT_ANKLE) group = "rightLeg";

    const neon = getNeon(group);
    const segAlpha = getSegmentAlpha(group);
    const isHighlighted = highlightedSegments !== null && highlightedSegments.size > 0 && highlightedSegments.has(group);

    ctx.save();
    ctx.globalAlpha = pt.vis * segAlpha;
    ctx.shadowBlur = isHighlighted ? 28 : 20;
    ctx.shadowColor = neon.glow;
    ctx.fillStyle = neon.joint;

    const radius = idx === POSE_LANDMARKS.NOSE ? 6 : 4.5;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isHighlighted ? radius * 1.3 : radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ─── Timeline segment colors ─────────────────────────────────────────────────

function ratingHex(r: MetricRating): string {
  if (r === "green") return "#4ade80";
  if (r === "yellow") return "#facc15";
  return "#f87171";
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </svg>
  );
}

function StepBackIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M12.5 3.5L5.5 10l7 6.5V3.5zM4 4v12h1.5V4H4z" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M7.5 3.5L14.5 10l-7 6.5V3.5zM15 4v12h1.5V4H15z" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SkeletonReplayProps {
  videoUrl: string;
  frames: PoseFrame[];
  reps: RepData[];
  startTimestamp?: number;
  endTimestamp?: number;
}

export default function SkeletonReplay({ videoUrl, frames, reps, startTimestamp, endTimestamp }: SkeletonReplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  const hoveredSegmentsRef = useRef<Set<SegmentGroup> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [slowMotion, setSlowMotion] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Trimmed playback range
  const startTs = startTimestamp ?? 0;
  const endTs = endTimestamp ?? duration;
  const activeDuration = endTs > startTs ? endTs - startTs : duration;

  // Pre-compute annotations
  const annotations = useMemo(
    () => buildFrameAnnotations(frames, reps),
    [frames, reps]
  );

  // Analysis range: first rep start → last rep end (no buffer)
  const analysisStart = reps.length > 0 ? reps[0].startFrame : 0;
  const analysisEnd = reps.length > 0 ? reps[reps.length - 1].endFrame : frames.length - 1;
  const analysisLength = analysisEnd - analysisStart + 1;

  // Pre-compute timeline segments — only the analysis range
  const timelineColors = useMemo(() => {
    if (frames.length === 0 || analysisLength <= 0) return [];
    const colors: string[] = [];
    for (let i = analysisStart; i <= analysisEnd; i++) {
      const a = annotations[i];
      if (a?.repNumber) {
        colors.push(ratingHex(a.overall));
      } else {
        // Between-rep frames get a dim neutral color
        colors.push("#1f2937");
      }
    }
    return colors;
  }, [annotations, frames.length, analysisStart, analysisEnd, analysisLength]);

  // ── Resize canvas to match container ──
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Video metadata ──
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      if (startTimestamp !== undefined && startTimestamp > 0) {
        videoRef.current.currentTime = startTimestamp;
      }
    }
  }, [startTimestamp]);

  // ── Compute playhead progress % directly (no React state needed) ──
  const computeProgressPct = useCallback((time: number, idx: number) => {
    if (analysisLength <= 1) return 0;
    const frameTime = frames[idx]?.timestamp ?? 0;
    let interp = 0;
    if (idx < frames.length - 1 && time >= frameTime) {
      const nextTime = frames[idx + 1].timestamp;
      const dt = nextTime - frameTime;
      if (dt > 0) interp = Math.min(1, (time - frameTime) / dt);
    } else if (idx > 0 && time < frameTime) {
      const prevTime = frames[idx - 1].timestamp;
      const dt = frameTime - prevTime;
      if (dt > 0) interp = -(Math.min(1, (frameTime - time) / dt));
    }
    const posInRange = idx + interp - analysisStart;
    return Math.max(0, Math.min(100, (posInRange / analysisLength) * 100));
  }, [frames, analysisStart, analysisLength]);

  // ── Animation loop ──
  useEffect(() => {
    function animate() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      const time = video.currentTime;
      setCurrentTime(time);

      // Pause at end of trimmed range
      if (endTs > 0 && !video.paused && time >= endTs) {
        video.pause();
        setPlaying(false);
      }

      const idx = findNearestFrameIdx(frames, time);
      setCurrentFrameIdx(idx);

      // Update playhead directly in the DOM for real-time accuracy
      if (playheadRef.current) {
        playheadRef.current.style.left = `${computeProgressPct(time, idx)}%`;
      }

      if (showSkeleton && frames[idx]) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Use CSS pixel dimensions for drawing
          drawSkeletonFrame(ctx, canvas, video, frames[idx], annotations[idx], hoveredSegmentsRef.current);
        }
      } else {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      }

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [frames, annotations, showSkeleton, endTs, computeProgressPct]);

  // ── Playback controls ──
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      // If outside trimmed range, seek to start
      if (video.currentTime < startTs || video.currentTime >= endTs) {
        video.currentTime = startTs;
      }
      video.play().then(() => {
        setPlaying(true);
      }).catch(() => {
        setPlaying(false);
      });
    } else {
      video.pause();
      setPlaying(false);
    }
  }, [startTs, endTs]);

  const toggleSlowMotion = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !slowMotion;
    video.playbackRate = next ? 0.5 : 1;
    setSlowMotion(next);
  }, [slowMotion]);

  const stepFrame = useCallback(
    (direction: -1 | 1) => {
      const video = videoRef.current;
      if (!video || frames.length === 0) return;
      video.pause();
      setPlaying(false);

      const nextIdx = Math.max(0, Math.min(frames.length - 1, currentFrameIdx + direction));
      video.currentTime = frames[nextIdx].timestamp;
    },
    [currentFrameIdx, frames]
  );

  // ── Timeline click ──
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || frames.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      // Map click position to analysis range
      const frameIdx = Math.min(analysisEnd, analysisStart + Math.floor(pct * analysisLength));
      video.currentTime = frames[frameIdx].timestamp;
    },
    [frames, analysisStart, analysisEnd, analysisLength]
  );

  const handleVideoEnded = useCallback(() => setPlaying(false), []);

  const handleTagEnter = useCallback((segments: SegmentGroup[]) => {
    hoveredSegmentsRef.current = new Set(segments);
  }, []);

  const handleTagLeave = useCallback(() => {
    hoveredSegmentsRef.current = null;
  }, []);

  // Current annotation
  const ann = annotations[currentFrameIdx] || { overall: "green" as MetricRating, feedback: "", repNumber: null, segmentOverrides: {}, issues: [] as IssueTag[] };

  // Compute initial progress for SSR / first render; real-time updates happen via ref in animation loop
  const progressPct = computeProgressPct(currentTime, currentFrameIdx);

  return (
    <div className="space-y-0">
      {/* ── Video + Canvas container ── */}
      <div
        ref={containerRef}
        className="relative rounded-t-2xl overflow-hidden bg-black aspect-video cursor-pointer group"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          muted
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleVideoEnded}
          className="w-full h-full object-contain"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Play/pause big overlay icon */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white opacity-80 group-hover:opacity-100 transition-opacity">
              <PlayIcon />
            </div>
          </div>
        )}

        {/* ── Score overlay panel (top-right) ── */}
        <div className="absolute top-3 right-3 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md rounded-xl px-3 py-2 min-w-[120px]">
            {ann.repNumber ? (
              <>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                  Rep {ann.repNumber}
                </p>
                {ann.issues.length > 0 ? (
                  <div
                    className="flex flex-wrap gap-1.5 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ann.issues.map((tag) => (
                      <div
                        key={tag.label}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 cursor-default transition-colors hover:bg-white/20"
                        onMouseEnter={() => handleTagEnter(tag.segments)}
                        onMouseLeave={handleTagLeave}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: ratingHex(tag.rating), boxShadow: `0 0 6px ${ratingHex(tag.rating)}` }}
                        />
                        <span className="text-[11px] font-medium text-white whitespace-nowrap">
                          {tag.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: ratingHex(ann.overall), boxShadow: `0 0 8px ${ratingHex(ann.overall)}` }}
                    />
                    <span className="text-xs font-medium text-white">Good form</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-600" />
                <span className="text-xs font-medium text-gray-500">
                  Not scoring
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Slow-mo badge */}
        {slowMotion && (
          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md rounded-full px-2.5 py-1 pointer-events-none">
            <span className="text-[10px] font-bold text-accent">0.5x</span>
          </div>
        )}
      </div>

      {/* ── Colored timeline bar ── */}
      <div
        className="relative h-3 bg-gray-900 cursor-pointer group/timeline"
        onClick={handleTimelineClick}
      >
        {/* Colored segments (analysis range only) */}
        <div className="absolute inset-0 flex">
          {timelineColors.map((color, i) => (
            <div
              key={i}
              className="h-full"
              style={{
                flex: 1,
                backgroundColor: color,
                opacity: 0.8,
              }}
            />
          ))}
        </div>

        {/* Playhead — positioned directly via ref in animation loop for real-time accuracy */}
        <div
          ref={playheadRef}
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
          style={{ left: `${progressPct}%` }}
        />

        {/* Hover expand */}
        <div className="absolute inset-x-0 -top-1 -bottom-1 opacity-0 group-hover/timeline:opacity-100 transition-opacity pointer-events-none" />
      </div>

      {/* ── Playback controls ── */}
      <div className="flex items-center justify-between bg-gray-900/80 backdrop-blur-sm rounded-b-2xl px-4 py-2.5">
        <div className="flex items-center gap-1">
          {/* Step back */}
          <button
            onClick={() => stepFrame(-1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Previous frame"
          >
            <StepBackIcon />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Step forward */}
          <button
            onClick={() => stepFrame(1)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Next frame"
          >
            <StepForwardIcon />
          </button>
        </div>

        {/* Timestamp */}
        <span className="text-xs font-mono text-gray-400">
          {formatTimestamp(Math.max(0, currentTime - (frames[analysisStart]?.timestamp ?? startTs)))} / {formatTimestamp(
            (frames[analysisEnd]?.timestamp ?? endTs) - (frames[analysisStart]?.timestamp ?? startTs)
          )}
        </span>

        {/* Right controls */}
        <div className="flex items-center gap-1.5">
          {/* Slow motion */}
          <button
            onClick={toggleSlowMotion}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              slowMotion
                ? "bg-accent/20 text-accent border border-accent/30"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Toggle slow motion"
          >
            0.5x
          </button>

          {/* Skeleton toggle */}
          <button
            onClick={() => setShowSkeleton((s) => !s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
              showSkeleton
                ? "bg-accent/20 text-accent border border-accent/30"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Toggle skeleton overlay"
          >
            <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
              <circle cx="10" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10" y1="6.5" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="5" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="10" y1="13" x2="6" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="10" y1="13" x2="14" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
