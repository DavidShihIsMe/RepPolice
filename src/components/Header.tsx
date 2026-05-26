import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Header() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-border">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
          RepPolice
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/lab" className="text-gray-400 hover:text-white transition-colors">
            Lab
          </Link>
          {user ? (
            <>
              <Link
                href="/submit"
                className="text-gray-300 hover:text-white transition-colors"
              >
                Submit
              </Link>
              <Link
                href="/submissions"
                className="text-gray-300 hover:text-white transition-colors"
              >
                My Submissions
              </Link>
              <span className="text-gray-600">·</span>
              <span className="text-xs text-gray-500 hidden sm:inline">
                {user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg bg-accent text-black font-medium hover:bg-accent-hover transition-colors"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
