
"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useCart } from "../../CartContext";
import { getGameFields, validateGameFields } from "@/lib/game-fields";
import { getOrderMethod, whatsappOrderUrl } from "@/lib/whatsapp-order";
import StoreHeader from "../../StoreHeader";
import ProductArtwork from "../../ProductArtwork";
import { useShopStatus } from "../../ShopStatus";
import { shopStatusMessage } from "@/lib/shop-status";

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
  product_type_id: string | null;
  metadata: unknown;
};

export default function ProductPage() {
  const { addItem } = useCart();
  const { status, canOrder, checking, refresh } = useShopStatus();

  const { slug } = useParams<{ slug: string }>();
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
    let active = true;
    async function loadProduct() {
      try {
        if (!slug) return;

        setLoading(true);
        setProduct(null);
        setCategoryName("");
        setError("");
        setPlayerId("");
        setZoneId("");
        setQuantity(1);
        setCartMessage("");
        setCartError("");

        const { data, error } = await supabase
          .from("products")
          .select(
            "id, name, slug, description, image_url, price, compare_at_price, track_stock, stock_quantity, category_id, product_type_id, metadata"
          )
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (!active) return;

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

        if (data.category_id && data.product_type_id) {
          const [{ data: category, error: categoryError }, { data: productType, error: typeError }] = await Promise.all([supabase
            .from("categories")
            .select("name")
            .eq("id", data.category_id)
            .eq("is_active", true)
            .maybeSingle(),
            supabase.from("product_types").select("id").eq("id", data.product_type_id).eq("category_id", data.category_id).eq("is_active", true).maybeSingle(),
          ]);
          if (!active) return;
          if (categoryError || typeError || !category || !productType) {
            setProduct(null);
            setError("This product is unavailable.");
            setLoading(false);
            return;
          }
          setProduct(data);
          setCategoryName(category.name);
        } else {
          setProduct(null);
          setError("This product is unavailable.");
        }

      } catch {
        if (active) { setProduct(null); setError("Unable to load this product. Please try again."); }
      } finally { if (active) setLoading(false); }
    }

    loadProduct();
    return () => { active = false; };
  }, [slug]);

  const fields = getGameFields(categoryName);
  const whatsappOrder = getOrderMethod(product?.metadata) === "whatsapp";
  const validation = validateGameFields(categoryName, { playerId, zoneId });

  const soldOut =
    product?.track_stock === true &&
    Number(product.stock_quantity ?? 0) <= 0;

  async function handleAddToCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!product || soldOut) return;
    if (!canOrder || checking) { setCartError(shopStatusMessage(status)); return; }

    setCartMessage("");
    setCartError("");

    const validation = validateGameFields(categoryName, { playerId, zoneId });
    if (!validation.values) {
      setCartError(validation.error!);
      return;
    }

    const freshStatus = await refresh();
    if (freshStatus !== "open") { setCartError(shopStatusMessage(freshStatus)); return; }

    if (whatsappOrder) {
      const order = whatsappOrderUrl(product, categoryName, validation.values, quantity);
      if (!order.url) {
        setCartError(order.error!);
        return;
      }
      // Navigate after the fresh status check without relying on an async popup.
      window.location.assign(order.url);
      return;
    }

    const result = addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.image_url,
      unitPrice: Number(product.price),
      quantity,
      categoryName,
      ...validation.values,
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
    <main className="storefront store-product">
      <StoreHeader variant="interior" />
      <div className="store-container store-page-content">


        {loading ? (
          <p role="status" className="py-20 text-center text-white/50">
            Loading product...
          </p>
        ) : error || !product ? (
          <div className="py-20 text-center">
            <h1 className="text-2xl font-black uppercase">
              Product unavailable
            </h1>
            <p role="alert" className="mt-3 text-sm text-white/50">
              {error || "This product could not be found."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <button type="button" onClick={() => window.location.reload()} className="store-action">Try again</button>
              <Link href="/#games" className="store-action">Explore games</Link>
            </div>
          </div>
        ) : (
          <div className="mt-7 grid items-start gap-5 md:grid-cols-[1fr_0.92fr] md:gap-8">
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[#191A1F] shadow-[0_20px_70px_rgba(0,0,0,0.2)]">
              <ProductArtwork src={product.image_url} name={product.name} loading="eager" />
            </div>

            <div className="rounded-[22px] border border-white/10 bg-[#191A1F] p-5 sm:p-6">
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
                {!fields && <p role="alert">Account fields are not configured for this game.</p>}
                {fields?.map((field) => (
                  <div key={field.key}>
                    <label htmlFor={`account-${field.key}`} className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/60">
                      {field.label}
                    </label>
                    <input id={`account-${field.key}`} type="text" required maxLength={field.maxLength}
                      inputMode={field.detailKey === "phone_number" ? "tel" : "text"}
                      value={field.key === "playerId" ? playerId : zoneId}
                      onChange={(event) => field.key === "playerId" ? setPlayerId(event.target.value) : setZoneId(event.target.value)}
                      placeholder={`Enter your ${field.label}`}
                      className="w-full rounded-xl border border-white/10 bg-[#202020] px-4 py-3 text-sm text-white outline-none focus:border-[#C6F36B]" />
                  </div>
                ))}

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Quantity</p>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
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
                      type="button" aria-label="Increase quantity"
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
                  <div role="status" className="rounded-xl border border-[#C6F36B]/20 bg-[#C6F36B]/10 p-4 text-sm text-[#C6F36B]">
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
                  <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                    {cartError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={soldOut || !canOrder || checking || !fields || (whatsappOrder && !validation.values)}
                  className="w-full rounded-xl bg-[#C6F36B] px-6 py-4 text-sm font-black uppercase tracking-wider text-[#171717] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {soldOut ? "Sold Out" : checking ? "Checking availability…" : !canOrder ? status === "closed" ? "Temporarily Closed" : "Ordering unavailable" : whatsappOrder ? "Order via WhatsApp" : "Add to Cart"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
