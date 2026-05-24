import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ctaHref = user ? "/submit" : "/login?next=/submit";
  const ctaLabel = user ? "Submit a Video" : "Get Started — It's Free";

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 bg-accent/20 rounded-full blur-2xl" />
            <svg viewBox="0 0 96 96" fill="none" className="relative w-full h-full">
              <rect x="14" y="42" width="68" height="6" rx="3" fill="#22d3ee" opacity="0.9" />
              <rect x="8" y="30" width="10" height="30" rx="3" fill="#22d3ee" />
              <rect x="78" y="30" width="10" height="30" rx="3" fill="#22d3ee" />
              <circle cx="48" cy="26" r="10" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.4" />
              <path d="M42 26 L47 31 L55 21" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6 animate-fade-in-up">
            Perfect Your Form.{" "}
            <br className="hidden sm:block" />
            <span className="text-accent">Prevent Injuries.</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-xl mx-auto mb-10 animate-fade-in-up delay-100">
            Upload a video of your squat. We&apos;ll store it securely and
            return AI-powered form analysis — free.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-200">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent text-black font-semibold rounded-xl hover:bg-accent-hover transition-colors text-base shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:shadow-[0_0_32px_rgba(34,211,238,0.35)]"
            >
              {ctaLabel}
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <span className="text-sm text-gray-500">
              {user ? `Signed in as ${user.email}` : "Free account · takes 30 seconds"}
            </span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-accent text-sm font-medium tracking-widest uppercase mb-3">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Three steps to better form
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Create an account",
              body: "Email or Google. Your submissions are private to you.",
            },
            {
              title: "Upload a squat video",
              body: "Drop in a clip from any phone. We support MP4, MOV, and WebM.",
            },
            {
              title: "Get your form report",
              body: "Coming soon: per-rep depth, knee tracking, and tempo analysis.",
            },
          ].map((step, i) => (
            <div
              key={i}
              className="relative bg-surface border border-border rounded-2xl p-6 hover:border-accent/30 transition-colors"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-full bg-accent/10 text-accent border border-accent/20 text-sm font-bold mb-4">
                {i + 1}
              </div>
              <h3 className="text-base font-semibold mb-1.5">{step.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
