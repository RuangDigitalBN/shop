"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage("Password updated successfully. You can now sign in.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#171717] px-5 py-12 text-[#F2F0E9]">
      <div className="w-full max-w-md">
        <a href="/" className="text-2xl font-black italic">
          RUANG<span className="text-[#C6F36B]">.</span>
        </a>

        <h1 className="mt-12 text-4xl font-black">
          Reset password.
        </h1>

        <p className="mt-3 text-sm text-white/50">
          Create a new password for your administrator account.
        </p>

        {!ready ? (
          <p className="mt-8 rounded-xl border border-white/10 bg-[#262626] p-4 text-sm text-white/60">
            Waiting for a valid password recovery link. Please open the latest
            recovery email.
          </p>
        ) : (
          <form onSubmit={handleReset} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
                New password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#262626] px-4 py-4 text-sm outline-none focus:border-[#C6F36B]"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
                Confirm new password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#262626] px-4 py-4 text-sm outline-none focus:border-[#C6F36B]"
                placeholder="Enter password again"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-lg bg-[#C6F36B]/10 p-3 text-sm text-[#C6F36B]">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#C6F36B] px-4 py-4 text-sm font-black uppercase tracking-wider text-[#171717] disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update password"}
            </button>

            {message && (
              <a
                href="/admin/login"
                className="block text-center text-sm text-[#C6F36B]"
              >
                Go to admin login
              </a>
            )}
          </form>
        )}
      </div>
    </main>
  );
}