import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Submission, SubmissionStatus } from "@/lib/types";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const styles: Record<SubmissionStatus, string> = {
    uploaded: "bg-gray-500/15 text-gray-300 border-gray-500/30",
    analyzing: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    done: "bg-green-500/15 text-green-300 border-green-500/30",
    failed: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default async function SubmissionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/submissions");

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false });

  const submissions = (data ?? []) as Submission[];

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">My submissions</h1>
          <p className="text-sm text-gray-400">
            {submissions.length === 0
              ? "Nothing here yet."
              : `${submissions.length} ${submissions.length === 1 ? "video" : "videos"}.`}
          </p>
        </div>
        <Link
          href="/submit"
          className="px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors"
        >
          + Submit
        </Link>
      </div>

      {error && (
        <div className="text-sm rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-300 mb-6">
          Failed to load submissions: {error.message}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm text-gray-400 mb-4">
            Upload your first squat video to get started.
          </p>
          <Link
            href="/submit"
            className="inline-flex px-4 py-2 bg-accent text-black text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors"
          >
            Submit a video
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
          {submissions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/submissions/${s.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-light transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">
                      {s.original_filename || s.id}
                    </p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatDate(s.created_at)} · {formatBytes(s.file_size_bytes)}
                  </p>
                </div>
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-500 flex-shrink-0">
                  <path d="M6 3 L11 8 L6 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
