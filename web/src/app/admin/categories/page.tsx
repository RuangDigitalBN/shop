
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CatalogNav from "../CatalogNav";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url?: string | null;
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
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  function resetImage() {
    setImageFile(null);
    setLocalPreview("");
    setImageFailed(false);
    setFileInputKey((key) => key + 1);
  }

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
      // Read optional artwork without breaking existing catalogs before setup SQL is applied.
      .select("*")
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
    setImageUrl(category.image_url ?? "");
    resetImage();
    setIsActive(category.is_active);
    setError("");
    setSuccess("");
  }

  function cancelEditing() {
    setEditingId(null);
    setName("");
    setSlug("");
    setDescription("");
    setImageUrl("");
    resetImage();
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

    let savedImageUrl = imageUrl.trim();
    if (savedImageUrl && !/^https?:\/\//i.test(savedImageUrl)) {
      setError("Enter an http or https image URL.");
      setSaving(false);
      return;
    }

    const categoryId = editingId ?? crypto.randomUUID();
    try {
      if (imageFile) {
        const extensions: Record<string, string> = {
          "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        };
        const extension = extensions[imageFile.type];
        if (!extension || imageFile.size > 5 * 1024 * 1024 || imageFile.size === 0) {
          throw new Error("Choose a JPG, PNG, WebP or GIF image up to 5 MB.");
        }
        const path = `${categoryId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("product-images")
          .upload(path, imageFile, { contentType: imageFile.type, cacheControl: "3600", upsert: false });
        if (uploadError) throw new Error("Image upload failed. " + uploadError.message);
        savedImageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        // Keep a successful upload in the draft so a failed database save can be retried.
        setImageUrl(savedImageUrl);
        resetImage();
      }

      const categoryData = {
        name: cleanName,
        slug: cleanSlug,
        description: description.trim() || null,
        image_url: savedImageUrl || null,
        is_active: isActive,
      };
      const query = editingId
        ? supabase.from("categories").update(categoryData).eq("id", editingId)
        : supabase.from("categories").insert({ ...categoryData, id: categoryId, sort_order: categories.length });
      const { data, error: saveError } = await query.select("id").single();
      if (saveError || !data) {
        if (saveError?.code === "23505") throw new Error("This category name or URL slug already exists.");
        if (saveError?.message.includes("image_url")) {
          throw new Error("Game images need database setup before saving. Your changes are still here.");
        }
        throw new Error(saveError?.message ?? "The game could not be saved. Please refresh and try again.");
      }
      // Previous artwork is retained: other games or open editors may still reference it.
      cancelEditing();
      setSuccess(editingId ? "Category updated successfully." : "Category added successfully.");
      await loadCategories();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the game. Please try again.");
    } finally {
      setSaving(false);
    }
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

        <h1 className="mt-3 text-4xl font-black">Games.</h1>

        <p className="mt-2 text-sm text-white/50">
          Organise your products by game or category.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
          <div className="h-fit rounded-2xl border border-white/10 bg-[#262626] p-6">
            <h2 className="text-lg font-bold">
              {editingId ? "Edit game" : "Add game"}
            </h2>

            <form onSubmit={handleAddCategory} className="mt-6">
              <fieldset disabled={saving || loading} className="space-y-5 disabled:opacity-60">
              <div>
                <label className="mb-2 block text-xs font-bold text-white/60">
                  Game name
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

              <div className="space-y-3">
                <label htmlFor="game-image-url" className="block text-xs font-bold text-white/60">Game image URL</label>
                <input id="game-image-url" type="url" value={imageUrl} placeholder="https://example.com/game.jpg"
                  onChange={(event) => { setImageUrl(event.target.value); resetImage(); }}
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]" />
                <label htmlFor="game-image-file" className="block text-xs font-bold text-white/60">Or upload an image</label>
                <input key={fileInputKey} id="game-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                  className="w-full text-xs text-white/70"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) { resetImage(); return; }
                    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
                      setError("Choose a JPG, PNG, WebP or GIF image up to 5 MB.");
                      event.target.value = "";
                      resetImage();
                      return;
                    }
                    setError("");
                    setImageFile(file);
                    setLocalPreview(URL.createObjectURL(file));
                    setImageFailed(false);
                  }} />
                <p className="text-xs text-white/40">JPG, PNG, WebP or GIF, up to 5 MB. Artwork is saved when you save the game.</p>
                {(localPreview || imageUrl.trim()) && (
                  <div className="space-y-2">
                    {imageFailed ? <p role="status" className="text-xs text-amber-300">Image could not be loaded. Check the URL or choose another file.</p> : (
                      // eslint-disable-next-line @next/next/no-img-element -- Supports external URLs and local file previews.
                      <img src={localPreview || imageUrl.trim()} alt={`${name || "Game"} preview`} onError={() => setImageFailed(true)}
                        className="h-36 w-full rounded-xl border border-white/10 bg-[#171717] object-contain" />
                    )}
                    <button type="button" className="text-xs font-bold text-[#C6F36B]" onClick={() => { setImageUrl(""); resetImage(); }}>Remove image</button>
                  </div>
                )}
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
                <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {error}
                </p>
              )}

              {success && (
                <p role="status" className="rounded-lg border border-[#C6F36B]/20 bg-[#C6F36B]/10 p-3 text-sm text-[#C6F36B]">
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
                    : "Add game"}
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
              </fieldset>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#262626] p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold">All games</h2>
              <span className="text-xs text-white/40">
                {categories.length} games
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
                        disabled={saving || loading}
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
