
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export default function CategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  function generateSlug(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function loadCategories() {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, description, is_active, sort_order")
      .order("sort_order", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setCategories(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/admin/login");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError || !admin) {
        await supabase.auth.signOut();
        router.replace("/admin/login");
        return;
      }

      await loadCategories();
    }

    checkAdmin();
  }, [router]);

  function startEditing(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setSlug(category.slug);
    setDescription(category.description ?? "");
    setIsActive(category.is_active);
    setError("");
    setSuccess("");
  }

  function cancelEditing() {
    setEditingId(null);
    setName("");
    setSlug("");
    setDescription("");
    setIsActive(true);
    setError("");
    setSuccess("");
  }

  async function handleAddCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const cleanName = name.trim();
    const cleanSlug = generateSlug(slug || name);

    if (!cleanName || !cleanSlug) {
      setError("Please enter a valid category name.");
      setSaving(false);
      return;
    }

    const categoryData = {
      name: cleanName,
      slug: cleanSlug,
      description: description.trim() || null,
      is_active: isActive,
    };

    const { error } = editingId
      ? await supabase
          .from("categories")
          .update(categoryData)
          .eq("id", editingId)
      : await supabase.from("categories").insert({
          ...categoryData,
          sort_order: categories.length,
        });

    if (error) {
      setError(
        error.code === "23505"
          ? "This category name or URL slug already exists."
          : error.message
      );
      setSaving(false);
      return;
    }

    setSuccess(
      editingId
        ? "Category updated successfully."
        : "Category added successfully."
    );

    cancelEditing();
    await loadCategories();
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-[#171717] text-[#F2F0E9]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-10">
        <a href="/admin" className="text-xl font-black italic">
          RUANG<span className="text-[#C6F36B]">.</span>
        </a>

        <a
          href="/admin"
          className="text-sm text-white/50 hover:text-[#C6F36B]"
        >
          Back to dashboard
        </a>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6F36B]">
          Store management
        </p>

        <h1 className="mt-3 text-4xl font-black">Categories.</h1>

        <p className="mt-2 text-sm text-white/50">
          Organise your products by game or category.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="h-fit rounded-2xl border border-white/10 bg-[#262626] p-6">
            <h2 className="text-lg font-bold">
              {editingId ? "Edit category" : "Add category"}
            </h2>

            <form onSubmit={handleAddCategory} className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold text-white/60">
                  Category name
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlug(generateSlug(e.target.value));
                  }}
                  placeholder="e.g. Mobile Legends"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-white/60">
                  URL slug
                </label>
                <input
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mobile-legends"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
                <p className="mt-2 text-xs text-white/30">
                  Generated automatically. You can edit it.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold text-white/60">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short category description..."
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <label className="flex items-center gap-3 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="accent-[#C6F36B]"
                />
                Active (visible to customers)
              </label>

              {error && (
                <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {error}
                </p>
              )}

              {success && (
                <p className="rounded-lg border border-[#C6F36B]/20 bg-[#C6F36B]/10 p-3 text-sm text-[#C6F36B]">
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-[#C6F36B] px-5 py-3 text-sm font-black text-[#171717] transition hover:bg-[#d5ff82] disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add category"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="w-full rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-white/60 transition hover:border-white/30 hover:text-white"
                >
                  Cancel Editing
                </button>
              )}
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#262626] p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold">All categories</h2>
              <span className="text-xs text-white/40">
                {categories.length} categories
              </span>
            </div>

            {loading ? (
              <p className="mt-8 text-sm text-white/50">
                Loading categories...
              </p>
            ) : categories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-lg font-bold">No categories yet.</p>
                <p className="mt-2 text-sm text-white/40">
                  Add your first category using the form.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#171717] p-4"
                  >
                    <div>
                      <p className="font-bold">{category.name}</p>
                      <p className="mt-1 text-xs text-white/40">
                        {category.slug}
                      </p>
                      {category.description && (
                        <p className="mt-2 text-xs text-white/50">
                          {category.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <span
                        className={
                          category.is_active
                            ? "text-xs font-bold text-[#C6F36B]"
                            : "text-xs text-white/40"
                        }
                      >
                        {category.is_active ? "Active" : "Hidden"}
                      </span>

                      <button
                        type="button"
                        onClick={() => startEditing(category)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold transition hover:border-[#C6F36B] hover:text-[#C6F36B]"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
