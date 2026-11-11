
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number | null;
  track_stock: boolean;
  is_active: boolean;
};

const emptyForm = {
  name: "",
  slug: "",
  category_id: "",
  sku: "",
  description: "",
  price: "",
  compare_at_price: "",
  stock_quantity: "0",
  track_stock: false,
  is_active: true,
};

function generateSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Only return paths belonging to this product in our own public product-images bucket.
function getProductImagePath(imageUrl: string | null, productId: string) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl || url.host !== new URL(supabaseUrl).host) {
      return null;
    }

    const prefix = "/storage/v1/object/public/product-images/";
    if (!url.pathname.startsWith(prefix)) return null;

    const path = decodeURIComponent(url.pathname.slice(prefix.length));

    if (!path.startsWith(`${productId}/`) || path.includes("..")) {
      return null;
    }

    return path;
  } catch {
    return null;
  }
}

export default function ProductsPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  async function loadData() {
    setError("");

    const [productResult, categoryResult] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, category_id, name, slug, sku, description, image_url, price, compare_at_price, stock_quantity, track_stock, is_active"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (productResult.error) {
      setError(productResult.error.message);
    } else {
      setProducts(productResult.data ?? []);
    }

    if (categoryResult.error) {
      setError(categoryResult.error.message);
    } else {
      setCategories(categoryResult.data ?? []);
    }

    setLoading(false);
  }

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

      await loadData();
    }

    checkAdmin();
  }, [router]);

  function updateField(
    field: keyof typeof emptyForm,
    value: string | boolean
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setSlugEdited(true);
    setImageFile(null);
    setImagePreview(product.image_url);

    setForm({
      name: product.name,
      slug: product.slug,
      category_id: product.category_id ?? "",
      sku: product.sku ?? "",
      description: product.description ?? "",
      price: String(product.price),
      compare_at_price:
        product.compare_at_price == null
          ? ""
          : String(product.compare_at_price),
      stock_quantity: String(product.stock_quantity ?? 0),
      track_stock: product.track_stock ?? false,
      is_active: product.is_active ?? true,
    });

    setError("");
    setSuccess("");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm);
    setSlugEdited(false);
    setImageFile(null);
    setImagePreview(null);
    setError("");
    setSuccess("");
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const cleanName = form.name.trim();
    const cleanSlug = generateSlug(form.slug || form.name);
    const price = Number(form.price);
    const compareAtPrice =
      form.compare_at_price.trim() === ""
        ? null
        : Number(form.compare_at_price);
    const stockQuantity = Number(form.stock_quantity);

    if (!cleanName || !cleanSlug) {
      setError("Please enter a product name.");
      setSaving(false);
      return;
    }

    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      setError("Please enter a valid selling price.");
      setSaving(false);
      return;
    }

    if (
      compareAtPrice !== null &&
      (!Number.isFinite(compareAtPrice) || compareAtPrice < 0)
    ) {
      setError("Please enter a valid original price.");
      setSaving(false);
      return;
    }

    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      setError("Stock quantity must be a whole number of zero or more.");
      setSaving(false);
      return;
    }

    // Remember the current image before changing the product.
    // It will only be deleted after the replacement URL is saved successfully.
    let previousImageUrl: string | null = null;

    if (editingId && imageFile) {
      const { data: currentProduct, error: currentProductError } =
        await supabase
          .from("products")
          .select("image_url")
          .eq("id", editingId)
          .maybeSingle();

      if (currentProductError) {
        setError(
          "Could not check the existing product image: " +
            currentProductError.message
        );
        setSaving(false);
        return;
      }

      previousImageUrl = currentProduct?.image_url ?? null;
    }

    const productData = {
      name: cleanName,
      slug: cleanSlug,
      category_id: form.category_id || null,
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      price,
      compare_at_price: compareAtPrice,
      stock_quantity: stockQuantity,
      track_stock: form.track_stock,
      is_active: form.is_active,
    };

    let productId = editingId;

    if (editingId) {
      const { error } = await supabase
        .from("products")
        .update(productData)
        .eq("id", editingId);

      if (error) {
        setError(
          error.code === "23505"
            ? "This product URL slug or SKU already exists. Please use a different one."
            : error.message
        );
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert(productData)
        .select("id")
        .single();

      if (error) {
        setError(
          error.code === "23505"
            ? "This product URL slug or SKU already exists. Please use a different one."
            : error.message
        );
        setSaving(false);
        return;
      }

      productId = data.id;
    }

    let cleanupWarning = "";

    if (imageFile && productId) {
      const extension =
        imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${productId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, imageFile, {
          contentType: imageFile.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        setEditingId(productId);
        setError(
          "Product details were saved, but image upload failed. Your previous image has been kept. " +
            uploadError.message
        );
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      const { error: imageUpdateError } = await supabase
        .from("products")
        .update({ image_url: publicUrlData.publicUrl })
        .eq("id", productId);

      if (imageUpdateError) {
        setEditingId(productId);
        setError(
          "The new image uploaded, but saving its URL failed. Your previous image has been kept. " +
            imageUpdateError.message
        );
        setSaving(false);
        return;
      }

      // The new image is now active in the database.
      // Delete the previous image only if its URL is from our own bucket
      // and belongs to this same product.
      const previousImagePath = getProductImagePath(
        previousImageUrl,
        productId
      );

      if (previousImagePath && previousImagePath !== filePath) {
        const { error: deleteError } = await supabase.storage
          .from("product-images")
          .remove([previousImagePath]);

        if (deleteError) {
          cleanupWarning =
            " The new image is saved, but the previous image could not be deleted: " +
            deleteError.message;
        }
      }
    }

    setSuccess(
      (editingId
        ? "Product updated successfully."
        : "Product added successfully.") + cleanupWarning
    );

    setForm(emptyForm);
    setEditingId(null);
    setSlugEdited(false);
    setImageFile(null);
    setImagePreview(null);

    await loadData();
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

        <div className="mt-3">
          <h1 className="text-4xl font-black">Products.</h1>
          <p className="mt-2 text-sm text-white/50">
            Manage your store products, pricing and stock.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#262626] p-6 md:p-8">
          <h2 className="text-xl font-bold">
            {editingId ? "Edit product" : "Add new product"}
          </h2>

          <p className="mt-1 text-sm text-white/40">
            {editingId
              ? "Update your existing product details."
              : "Add a new product to your store."}
          </p>

          <form onSubmit={handleSave} className="mt-8 space-y-6">
            <div>
              <label className="mb-2 block text-sm font-bold">
                Product image
              </label>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#171717]">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-white/30">
                      No image selected
                    </span>
                  )}
                </div>

                <div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;

                      if (!file) return;

                      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                        setError("Please choose a PNG, JPG or WEBP image.");
                        e.target.value = "";
                        return;
                      }

                      if (file.size > 5 * 1024 * 1024) {
                        setError("Image must be smaller than 5MB.");
                        e.target.value = "";
                        return;
                      }

                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                      setError("");
                    }}
                    className="block w-full text-sm text-white/60 file:mr-4 file:rounded-lg file:border-0 file:bg-[#C6F36B] file:px-4 file:py-2 file:font-bold file:text-[#171717]"
                  />

                  <p className="mt-2 text-xs text-white/40">
                    PNG, JPG or WEBP. Maximum size: 5MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  Product name *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateField("name", value);

                    if (!slugEdited) {
                      updateField("slug", generateSlug(value));
                    }
                  }}
                  placeholder="e.g. Mobile Legends 86 Diamonds"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  URL slug *
                </label>
                <input
                  required
                  value={form.slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    updateField("slug", e.target.value);
                  }}
                  placeholder="mobile-legends-86-diamonds"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
                <p className="mt-2 text-xs text-white/30">
                  Automatically generated from the product name. You can edit it.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Category
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) =>
                    updateField("category_id", e.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  SKU
                </label>
                <input
                  value={form.sku}
                  onChange={(e) => updateField("sku", e.target.value)}
                  placeholder="Optional product code"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Selling price (BND) *
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => updateField("price", e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">
                  Original price (BND)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.compare_at_price}
                  onChange={(e) =>
                    updateField("compare_at_price", e.target.value)
                  }
                  placeholder="Optional"
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
                <p className="mt-2 text-xs text-white/30">
                  Optional higher price for displaying a discount.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">
                Product description
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) =>
                  updateField("description", e.target.value)
                }
                placeholder="Describe your product..."
                className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold">
                  Stock quantity
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock_quantity}
                  onChange={(e) =>
                    updateField("stock_quantity", e.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                />
              </div>

              <div className="flex flex-col justify-center gap-4">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.track_stock}
                    onChange={(e) =>
                      updateField("track_stock", e.target.checked)
                    }
                    className="h-4 w-4 accent-[#C6F36B]"
                  />
                  Track stock quantity
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      updateField("is_active", e.target.checked)
                    }
                    className="h-4 w-4 accent-[#C6F36B]"
                  />
                  Product is active and visible
                </label>
              </div>
            </div>

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

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#C6F36B] px-6 py-3 text-sm font-black text-[#171717] transition hover:bg-[#d5ff80] disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add Product"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-xl border border-white/10 px-6 py-3 text-sm font-bold hover:border-white/30"
                >
                  Cancel Editing
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-[#262626] p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold">All products</h2>
            <span className="text-xs text-white/40">
              {products.length} products
            </span>
          </div>

          {loading ? (
            <p className="mt-8 text-sm text-white/50">
              Loading products...
            </p>
          ) : error && products.length === 0 ? (
            <p className="mt-8 text-sm text-red-400">{error}</p>
          ) : products.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg font-bold">No products yet.</p>
              <p className="mt-2 text-sm text-white/40">
                Add your first product using the form above.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[750px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
                    <th className="pb-4">Product</th>
                    <th className="pb-4">Category</th>
                    <th className="pb-4">SKU</th>
                    <th className="pb-4">Price</th>
                    <th className="pb-4">Stock</th>
                    <th className="pb-4">Status</th>
                    <th className="pb-4">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => {
                    const category = categories.find(
                      (item) => item.id === product.category_id
                    );

                    return (
                      <tr
                        key={product.id}
                        className="border-b border-white/5"
                      >
                        <td className="py-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#171717]">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-[9px] text-white/30">
                                  No image
                                </span>
                              )}
                            </div>
                            <span className="font-bold">{product.name}</span>
                          </div>
                        </td>
                        <td className="py-5 text-white/50">
                          {category?.name ?? "—"}
                        </td>
                        <td className="py-5 text-white/50">
                          {product.sku || "—"}
                        </td>
                        <td className="py-5">
                          BND {Number(product.price).toFixed(2)}
                        </td>
                        <td className="py-5">
                          {product.track_stock
                            ? product.stock_quantity ?? 0
                            : "Not tracked"}
                        </td>
                        <td className="py-5">
  <span
    className={
      !product.is_active
        ? "text-white/40"
        : product.track_stock &&
            (product.stock_quantity ?? 0) <= 0
          ? "text-red-400"
          : "text-[#C6F36B]"
    }
  >
    {!product.is_active
      ? "Hidden"
      : product.track_stock &&
          (product.stock_quantity ?? 0) <= 0
        ? "Sold Out"
        : "Active"}
  </span>
</td>
                        <td className="py-5">
                          <button
                            type="button"
                            onClick={() => startEditing(product)}
                            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold transition hover:border-[#C6F36B] hover:text-[#C6F36B]"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
