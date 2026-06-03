"use client";

import { useRef, useState } from "react";
import { analyzeVideoSrc } from "@/lib/squat/runner";
import type { AnalysisResult, Rep, View } from "@/lib/squat/types";

interface ClipResult {
  filename: string;
  sizeBytes: number;
  result: AnalysisResult | null;
  error: string | null;
}

type RunState =
  | { kind: "idle" }
  | { kind: "running"; currentIdx: number; currentName: string; pct: number }
  | { kind: "done" };

export default function BatchClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ClipResult[]>([]);
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFiles(fileList: FileList | null) {
    if (!fileList) return;
    const fs: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name)) {
        fs.push(f);
      }
    }
    setFiles(fs);
    setResults([]);
  }

  async function runAll() {
    if (files.length === 0) return;
    const out: ClipResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setState({ kind: "running", currentIdx: i, currentName: f.name, pct: 0 });
      const blobUrl = URL.createObjectURL(f);
      try {
        const result = await analyzeVideoSrc(blobUrl, {
          onProgress: (p) =>
            setState({
              kind: "running",
              currentIdx: i,
              currentName: f.name,
              pct: p * 100,
            }),
        });
        out.push({
          filename: f.name,
          sizeBytes: f.size,
          result,
          error: null,
        });
      } catch (e) {
        out.push({
          filename: f.name,
          sizeBytes: f.size,
          result: null,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      setResults([...out]);
    }
    setState({ kind: "done" });
  }

  function copyJSON() {
    const payload = serializeForExport(results);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }

  function reset() {
    setFiles([]);
    setResults([]);
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const isRunning = state.kind === "running";
  const totalReps = results.reduce(
    (acc, r) => acc + (r.result?.reps.length ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold mb-1">Corpus</h2>
            <p className="text-xs text-gray-500">
              Drop video files (Ctrl/Cmd-click to multi-select) or use the
              picker. Anything other than video/* is ignored.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isRunning}
              className="px-3 py-1.5 text-sm bg-surface-light border border-border rounded-lg hover:border-accent/40 disabled:opacity-50"
            >
              Choose files
            </button>
            <button
              type="button"
              onClick={runAll}
              disabled={files.length === 0 || isRunning}
              className="px-4 py-1.5 text-sm bg-accent text-black font-semibold rounded-lg hover:bg-accent-hover disabled:opacity-50"
            >
              {isRunning ? "Running…" : `Run ${files.length || ""}`.trim()}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isRunning}
              className="text-xs text-gray-400 hover:text-white disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />

        {files.length > 0 && (
          <div className="mt-4 text-xs text-gray-500">
            {files.length} file{files.length === 1 ? "" : "s"} queued —{" "}
            {formatBytes(files.reduce((a, f) => a + f.size, 0))} total
          </div>
        )}
      </div>

      {state.kind === "running" && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="truncate">
              [{state.currentIdx + 1}/{files.length}] {state.currentName}
            </span>
            <span className="text-gray-500 text-xs">{Math.round(state.pct)}%</span>
          </div>
          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${state.pct}%` }}
            />
          </div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <SummaryCard
            results={results}
            totalReps={totalReps}
            onCopyJSON={copyJSON}
          />
          <AggregateStats results={results} />
          <PerRepTable results={results} />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({
  results,
  totalReps,
  onCopyJSON,
}: {
  results: ClipResult[];
  totalReps: number;
  onCopyJSON: () => void;
}) {
  const ok = results.filter((r) => r.result && r.result.reps.length > 0).length;
  const empty = results.filter((r) => r.result && r.result.reps.length === 0).length;
  const errored = results.filter((r) => r.error).length;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-6 text-sm">
        <Stat label="Clips" value={`${results.length}`} />
        <Stat label="With reps" value={`${ok}`} ok />
        {empty > 0 && <Stat label="No reps" value={`${empty}`} warn />}
        {errored > 0 && <Stat label="Errored" value={`${errored}`} bad />}
        <Stat label="Total reps" value={`${totalReps}`} />
      </div>
      <button
        type="button"
        onClick={onCopyJSON}
        className="px-3 py-1.5 text-xs bg-surface-light border border-border rounded-lg hover:border-accent/40"
      >
        Copy results JSON
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
  warn,
  bad,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
  bad?: boolean;
}) {
  const tone = bad
    ? "text-red-300"
    : warn
      ? "text-yellow-300"
      : ok
        ? "text-green-300"
        : "text-white";
  return (
    <div className="flex flex-col">
      <span className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function AggregateStats({ results }: { results: ClipResult[] }) {
  const reps = results
    .flatMap((r) => r.result?.reps ?? [])
    .filter(Boolean) as Rep[];

  if (reps.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-gray-400">
        No reps to aggregate.
      </div>
    );
  }

  const metrics: { label: string; values: number[]; unit: string }[] = [
    { label: "Depth (% body-h)", values: reps.map((r) => r.depth * 100), unit: "" },
    { label: "Lean", values: reps.map((r) => r.leanDeg), unit: "°" },
    { label: "Tempo (descent)", values: reps.map((r) => r.tempoS), unit: "s" },
    { label: "Butt wink", values: reps.map((r) => r.buttWinkDeg), unit: "°" },
    { label: "Thoracic round", values: reps.map((r) => r.thoracicDeg), unit: "°" },
    { label: "Hip rise ratio", values: reps.map((r) => r.hipRiseRatio), unit: "×" },
    { label: "Valgus (max leg)", values: reps.map((r) => r.valgusDeg), unit: "°" },
    { label: "Hip shift", values: reps.map((r) => r.hipShiftPct * 100), unit: "%" },
    { label: "Symmetry tilt", values: reps.map((r) => r.symmetryPct * 100), unit: "%" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Aggregate per metric ({reps.length} reps)</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Distribution across all detected reps in the corpus. p10 / p90 = 10th
          and 90th percentiles — useful for picking thresholds that fire on the
          worst ~10% without false-flagging the rest.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-light text-gray-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Metric</th>
              <th className="text-right px-4 py-2 font-medium">Min</th>
              <th className="text-right px-4 py-2 font-medium">p10</th>
              <th className="text-right px-4 py-2 font-medium">Median</th>
              <th className="text-right px-4 py-2 font-medium">Mean</th>
              <th className="text-right px-4 py-2 font-medium">p90</th>
              <th className="text-right px-4 py-2 font-medium">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {metrics.map((m) => {
              const s = stats(m.values);
              return (
                <tr key={m.label}>
                  <td className="px-4 py-2 text-gray-300">{m.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                    {s.min.toFixed(2)}
                    {m.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                    {s.p10.toFixed(2)}
                    {m.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.median.toFixed(2)}
                    {m.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.mean.toFixed(2)}
                    {m.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                    {s.p90.toFixed(2)}
                    {m.unit}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                    {s.max.toFixed(2)}
                    {m.unit}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PerRepTable({ results }: { results: ClipResult[] }) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Per-rep detail</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-surface-light text-gray-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Clip</th>
              <th className="text-left px-2 py-2 font-medium">View</th>
              <th className="text-right px-2 py-2 font-medium">#</th>
              <th className="text-right px-2 py-2 font-medium">Depth%</th>
              <th className="text-right px-2 py-2 font-medium">Lean°</th>
              <th className="text-right px-2 py-2 font-medium">Tempo s</th>
              <th className="text-right px-2 py-2 font-medium">Wink°</th>
              <th className="text-right px-2 py-2 font-medium">Round°</th>
              <th className="text-right px-2 py-2 font-medium">Rise ×</th>
              <th className="text-right px-2 py-2 font-medium">Valgus°</th>
              <th className="text-right px-2 py-2 font-medium">Shift%</th>
              <th className="text-right px-2 py-2 font-medium">Symm%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {results.map((c) => {
              if (c.error) {
                return (
                  <tr key={c.filename}>
                    <td className="px-3 py-2 truncate max-w-[200px]" title={c.filename}>
                      {c.filename}
                    </td>
                    <td colSpan={11} className="px-2 py-2 text-red-300 text-xs">
                      {c.error}
                    </td>
                  </tr>
                );
              }
              if (!c.result || c.result.reps.length === 0) {
                return (
                  <tr key={c.filename}>
                    <td className="px-3 py-2 truncate max-w-[200px]" title={c.filename}>
                      {c.filename}
                    </td>
                    <td className="px-2 py-2 text-gray-500">{c.result?.view ?? "—"}</td>
                    <td colSpan={10} className="px-2 py-2 text-gray-500 text-xs">
                      no reps detected ({c.result?.framesUsable ?? 0}/{c.result?.framesProcessed ?? 0} usable)
                    </td>
                  </tr>
                );
              }
              return c.result.reps.map((r, i) => (
                <tr key={`${c.filename}-${r.index}`}>
                  {i === 0 ? (
                    <>
                      <td
                        className="px-3 py-2 truncate max-w-[200px] align-top"
                        rowSpan={c.result!.reps.length}
                        title={c.filename}
                      >
                        {c.filename}
                      </td>
                      <td
                        className="px-2 py-2 align-top"
                        rowSpan={c.result!.reps.length}
                      >
                        <ViewTag view={c.result!.view} />
                      </td>
                    </>
                  ) : null}
                  <td className="px-2 py-2 text-right tabular-nums text-gray-500">
                    {r.index}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {(r.depth * 100).toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.leanDeg.toFixed(0)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.tempoS.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.buttWinkDeg.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.thoracicDeg.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.hipRiseRatio.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {r.valgusDeg.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {(r.hipShiftPct * 100).toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {(r.symmetryPct * 100).toFixed(2)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViewTag({ view }: { view: View }) {
  const styles: Record<View, string> = {
    side: "bg-green-500/15 text-green-300 border-green-500/30",
    front: "bg-accent/15 text-accent border-accent/30",
    unclear: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${styles[view]}`}>
      {view}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ExportPayload {
  exportedAt: string;
  clipCount: number;
  totalReps: number;
  clips: Array<{
    filename: string;
    sizeBytes: number;
    error?: string;
    view?: View;
    durationS?: number;
    framesProcessed?: number;
    framesUsable?: number;
    reps?: Rep[];
  }>;
}

function serializeForExport(results: ClipResult[]): ExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    clipCount: results.length,
    totalReps: results.reduce(
      (a, r) => a + (r.result?.reps.length ?? 0),
      0
    ),
    clips: results.map((c) => {
      if (c.error) {
        return { filename: c.filename, sizeBytes: c.sizeBytes, error: c.error };
      }
      if (!c.result) {
        return { filename: c.filename, sizeBytes: c.sizeBytes };
      }
      return {
        filename: c.filename,
        sizeBytes: c.sizeBytes,
        view: c.result.view,
        durationS: c.result.durationS,
        framesProcessed: c.result.framesProcessed,
        framesUsable: c.result.framesUsable,
        reps: c.result.reps,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function stats(xs: number[]) {
  if (xs.length === 0) {
    return { min: 0, p10: 0, median: 0, mean: 0, p90: 0, max: 0 };
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const pct = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const median =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    min: sorted[0],
    p10: pct(10),
    median,
    mean,
    p90: pct(90),
    max: sorted[sorted.length - 1],
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
