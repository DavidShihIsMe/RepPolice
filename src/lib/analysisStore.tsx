"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { SquatAnalysisResult, PoseFrame } from "./types";

interface AnalysisData {
  result: SquatAnalysisResult;
  frames: PoseFrame[];
  videoUrl: string; // object URL for the video blob
  startTimestamp: number;
  endTimestamp: number;
}

interface AnalysisStore {
  data: AnalysisData | null;
  setAnalysis: (result: SquatAnalysisResult, frames: PoseFrame[], videoBlob: Blob, startTimestamp: number, endTimestamp: number) => void;
  clear: () => void;
}

const AnalysisContext = createContext<AnalysisStore | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AnalysisData | null>(null);

  const setAnalysis = useCallback((result: SquatAnalysisResult, frames: PoseFrame[], videoBlob: Blob, startTimestamp: number, endTimestamp: number) => {
    // Revoke previous URL if any
    if (data?.videoUrl) {
      URL.revokeObjectURL(data.videoUrl);
    }
    const url = URL.createObjectURL(videoBlob);
    setData({ result, frames, videoUrl: url, startTimestamp, endTimestamp });
  }, [data?.videoUrl]);

  const clear = useCallback(() => {
    if (data?.videoUrl) {
      URL.revokeObjectURL(data.videoUrl);
    }
    setData(null);
  }, [data?.videoUrl]);

  return (
    <AnalysisContext.Provider value={{ data, setAnalysis, clear }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisStore {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used within AnalysisProvider");
  return ctx;
}
