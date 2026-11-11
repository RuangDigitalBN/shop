"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminDashboard() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user }, error: authError } =
        await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/admin/login");
        return;
      }

      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data) {
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      setEmail(user.email ?? "");
      setChecking(false);
    }

    checkAdmin();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171717] text-[#F2F0E9]">
        <p className="text-sm text-white/50">Verifying administrator...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#171717] text-[#F2F0E9]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-10">
        <a href="/" className="text-xl font-black italic">
          RUANG<span className="text-[#C6F36B]">.</span>
        </a>

        <button
          onClick={handleLogout}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-white/70 transition hover:border-[#C6F36B] hover:text-[#C6F36B]"
        >
          Sign out
        </button>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12 md:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6F36B]">
          Administration
        </p>

        <h1 className="mt-3 text-4xl font-black tracking-tight">
          Dashboard.
        </h1>

        <p className="mt-3 text-sm text-white/50">
          Welcome back, {email}
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {["Products", "Categories", "Orders", "Sales"].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-[#262626] p-6"
            >
              <p className="text-sm text-white/50">{item}</p>
              <p className="mt-4 text-2xl font-black">—</p>
              <p className="mt-2 text-xs text-white/30">
                Coming soon
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-[#262626] p-6">
          <h2 className="text-lg font-bold">Store management</h2>
          <p className="mt-2 text-sm text-white/50">
            Your product, category and order management tools will appear here.
          </p>
        </div>
      </section>
    </main>
  );
}