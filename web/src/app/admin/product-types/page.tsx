
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CatalogNav from "../CatalogNav";
import { supabase } from "@/lib/supabase";

type Game = { id: string; name: string; is_active: boolean };

type ProductType = {
  category_id: string;
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

export default function ProductTypesPage() {
  const router = useRouter();

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [games, setGames] = useState<Game[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
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

  async function loadProductTypes() {
    const { data: gameData, error: gameError } = await supabase.from("categories").select("id, name, is_active").order("sort_order");
    if (gameError) { setError(gameError.message); setLoading(false); return; }
    setGames(gameData ?? []);
    const { data, error } = await supabase
      .from("product_types")
      .select("id, category_id, name, slug, description, is_active, sort_order")
      .order("sort_order", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setProductTypes(data ?? []);
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

      await loadProductTypes();
    }

    checkAdmin();
  }, [router]);

  function startEditing(productType: ProductType) {
    setEditingId(productType.id);
    setCategoryId(productType.category_id);
    setSortOrder(String(productType.sort_order));
    setName(productType.name);
    setSlug(productType.slug);
    setDescription(productType.description ?? "");
    setIsActive(productType.is_active);
    setError("");
    setSuccess("");
  }

  function cancelEditing() {
    setEditingId(null);
    setCategoryId("");
    setSortOrder("0");
    setName("");
    setSlug("");
    setDescription("");
    setIsActive(true);
    setError("");
    setSuccess("");
  }

  async function handleAddProductType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const cleanName = name.trim();
    const cleanSlug = generateSlug(slug || name);

    if (!categoryId || !cleanName || !cleanSlug || sortOrder.trim() === "" || !Number.isSafeInteger(Number(sortOrder)) || Number(sortOrder) < -2147483648 || Number(sortOrder) > 2147483647) {
      setError("Choose a game, enter a name and slug, and use a whole number for sort order.");
      setSaving(false);
      return;
    }

    const productTypeData = {
      category_id: categoryId,
      sort_order: Number(sortOrder),
      name: cleanName,
      slug: cleanSlug,
      description: description.trim() || null,
      is_active: isActive,
    };

    const { error } = editingId
      ? await supabase
          .from("product_types")
          .update(productTypeData)
          .eq("id", editingId)
      : await supabase.from("product_types").insert({
          ...productTypeData,

        });

    if (error) {
      setError(
        error.code === "23505"
          ? "This URL slug already exists for the selected game."
          : error.code === "23503" ? "This type has assigned products. Keep its game, or reassign those products first." : error.message
      );
      setSaving(false);
      return;
    }

    const message = editingId ? "Product Type updated successfully." : "Product Type added successfully.";
    cancelEditing();
    setSuccess(message);
    await loadProductTypes();
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
      <CatalogNav />

      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6F36B]">
          Store management
        </p>

        <h1 className="mt-3 text-4xl font-black">Product Types.</h1>

        <p className="mt-2 text-sm text-white/50">
          Manage the Product Types within each game. Deactivate a type to hide it without deleting its products.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="h-fit rounded-2xl border border-white/10 bg-[#262626] p-6">
            <h2 className="text-lg font-bold">
              {editingId ? "Edit Product Type" : "Add Product Type"}
            </h2>

            <form onSubmit={handleAddProductType} className="mt-6 space-y-5">
              <div>
                <label htmlFor="type-game" className="mb-2 block text-xs font-bold text-white/60">Game</label>
                <select id="type-game" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm">
                  <option value="">Choose a game</option>
                  {games.map((game) => <option key={game.id} value={game.id}>{game.name}{!game.is_active ? " (Hidden)" : ""}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="type-name" className="mb-2 block text-xs font-bold text-white/60">
                  Product Type name
                </label>
                <input
                  required
                  id="type-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlug(generateSlug(e.target.value));
                  }}
                  placeholder="e.g. Diamonds"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label htmlFor="type-slug" className="mb-2 block text-xs font-bold text-white/60">
                  URL slug
                </label>
                <input
                  required
                  id="type-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="diamonds"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
                <p className="mt-2 text-xs text-white/30">
                  Generated automatically. You can edit it.
                </p>
              </div>

              <div>
                <label htmlFor="type-description" className="mb-2 block text-xs font-bold text-white/60">
                  Description
                </label>
                <textarea
                  id="type-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label htmlFor="type-sort" className="mb-2 block text-xs font-bold text-white/60">Sort order</label>
                <input id="type-sort" required type="number" step="1" min="-2147483648" max="2147483647" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm" />
                <p className="mt-2 text-xs text-white/40">Lower numbers appear first within a game.</p>
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
                    : "Add Product Type"}
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
              <h2 className="text-lg font-bold">All Product Types</h2>
              <span className="text-xs text-white/40">
                {productTypes.length} types
              </span>
            </div>

            {loading ? (
              <p className="mt-8 text-sm text-white/50">
                Loading Product Types...
              </p>
            ) : productTypes.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-lg font-bold">No Product Types yet.</p>
                <p className="mt-2 text-sm text-white/40">
                  Add your first Product Type using the form.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {productTypes.map((productType) => (
                  <div
                    key={productType.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#171717] p-4"
                  >
                    <div>
                      <p className="font-bold">{productType.name}</p>
                      <p className="mt-1 text-xs text-white/40">
                        {games.find((game) => game.id === productType.category_id)?.name} · {productType.slug} · Order {productType.sort_order}
                      </p>
                      {productType.description && (
                        <p className="mt-2 text-xs text-white/50">
                          {productType.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <span
                        className={
                          productType.is_active
                            ? "text-xs font-bold text-[#C6F36B]"
                            : "text-xs text-white/40"
                        }
                      >
                        {productType.is_active ? "Active" : "Hidden"}
                      </span>

                      <button
                        type="button"
                        onClick={() => startEditing(productType)}
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
