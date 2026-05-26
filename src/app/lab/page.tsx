import dynamic from "next/dynamic";

// Client-only: TFJS + MediaPipe both need window/WebGL.
const LabClient = dynamic(() => import("./LabClient"), { ssr: false });

export const metadata = {
  title: "Pose Lab — RepPolice",
};

export default function LabPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Pose lab</h1>
        <p className="text-sm text-gray-400">
          Compare MediaPipe Pose vs MoveNet on the same video. Pick a local
          file; both detectors run live on synchronized playback. Public, local
          only — nothing is uploaded.
        </p>
      </header>
      <LabClient />
    </div>
  );
}
