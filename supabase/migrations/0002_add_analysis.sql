-- RepPolice v2 — auto-analysis at upload time.
-- Stores the full AnalysisResult JSON (reps[], view, bodyHeight, etc.) so
-- /submissions/[id] can render the report and clip playback without re-running
-- MediaPipe on every view.

alter table public.submissions
add column if not exists analysis jsonb;

-- Users can update their own rows. Needed so "Re-analyze" can rewrite the
-- analysis JSON in place. Same scope as the existing select/insert policies.
drop policy if exists "submissions_update_own" on public.submissions;
create policy "submissions_update_own"
  on public.submissions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
