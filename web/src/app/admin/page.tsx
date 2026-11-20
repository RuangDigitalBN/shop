
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ShopStatusControl from "./ShopStatusControl";

type DashboardStats = {
  products: number;
  categories: number;
  orders: number;
  sales: number;
};

const managementLinks = [
  {
    title: "Requests",
    description: "Review game requests and customer feedback.",
    href: "/admin/requests",
  },
  {
    title: "Products",
    description: "Add, edit and manage your products.",
    href: "/admin/products",
  },
  {
    title: "Games",
    description: "Manage your games.",
    href: "/admin/categories",
  },
  {
    title: "Product Types",
    description: "Manage types within each game, visibility and sorting.",
    href: "/admin/product-types",
  },
  {
    title: "Orders",
    description: "Review payments and manage orders.",
    href: "/admin/orders",
  },
  {
    title: "Payment Settings",
    description: "Manage bank transfer and payment details.",
    href: "/admin/payment-settings",
  },
];

export default function AdminDashboard() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [stats, setStats] = useState<DashboardStats>({
    products: 0,
    categories: 0,
    orders: 0,
    sales: 0,
  });

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

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

  useEffect(() => {
    if (checking) return;

    async function loadStats() {
      setLoadingStats(true);
      setStatsError("");

      const [productsResult, categoriesResult, ordersResult, salesResult] =
        await Promise.all([
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),

          supabase
            .from("categories")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),

          supabase
            .from("orders")
            .select("id", { count: "exact", head: true }),

          supabase
            .from("orders")
            .select("total")
            .eq("order_status", "completed"),
        ]);

      const hasError =
        productsResult.error ||
        categoriesResult.error ||
        ordersResult.error ||
        salesResult.error;

      if (hasError) {
        setStatsError("Unable to load dashboard statistics.");
        setLoadingStats(false);
        return;
      }

      const completedSales = (salesResult.data ?? []).reduce(
        (sum, order) => sum + Number(order.total ?? 0),
        0
      );

      setStats({
        products: productsResult.count ?? 0,
        categories: categoriesResult.count ?? 0,
        orders: ordersResult.count ?? 0,
        sales: completedSales,
      });

      setLoadingStats(false);
    }

    loadStats();
  }, [checking]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171717] text-[#F2F0E9]">
        <p className="text-sm text-white/50">
          Verifying administrator...
        </p>
      </main>
    );
  }

  const statCards = [
    {
      label: "Active Products",
      value: stats.products.toString(),
      description: "Available in your store",
    },
    {
      label: "Active Games",
      value: stats.categories.toString(),
      description: "Currently displayed",
    },
    {
      label: "Total Orders",
      value: stats.orders.toString(),
      description: "All recorded orders",
    },
    {
      label: "Completed Sales",
      value: `BND ${stats.sales.toFixed(2)}`,
      description: "From completed orders",
    },
  ];

  return (
    <main className="admin-polish min-h-screen bg-[#171717] text-[#F2F0E9]">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-5 sm:px-8 lg:px-10">
        <Link href="/" className="text-xl font-black italic">
          RUANG<span className="text-[#C6F36B]">.</span>
        </Link>

        <button
          onClick={handleLogout}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-white/70 transition hover:border-[#C6F36B] hover:text-[#C6F36B]"
        >
          Sign out
        </button>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6F36B]">
          Administration
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black">
              Dashboard.
            </h1>
            <p className="mt-3 text-sm text-white/50">
              Welcome back, {email}
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition hover:border-[#C6F36B] hover:text-[#C6F36B]"
          >
            Refresh data
          </button>
        </div>

        <ShopStatusControl />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-[#262626] p-5 sm:p-6"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                {item.label}
              </p>

              <p className="mt-4 break-words text-2xl font-black tracking-tight sm:text-3xl">
                {loadingStats ? "..." : statsError ? "—" : item.value}
              </p>

              <p className="mt-2 text-xs text-white/40">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {statsError && (
          <div role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
            {statsError}
          </div>
        )}

        <div className="mt-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C6F36B]">
              Management
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Store management.
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Manage your storefront and daily operations.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {managementLinks.map((item) => (
              <a
                key={item.title}
                href={item.href}
                className="group rounded-2xl border border-white/10 bg-[#262626] p-5 transition hover:border-[#C6F36B]/50 hover:bg-[#2c2c2c] sm:p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-bold transition group-hover:text-[#C6F36B]">
                    {item.title}
                  </h3>
                  <span aria-hidden="true" className="text-lg text-white/30 transition group-hover:translate-x-1 group-hover:text-[#C6F36B]">
                    →
                  </span>
                </div>

                <p className="mt-2 text-sm text-white/50">
                  {item.description}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
