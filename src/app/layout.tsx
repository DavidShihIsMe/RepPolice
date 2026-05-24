import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "RepPolice — Perfect Your Squat Form",
  description:
    "Upload your squat video and get AI-powered form analysis. Prevent injuries, lift smarter.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border">
          <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-gray-500 flex items-center justify-between">
            <span>© RepPolice</span>
            <span>v0.2 · platform preview</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
