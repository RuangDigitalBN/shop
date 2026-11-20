
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import BulkProducts from "./BulkProducts";
import BulkEditProducts from "./BulkEditProducts";
import { readAllProducts, duplicateProduct, exportProductsCsv, groupProducts, type AdminProduct as Product, type Game as Category, type ProductType } from "@/lib/admin-products";
import CatalogNav from "../CatalogNav";
import { supabase } from "@/lib/supabase";
import { getOrderMethod, withOrderMethod, type OrderMethod } from "@/lib/whatsapp-order";

const emptyForm = {
  sort_order: "0",
  order_method: "normal_checkout" as OrderMethod,
  name: "",
  slug: "",
  category_id: "",
  product_type_id: "",
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

export default function ProductsPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [catalogReady, setCatalogReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ReturnType<typeof duplicateProduct> | null>(null);
  const [filters, setFilters] = useState({ game: "", type: "", status: "", search: "", sort: "order" });
  const groups = groupProducts(products, categories, productTypes, filters);

  useEffect(() => () => { if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  async function loadData() {
    setError("");

    const [productResult, categoryResult, typeResult] = await Promise.all([
      readAllProducts((from, to) => supabase
        .from("products")
        .select(
          "id, category_id, product_type_id, name, slug, sku, description, image_url, price, compare_at_price, stock_quantity, track_stock, is_active, metadata, sort_order"
        )
        .order("id").range(from, to)),

      supabase
        .from("categories")
        .select("id, name, is_active")
        .order("sort_order", { ascending: true }),
      supabase.from("product_types").select("id, category_id, name, is_active").order("sort_order").order("name"),
    ]);

    if (typeResult.error) { setError(typeResult.error.message); }
    else { setProductTypes(typeResult.data ?? []); }

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
    setCatalogReady(!productResult.error && !categoryResult.error && !typeResult.error);
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
    setDuplicate(null);
    setEditingId(product.id);
    setSlugEdited(true);
    setImageFile(null);
    setImagePreview(product.image_url);

    setForm({
      sort_order: product.sort_order == null ? "" : String(product.sort_order),
      order_method: getOrderMethod(product.metadata),
      name: product.name,
      slug: product.slug,
      category_id: product.category_id ?? "",
      product_type_id: product.product_type_id ?? "",
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
    setDuplicate(null);
    setEditingId(null);
    setForm(emptyForm);
    setSlugEdited(false);
    setImageFile(null);
    setImagePreview(null);
    setError("");
    setSuccess("");
  }

  function startDuplicate(product: Product) {
    const draft = duplicateProduct(product);
    startEditing(product);
    setEditingId(null);
    setDuplicate(draft);
    setSlugEdited(false);
    setForm(previous => ({ ...previous, name: "", slug: "", sku: "" }));
  }

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([exportProductsCsv(products)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "ruang-products-v1.csv";
    link.click(); URL.revokeObjectURL(url);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

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
    const sortOrder = form.sort_order.trim() ? Number(form.sort_order) : null;

    if (sortOrder !== null && (!Number.isSafeInteger(sortOrder) || sortOrder < 0)) {
      setError("Sort order must be a whole number of zero or more."); setSaving(false); return;
    }
    if (products.some(p => p.id !== editingId && (p.slug === cleanSlug ||
      (duplicate && p.name.trim().toLowerCase() === cleanName.toLowerCase())))) {
      setError("Please use a unique product name and URL slug."); setSaving(false); return;
    }

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

    const selectedType = productTypes.find((type) => type.id === form.product_type_id);
    if ((form.is_active && (!form.category_id || !form.product_type_id)) ||
        (form.product_type_id && (!selectedType || selectedType.category_id !== form.category_id))) {
      setError("Choose a Product Type belonging to the selected Game. Active products require both.");
      setSaving(false);
      return;
    }

    let previousMetadata: unknown = duplicate?.metadata ?? null;

    if (editingId) {
      const { data: currentProduct, error: currentProductError } =
        await supabase
          .from("products")
          .select("image_url, metadata")
          .eq("id", editingId)
          .maybeSingle();

      if (currentProductError || !currentProduct) {
        setError(
          "Could not check the existing product: " +
            (currentProductError?.message ?? "Product not found.")
        );
        setSaving(false);
        return;
      }

      previousMetadata = currentProduct.metadata;
    }

    const productData = {
      sort_order: sortOrder,
      ...(!editingId && duplicate ? { image_url: duplicate.image_url } : {}),
      metadata: withOrderMethod(previousMetadata, form.order_method),
      name: cleanName,
      slug: cleanSlug,
      category_id: form.category_id || null,
      product_type_id: form.product_type_id || null,
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

      // Images can now be shared by other products. Retain old files rather than
      // racing a client-side reference check against another admin's save.
    }

    setSuccess(
      (editingId
        ? "Product updated successfully."
        : "Product added successfully.")
    );

    setForm(emptyForm);
    setEditingId(null);
    setDuplicate(null);
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
      <CatalogNav />

      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#C6F36B]">
          Store management
        </p>

        <div className="mt-3">
          <h1 className="text-4xl font-black">Products.</h1>
          <p className="mt-2 text-sm text-white/50">
            Manage your store products, pricing and stock.
          </p>
          <nav aria-label="Product management sections" className="mt-4 flex flex-wrap gap-4 text-sm underline underline-offset-4">
            <a href="#product-catalog">Browse products</a>
            <a href="#single-product-editor">Add / edit one product</a>
            <a href="#bulk-tools">Bulk Add / CSV preview</a>
          </nav>
        </div>

        <div id="single-product-editor" className="mt-10 scroll-mt-4 rounded-2xl border border-white/10 bg-[#262626] p-6 md:p-8">
          <h2 className="text-xl font-bold">
            {editingId ? "Edit product" : duplicate ? "Duplicate product — enter a new name and slug" : "Add new product"}
          </h2>

          <p className="mt-1 text-sm text-white/40">
            {editingId
              ? "Update your existing product details."
              : "Add a new product to your store."}
          </p>

          <form onSubmit={handleSave} className="mt-8 space-y-6">
            <fieldset disabled={saving || !catalogReady} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-bold">
                Product image
              </label>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#171717]">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Product previews support local object URLs.
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
                  Game
                </label>
                <select
                  aria-label="Game"
                  required={form.is_active}
                  value={form.category_id}
                  onChange={(e) =>
                    setForm((previous) => ({ ...previous, category_id: e.target.value, product_type_id: "" }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]"
                >
                  <option value="">Choose a game</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}{!category.is_active ? " (Hidden)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="product-type" className="mb-2 block text-sm font-bold">Product Type {form.is_active ? "*" : "(optional for inactive products)"}</label>
                <select id="product-type" required={form.is_active} disabled={!form.category_id} value={form.product_type_id} onChange={(e) => updateField("product_type_id", e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]">
                  <option value="">Choose a Product Type</option>
                  {productTypes.filter((type) => type.category_id === form.category_id).map((type) => <option key={type.id} value={type.id}>{type.name}{!type.is_active ? " (Hidden)" : ""}</option>)}
                </select>
                <p className="mt-2 text-xs text-white/40">Hidden games and types stay editable, but their products are hidden from customers. <a className="underline" href="/admin/product-types">Manage Product Types</a></p>
              </div>

              <div>
                <label htmlFor="order-method" className="mb-2 block text-sm font-bold">Order method</label>
                <select id="order-method" value={form.order_method}
                  onChange={(e) => updateField("order_method", e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3 text-sm outline-none focus:border-[#C6F36B]">
                  <option value="normal_checkout">Normal Checkout</option>
                  <option value="whatsapp">WhatsApp Order</option>
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

              <label className="block text-sm font-bold">Sort order
                <input aria-label="Sort order" type="number" min="0" step="1" value={form.sort_order} onChange={e => updateField("sort_order", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#171717] px-4 py-3" />
                <span className="mt-2 block text-xs font-normal text-white/50">Lower numbers appear first within the Game / Product Type. Blank keeps the order unset. Admin ties use name.</span>
              </label>

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

              {(editingId || duplicate) && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-xl border border-white/10 px-6 py-3 text-sm font-bold hover:border-white/30"
                >
                  Cancel Editing
                </button>
              )}
            </div>
            </fieldset>
          </form>
        </div>

        {!loading && !catalogReady && <button type="button" onClick={() => { void loadData(); }} className="mt-6 rounded-lg border border-white/20 px-4 py-3">Retry catalog loading</button>}
        {catalogReady && <BulkProducts products={products} games={categories} types={productTypes} onCreated={loadData} />}

        <div id="product-catalog" className="mt-10 scroll-mt-4 rounded-2xl border border-white/10 bg-[#262626] p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold">All products</h2>
            <span className="text-xs text-white/40">
              {products.length} products
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm">Game<select aria-label="Filter Game" className="mt-1 w-full rounded-lg bg-[#171717] p-3" value={filters.game} onChange={e => setFilters(f => ({ ...f, game: e.target.value, type: "" }))}>
              <option value="">All games</option>{categories.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></label>
            <label className="text-sm">Product Type<select aria-label="Filter Product Type" className="mt-1 w-full rounded-lg bg-[#171717] p-3" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
              <option value="">All types</option>{productTypes.filter(t => !filters.game || t.category_id === filters.game).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
            <label className="text-sm">Status<select className="mt-1 w-full rounded-lg bg-[#171717] p-3" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="sold_out">Sold Out</option>
            </select></label>
            <label className="text-sm">Search<input type="search" className="mt-1 w-full rounded-lg bg-[#171717] p-3" placeholder="Name, slug, SKU…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></label>
            <label className="text-sm">Sort within type<select className="mt-1 w-full rounded-lg bg-[#171717] p-3" value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}>
              <option value="order">Product sort order</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
            </select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setFilters({ game: "", type: "", status: "", search: "", sort: "order" })} className="rounded-lg border border-white/20 px-4 py-3 text-sm">Clear filters</button>
            <button type="button" disabled={!catalogReady} onClick={downloadCsv} className="rounded-lg border border-white/20 px-4 py-3 text-sm disabled:opacity-50">Export all products (CSV)</button>
            <p className="text-sm text-white/60" role="status">{groups.reduce((count, g) => count + g.products.length, 0)} shown / {products.length} total</p>
          </div>

          {!loading && <BulkEditProducts targets={groups.flatMap(group => group.products)} products={products} types={productTypes} disabled={!catalogReady || saving} onUpdated={loadData} />}

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
            <div className="mt-6 space-y-6">
              {groups.length === 0 && <p role="status">No products match these filters.</p>}
              {groups.map(group => <section key={group.key} className="space-y-3" aria-label={group.game + " / " + group.type}>
                <h3 className="border-b border-white/20 pb-3 font-bold">{group.game} → {group.type} <span className="text-sm font-normal text-white/50">({group.products.length})</span></h3>
                {group.products.map(product => <article key={product.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                  {product.image_url && <Image width={48} height={48} unoptimized src={product.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                  <div className="min-w-0">
                    <h4 className="break-words font-bold">{product.name}</h4>
                    <p className="mt-1 break-words text-sm text-white/60">{product.sku || "No SKU"} · BND {Number(product.price).toFixed(2)} · {product.track_stock ? "Stock: " + (product.stock_quantity ?? 0) : "Stock not tracked"}</p>
                    <p className="mt-1 text-xs text-white/60">Order {product.sort_order ?? "unset"} · {!product.is_active ? "Hidden" : product.track_stock && (product.stock_quantity ?? 0) <= 0 ? "Sold Out" : "Active"} · {getOrderMethod(product.metadata) === "whatsapp" ? "WhatsApp Order" : "Normal Checkout"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" disabled={saving} onClick={() => startEditing(product)} className="rounded-lg border border-white/20 px-4 py-3 text-sm font-bold disabled:opacity-50">Edit</button>
                    <button type="button" disabled={saving} onClick={() => startDuplicate(product)} className="rounded-lg border border-white/20 px-4 py-3 text-sm font-bold disabled:opacity-50">Duplicate</button>
                  </div>
                </article>)}
              </section>)}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
