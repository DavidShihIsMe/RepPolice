import dynamic from "next/dynamic";

const BatchClient = dynamic(() => import("./BatchClient"), { ssr: false });

export const metadata = {
  title: "Batch trainer — RepPolice",
};

export default function BatchTrainerPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          Batch trainer
        </h1>
        <p className="text-sm text-gray-400">
          Drop a folder&apos;s worth of squat clips. Each one runs through
          the analyzer; we collect per-rep numbers and aggregate stats so you
          can calibrate the thresholds in <code className="text-accent">reps.ts</code> against real data.
          All local — nothing uploads.
        </p>
      </header>
      <BatchClient />
    </div>
  );
}
