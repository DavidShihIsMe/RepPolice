import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string; mode?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(searchParams.next || "/submit");
  }

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">
        {searchParams.mode === "signup" ? "Create an account" : "Sign in"}
      </h1>
      <p className="text-sm text-gray-400 mb-8">
        {searchParams.mode === "signup"
          ? "Start tracking your squat form."
          : "Welcome back."}
      </p>
      <LoginForm next={searchParams.next} initialMode={searchParams.mode === "signup" ? "signup" : "signin"} initialError={searchParams.error} />
    </div>
  );
}
