"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginForm({
  next,
  initialMode = "signin",
  initialError,
}: {
  next?: string;
  initialMode?: Mode;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(initialError ?? null);
  const [messageKind, setMessageKind] = useState<"error" | "info">(
    initialError ? "error" : "info"
  );
  const [pending, startTransition] = useTransition();

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next || "/submit")}`,
          },
        });
        if (error) {
          setMessageKind("error");
          setMessage(error.message);
          return;
        }
        if (data.user && !data.session) {
          setMessageKind("info");
          setMessage("Check your email for a confirmation link to finish signing up.");
        } else if (data.session) {
          router.push(next || "/submit");
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setMessageKind("error");
          setMessage(error.message);
          return;
        }
        router.push(next || "/submit");
        router.refresh();
      }
    });
  }

  function signInWithGoogle() {
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next || "/submit")}`,
        },
      });
      if (error) {
        setMessageKind("error");
        setMessage(error.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm font-medium hover:bg-surface-light transition-colors disabled:opacity-50"
      >
        <svg viewBox="0 0 18 18" className="w-4 h-4">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          />
        </svg>
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-bg px-2 text-gray-500">or with email</span>
        </div>
      </div>

      <form onSubmit={submitEmail} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-xs text-gray-400 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs text-gray-400 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
          />
        </div>

        {message && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              messageKind === "error"
                ? "bg-red-500/10 border border-red-500/30 text-red-300"
                : "bg-accent/10 border border-accent/30 text-accent"
            }`}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2.5 bg-accent text-black font-semibold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {pending ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="text-xs text-gray-500 text-center">
        {mode === "signup" ? "Already have an account?" : "New to RepPolice?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setMessage(null);
          }}
          className="text-accent hover:underline"
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </p>
    </div>
  );
}
