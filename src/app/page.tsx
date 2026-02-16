import Link from "next/link";

function HeroIcon() {
  return (
    <div className="relative w-32 h-32 mx-auto mb-8 animate-float">
      {/* Glow backdrop */}
      <div className="absolute inset-0 bg-accent/20 rounded-full blur-2xl" />
      <svg viewBox="0 0 128 128" fill="none" className="relative w-full h-full">
        {/* Barbell */}
        <rect x="20" y="56" width="88" height="6" rx="3" fill="#22d3ee" opacity="0.9" />
        {/* Left plate */}
        <rect x="14" y="42" width="12" height="34" rx="3" fill="#22d3ee" />
        <rect x="6" y="46" width="10" height="26" rx="2" fill="#22d3ee" opacity="0.6" />
        {/* Right plate */}
        <rect x="102" y="42" width="12" height="34" rx="3" fill="#22d3ee" />
        <rect x="112" y="46" width="10" height="26" rx="2" fill="#22d3ee" opacity="0.6" />
        {/* Checkmark shield */}
        <path
          d="M64 78 L64 98 L50 90 Z"
          fill="none"
        />
        <circle cx="64" cy="36" r="14" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.4" />
        <path d="M57 36 L62 41 L72 31" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StepIcon({ step }: { step: number }) {
  const icons = [
    // Step 1: Record — camera icon
    <svg key="record" viewBox="0 0 32 32" fill="none" className="w-8 h-8">
      <rect x="3" y="8" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M21 13 L29 9 V23 L21 19 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>,
    // Step 2: Upload — cloud upload icon
    <svg key="upload" viewBox="0 0 32 32" fill="none" className="w-8 h-8">
      <path d="M8 22 C3 22 3 16 7 14 C7 9 12 6 16 9 C20 6 25 9 25 14 C29 16 29 22 24 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 16 V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 20 L16 16 L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>,
    // Step 3: Report — clipboard check icon
    <svg key="report" viewBox="0 0 32 32" fill="none" className="w-8 h-8">
      <rect x="6" y="4" width="20" height="24" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4 V7 C12 8 13 9 14 9 H18 C19 9 20 8 20 7 V4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16 L15 19 L21 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>,
  ];
  return icons[step];
}

function AnalysisIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    depth: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path d="M20 6 V34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 26 L20 34 L28 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 14 H32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3" opacity="0.5" />
      </svg>
    ),
    knee: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <circle cx="20" cy="20" r="2" fill="currentColor" />
        <path d="M20 4 V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 30 V36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 20 H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M30 20 H36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    back: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path d="M10 32 L10 16 L28 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 16 L28 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        {/* Angle arc */}
        <path d="M10 24 Q14 20 16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
        <text x="16" y="24" fill="currentColor" fontSize="8" opacity="0.6">45°</text>
      </svg>
    ),
    bar: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path d="M20 6 C20 6 18 14 19 20 C20 26 22 30 20 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="6" r="2.5" fill="currentColor" opacity="0.8" />
        <circle cx="20" cy="36" r="2.5" fill="currentColor" opacity="0.8" />
        {/* Ideal line */}
        <path d="M28 6 V36" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
      </svg>
    ),
    symmetry: (
      <svg viewBox="0 0 40 40" fill="none" className="w-9 h-9">
        <path d="M20 4 V36" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
        {/* Left side */}
        <path d="M18 12 L10 16 L12 24 L18 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Right side (mirror) */}
        <path d="M22 12 L30 16 L28 24 L22 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };
  return icons[type] || null;
}

const steps = [
  {
    title: "Record Your Lift",
    description: "Film your squat from the side or front angle with any phone camera.",
  },
  {
    title: "Upload the Video",
    description: "Drop your video into our analyzer. We support all common formats.",
  },
  {
    title: "Get Your Form Report",
    description: "Receive a detailed breakdown with scores, tips, and visual overlays.",
  },
];

const analyses = [
  { key: "depth", label: "Depth & Consistency", desc: "Are you hitting parallel and staying consistent?" },
  { key: "knee", label: "Knee Alignment", desc: "Tracking, valgus, and forward travel" },
  { key: "back", label: "Trunk Position", desc: "Forward lean, thoracic rounding, and butt wink" },
  { key: "bar", label: "Bar Path & Tempo", desc: "Bar drift, reversal control, and rep tempo" },
  { key: "symmetry", label: "Balance & Stability", desc: "Symmetry, hip shift, stance, and head position" },
];

export default function Home() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-20 text-center">
          <HeroIcon />

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 animate-fade-in-up">
            Perfect Your Form.{" "}
            <br className="hidden sm:block" />
            <span className="text-accent">Prevent Injuries.</span>{" "}
            <br className="hidden sm:block" />
            Lift Smarter.
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-xl mx-auto mb-10 animate-fade-in-up delay-100">
            Upload a video of your squat and get instant AI-powered form
            analysis — free.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-200">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent text-black font-semibold rounded-xl hover:bg-accent-hover transition-colors text-base shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:shadow-[0_0_32px_rgba(34,211,238,0.35)]"
            >
              Analyze My Form
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
            <span className="text-sm text-gray-500">No account required</span>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="text-accent text-sm font-medium tracking-widest uppercase mb-3">
            How It Works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Three steps to better form
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <div
              key={i}
              className="relative group bg-surface border border-border rounded-2xl p-8 hover:border-accent/30 transition-all duration-300"
            >
              {/* Step number */}
              <div className="flex items-center gap-4 mb-5">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/10 text-accent border border-accent/20 text-sm font-bold">
                  {i + 1}
                </div>
                <div className="text-accent">
                  <StepIcon step={i} />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                {step.description}
              </p>

              {/* Connector arrow (between cards on desktop) */}
              {i < 2 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-gray-700 z-10">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-6 h-6">
                    <path d="M6 3 L11 8 L6 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── What We Analyze ── */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <p className="text-accent text-sm font-medium tracking-widest uppercase mb-3">
              What We Analyze
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              18 metrics for a perfect squat
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {analyses.map((item) => (
              <div
                key={item.key}
                className="group relative bg-surface border border-border rounded-2xl p-6 text-center hover:border-accent/30 hover:bg-surface-light transition-all duration-300"
              >
                <div className="flex justify-center text-accent mb-4 group-hover:scale-110 transition-transform duration-300">
                  <AnalysisIcon type={item.key} />
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{item.label}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Ready to fix your squat?
          </h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            It takes less than a minute. Upload your video and see exactly
            where to improve.
          </p>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent text-black font-semibold rounded-xl hover:bg-accent-hover transition-colors text-base shadow-[0_0_24px_rgba(34,211,238,0.25)]"
          >
            Get Started — It&apos;s Free
          </Link>
        </div>
      </section>
    </div>
  );
}
