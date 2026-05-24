import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VIDEOS_BUCKET } from "@/lib/constants";
import type { Submission } from "@/lib/types";

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function SubmissionDetail({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/submissions/${params.id}`);

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) notFound();
  const s = data as Submission;

  const { data: signed } = await supabase.storage
    .from(VIDEOS_BUCKET)
    .createSignedUrl(s.storage_path, 60 * 60); // 1 hour

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link
        href="/submissions"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path d="M10 3 L5 8 L10 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to submissions
      </Link>

      <h1 className="text-xl font-semibold tracking-tight mb-1 break-all">
        {s.original_filename || s.id}
      </h1>
      <p className="text-xs text-gray-500 mb-6">
        Submitted {new Date(s.created_at).toLocaleString()} · {formatBytes(s.file_size_bytes)}
      </p>

      {signed?.signedUrl ? (
        <video
          src={signed.signedUrl}
          controls
          playsInline
          className="w-full rounded-2xl border border-border bg-black aspect-video"
        />
      ) : (
        <div className="rounded-2xl border border-border bg-surface px-6 py-12 text-center text-sm text-gray-400">
          Could not load video.
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-3">Analysis</h2>
        <p className="text-sm text-gray-400">
          Form analysis is coming in the next phase. For now, your video is
          safely stored and ready for review.
        </p>
        <p className="text-xs text-gray-600 mt-3">
          Status: <span className="text-gray-400">{s.status}</span>
        </p>
      </div>
    </div>
  );
}
