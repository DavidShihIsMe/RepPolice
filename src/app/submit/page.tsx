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
      <p className="text-sm text-gray-400 mb-8">
        Upload a video of your squat. MP4, MOV, or WebM up to {maxMb} MB. Film
        from the side angle for best results.
      </p>
      <UploadForm userId={user.id} />
    </div>
  );
}
