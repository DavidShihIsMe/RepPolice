import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RepPolice — AI Form Analysis",
  description: "Upload a video of your squat and get instant AI-powered form analysis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-[#0a0a0a] text-gray-100 antialiased`}>
        <nav className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight text-white">
              Rep<span className="text-accent">Police</span>
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/analyze" className="text-gray-400 hover:text-white transition-colors">
                Analyze
              </Link>
              <Link href="/results" className="text-gray-400 hover:text-white transition-colors">
                Results
              </Link>
              <Link
                href="/analyze"
                className="hidden sm:inline-flex px-4 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-full text-xs font-medium hover:bg-accent/20 transition-colors"
              >
                Try Free
              </Link>
            </div>
          </div>
        </nav>
        <Providers>
          <main>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
