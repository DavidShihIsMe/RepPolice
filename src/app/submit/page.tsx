import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "./UploadForm";
import { MAX_FILE_BYTES } from "@/lib/constants";

export default async function SubmitPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/submit");

  const maxMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Submit a video</h1>
      <p className="text-sm text-gray-400 mb-6">
        MP4, MOV, or WebM up to {maxMb} MB.
      </p>

      <ShootingGuide />

      <UploadForm userId={user.id} />
    </div>
  );
}

function ShootingGuide() {
  const items: { label: string; detail: string }[] = [
    {
      label: "Side view",
      detail: "Camera at hip height, perpendicular to the lifter. Depth and lean both need a sagittal angle.",
    },
    {
      label: "Full body in frame",
      detail: "Head to feet visible the entire time. Feet getting cropped is the #1 reason analysis fails.",
    },
    {
      label: "One or two reps",
      detail: "A single complete rep is enough. More is fine; we'll grade each one.",
    },
    {
      label: "Steady camera",
      detail: "Tripod or set the phone on something. Handheld panning throws off body-height normalization.",
    },
    {
      label: "Unobstructed silhouette",
      detail: "Avoid baggy hoodies that hide the hip crease, rack posts crossing the knee, or people walking through.",
    },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 mb-6">
      <h2 className="text-sm font-semibold mb-1">For best results</h2>
      <p className="text-xs text-gray-500 mb-4">
        The analyzer needs MediaPipe to confidently see shoulders, hips, knees, and ankles every frame.
      </p>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.label} className="flex gap-3">
            <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent/15 text-accent flex-shrink-0">
              <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
