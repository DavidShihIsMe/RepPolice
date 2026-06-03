import Link from "next/link";
import dynamic from "next/dynamic";

// Client-only: MediaPipe needs window/WebGL.
const LabClient = dynamic(() => import("./LabClient"), { ssr: false });

export const metadata = {
  title: "Pose Lab — RepPolice",
};

export default function LabPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pose lab</h1>
          <Link
            href="/lab/batch"
            className="text-xs px-3 py-1.5 bg-surface-light border border-border rounded-lg hover:border-accent/40"
          >
            Batch trainer →
          </Link>
        </div>
        <p className="text-sm text-gray-400">
          Drop a single video to see MediaPipe skeleton overlay in real-time.
          For corpus calibration, use the batch trainer.
        </p>
      </header>
      <LabClient />
    </div>
  );
}
