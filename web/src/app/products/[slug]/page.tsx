
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCart } from "../../CartContext";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  track_stock: boolean | null;
  stock_quantity: number | null;
  category_id: string | null;
};

export default function ProductPage() {
  const { addItem, itemCount } = useCart();

  const [slug, setSlug] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");
  const [cartError, setCartError] = useState("");

  useEffect(() => {
    const currentSlug = window.location.pathname.split("/").pop() ?? "";
    setSlug(currentSlug);
  }, []);

  useEffect(() => {
    async function loadProduct() {
      if (!slug) return;

      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, description, image_url, price, compare_at_price, track_stock, stock_quantity, category_id"
        )
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        setError("Unable to load this product. Please try again.");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("This product could not be found.");
        setLoading(false);
        return;
      }

      setProduct(data);

      if (data.category_id) {
        const { data: category } = await supabase
          .from("categories")
          .select("name")
          .eq("id", data.category_id)
          .maybeSingle();

        setCategoryName(category?.name ?? "");
      }

      setLoading(false);
    }

    loadProduct();
  }, [slug]);

  const soldOut =
    product?.track_stock === true &&
    Number(product.stock_quantity ?? 0) <= 0;

  function handleAddToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!product) return;

    setCartMessage("");
    setCartError("");

    if (!playerId.trim() || !zoneId.trim()) {
      setCartError("Please enter both your Player ID and Server ID.");
      return;
    }

    const result = addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.image_url,
      unitPrice: Number(product.price),
      quantity,
      playerId: playerId.trim(),
      zoneId: zoneId.trim(),
      trackStock: product.track_stock === true,
      stockQuantity: product.stock_quantity,
    });

    if (result.success) {
      setCartMessage("Added to your cart successfully!");
    } else {
      setCartError(result.message);
    }
  }

  return (
    <main className="min-h-screen bg-[#171717] px-5 py-10 text-[#F2F0E9] sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-widest text-[#C6F36B] hover:text-white"
          >
            ← Back to store
          </Link>

          <Link
            href="/cart"
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold transition hover:border-[#C6F36B] hover:text-[#C6F36B]"
          >
            Cart ({itemCount})
          </Link>
        </div>

        {loading ? (
          <p className="py-20 text-center text-white/50">
            Loading product...
          </p>
        ) : error || !product ? (
          <div className="py-20 text-center">
            <h1 className="text-2xl font-black uppercase">
              Product unavailable
            </h1>
            <p className="mt-3 text-sm text-white/50">
              {error || "This product could not be found."}
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-14">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#202020]">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-6xl font-black italic text-white/15">
                  {product.name.slice(0, 3).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#C6F36B]">
                {categoryName || "Digital product"}
              </p>

              <h1 className="mt-4 text-3xl font-black uppercase tracking-tight sm:text-5xl">
                {product.name}
              </h1>

              {product.description && (
                <p className="mt-5 whitespace-pre-line text-sm leading-7 text-white/55">
                  {product.description}
                </p>
              )}

              <div className="mt-8 border-y border-white/10 py-6">
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                  Price
                </p>

                <p className="mt-2 text-3xl font-black text-[#C6F36B]">
                  BND {Number(product.price).toFixed(2)}
                </p>

                {product.compare_at_price !== null &&
                  Number(product.compare_at_price) >
                    Number(product.price) && (
                    <p className="mt-1 text-sm text-white/35 line-through">
                      BND {Number(product.compare_at_price).toFixed(2)}
                    </p>
                  )}
              </div>

              <div className="mt-6">
                {soldOut ? (
                  <p className="inline-block rounded-full bg-red-500/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-red-400">
                    Sold out
                  </p>
                ) : (
                  <p className="inline-block rounded-full bg-[#C6F36B]/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-[#C6F36B]">
                    Available
                  </p>
                )}
              </div>

              <form onSubmit={handleAddToCart} className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
                    Player ID
                  </label>

                  <input
                    type="text"
                    required
                    value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                    placeholder="Enter your Player ID"
                    className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
                    Server ID (Zone ID)
                  </label>

                  <input
                    type="text"
                    required
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    placeholder="Enter your Server ID"
                    className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
                    Quantity
                  </label>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((current) => Math.max(1, current - 1))
                      }
                      className="h-11 w-11 rounded-xl border border-white/10 bg-[#202020] text-lg"
                    >
                      −
                    </button>

                    <span className="min-w-10 text-center font-black">
                      {quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((current) =>
                          product.track_stock
                            ? Math.min(
                                Number(product.stock_quantity ?? 0),
                                current + 1
                              )
                            : current + 1
                        )
                      }
                      disabled={
                        soldOut ||
                        (product.track_stock === true &&
                          quantity >= Number(product.stock_quantity ?? 0))
                      }
                      className="h-11 w-11 rounded-xl border border-white/10 bg-[#202020] text-lg disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/40">
                    Estimated total
                  </p>

                  <p className="mt-2 text-2xl font-black text-[#C6F36B]">
                    BND {(Number(product.price) * quantity).toFixed(2)}
                  </p>
                </div>

                {cartMessage && (
                  <div className="rounded-xl border border-[#C6F36B]/20 bg-[#C6F36B]/10 p-4 text-sm text-[#C6F36B]">
                    {cartMessage}
                    <Link
                      href="/cart"
                      className="ml-2 font-black underline underline-offset-4"
                    >
                      View cart →
                    </Link>
                  </div>
                )}

                {cartError && (
                  <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                    {cartError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={soldOut}
                  className="w-full rounded-xl bg-[#C6F36B] px-6 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {soldOut ? "Sold Out" : "Add to Cart"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
