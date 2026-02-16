"use client";

import { AnalysisProvider } from "@/lib/analysisStore";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AnalysisProvider>{children}</AnalysisProvider>;
}
