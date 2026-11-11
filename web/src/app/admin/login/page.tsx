"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/admin";
  }
  async function handleForgotPassword() {
    setError("");

    if (!email) {
      setError("Please enter your email address first.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setError("Recovery email sent. Please check your inbox.");
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#171717] px-5 py-12 text-[#F2F0E9]">
      <div className="w-full max-w-md">
        <a href="/" className="text-2xl font-black italic tracking-tight">
          RUANG<span className="text-[#C6F36B]">.</span>
        </a>

        <div className="mt-12">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6F36B]">
            Administration
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Welcome back.
          </h1>

          <p className="mt-3 text-sm text-white/50">
            Sign in to manage your Ruang Digital store.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-9 space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full rounded-xl border border-white/10 bg-[#262626] px-4 py-4 text-sm outline-none transition focus:border-[#C6F36B]"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-xl border border-white/10 bg-[#262626] px-4 py-4 text-sm outline-none transition focus:border-[#C6F36B]"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#C6F36B] px-4 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-[#d5ff83] disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
                    <button
            type="button"
            onClick={handleForgotPassword}
            className="w-full text-center text-xs text-white/50 transition hover:text-[#C6F36B]"
          >
            Forgot your password?
          </button>
        </form>

        <p className="mt-10 text-center text-xs text-white/30">
          RUANG DIGITAL · ADMIN PORTAL
        </p>
      </div>
    </main>
  );
}