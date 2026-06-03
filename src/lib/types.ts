import type { AnalysisResult } from "./squat/types";

export type SubmissionStatus = "uploaded" | "analyzing" | "done" | "failed";

export interface Submission {
  id: string;
  user_id: string;
  storage_path: string;
  original_filename: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  status: SubmissionStatus;
  created_at: string;
  // Full AnalysisResult, populated at upload time when MediaPipe finds reps.
  // null when analysis was skipped or no reps were detected.
  analysis: AnalysisResult | null;
}
