"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  description: string | null;
  image_url: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  track_stock: boolean | null;
  stock_quantity: number | null;
  sort_order: number | null;
};

const gameGradients = [
  "from-[#5943a5] via-[#30265c] to-[#171717]",
  "from-[#a66a32] via-[#51331f] to-[#171717]",
  "from-[#c94d28] via-[#67271e] to-[#171717]",
  "from-[#64717c] via-[#343c43] to-[#171717]",
  "from-[#315b86] via-[#20334a] to-[#171717]",
];

const productGradients = [
  "from-[#7861cf] to-[#292044]",
  "from-[#c27b3c] to-[#49301e]",
  "from-[#d65a37] to-[#54251f]",
  "from-[#4779a5] to-[#202e43]",
];

function formatPrice(price: number | string) {
  return `BND ${Number(price).toFixed(2)}`;
}

export function GamesSection() {
  const [games, setGames] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadGames() {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        setError("Unable to load games right now.");
      } else {
        setGames(data ?? []);
      }

      setLoading(false);
    }

    loadGames();
  }, []);

  return (
    <section id="games" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#C6F36B]">
            Find your next move
          </p>
          <h2 className="text-3xl font-black uppercase tracking-[-0.055em] sm:text-5xl">
            Choose your <span className="text-white/35">game.</span>
          </h2>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
          01 / GAME DIRECTORY
        </span>
      </div>

      {loading ? (
        <p className="py-8 text-sm text-white/45">Loading games...</p>
      ) : error ? (
        <p className="py-8 text-sm text-red-400">{error}</p>
      ) : games.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[#202020] p-6 text-sm text-white/45">
          No games are available at the moment. Please check back soon.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {games.map((game, index) => (
            <a
              key={game.id}
              href={`/?game=${game.slug}#popular`}
              className={`group relative flex min-h-52 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${
                gameGradients[index % gameGradients.length]
              } p-5 transition duration-300 hover:-translate-y-1 hover:border-[#C6F36B]/60`}
            >
              <span className="absolute -right-5 -top-7 text-8xl font-black italic text-white/[0.07] transition group-hover:scale-110">
                {game.name.slice(0, 4).toUpperCase()}
              </span>
              <div className="relative flex items-center justify-between">
                <span className="text-[9px] font-black tracking-widest text-white/50">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-lg text-[#C6F36B]">↗</span>
              </div>
              <div className="relative">
                <p className="mb-2 text-[9px] font-black tracking-[0.16em] text-white/45">
                  GAME DIRECTORY
                </p>
                <h3 className="text-lg font-black uppercase leading-tight tracking-tight">
                  {game.name}
                </h3>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export function PopularProductsSection() {
      const [selectedGame, setSelectedGame] = useState<string | null>(null);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  setSelectedGame(params.get("game"));
}, []);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStorefront() {
      const [productsResult, categoriesResult] = await Promise.all([
        supabase
          .from("products")
          .select(
  "id, name, slug, category_id, description, image_url, price, compare_at_price, track_stock, stock_quantity, sort_order"
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase
          .from("categories")
          .select("id, name, slug, description")
          .eq("is_active", true),
      ]);

      if (productsResult.error || categoriesResult.error) {
        setError("Unable to load products right now.");
      } else {
        setProducts(productsResult.data ?? []);
        setCategories(categoriesResult.data ?? []);
      }

      setLoading(false);
    }

    loadStorefront();
  }, []);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const selectedCategory = categories.find(
  (category) => category.slug === selectedGame
);

const visibleProducts = selectedGame
  ? products.filter(
      (product) => product.category_id === selectedCategory?.id
    )
  : products;

  return (
    <section id="popular" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#C6F36B]">
            Level up your experience
          </p>
          <h2 className="text-3xl font-black uppercase tracking-[-0.055em] sm:text-5xl">
            Popular <span className="text-white/35">right now.</span>
          </h2>
        </div>
        <a
          href="#games"
          className="text-[10px] font-black uppercase tracking-widest text-[#C6F36B] hover:text-white"
        >
          Browse games ↗
        </a>
      </div>
      <div className="mb-7 flex flex-wrap gap-2">
  <button
    type="button"
    onClick={() => setSelectedGame(null)}
    className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
      selectedGame === null
        ? "border-[#C6F36B] bg-[#C6F36B] text-[#171717]"
        : "border-white/15 text-white/55 hover:border-[#C6F36B] hover:text-[#C6F36B]"
    }`}
  >
    All Games
  </button>

  {categories.map((category) => (
    <button
      key={category.id}
      type="button"
      onClick={() => setSelectedGame(category.slug)}
      className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
        selectedGame === category.slug
          ? "border-[#C6F36B] bg-[#C6F36B] text-[#171717]"
          : "border-white/15 text-white/55 hover:border-[#C6F36B] hover:text-[#C6F36B]"
      }`}
    >
      {category.name}
    </button>
  ))}
</div>

      {loading ? (
        <p className="py-8 text-sm text-white/45">Loading products...</p>
      ) : error ? (
        <p className="py-8 text-sm text-red-400">{error}</p>
      ) : visibleProducts.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[#202020] p-6 text-sm text-white/45">
          New products are coming soon. Please check back later.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleProducts.map((product, index) => {
            const categoryName = product.category_id
              ? categoryNames.get(product.category_id)
              : undefined;
            const soldOut =
              product.track_stock === true &&
              Number(product.stock_quantity ?? 0) <= 0;

            return (
              <a
                href={`/products/${product.slug}`}
                key={product.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-[#202020] transition hover:-translate-y-1 hover:border-[#C6F36B]/50"
              >
                <div
                  className={`relative flex h-40 items-center justify-center overflow-hidden bg-gradient-to-br ${
                    productGradients[index % productGradients.length]
                  }`}
                >
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <span className="relative text-5xl font-black italic text-white/20">
                      {product.name.slice(0, 3).toUpperCase()}
                    </span>
                  )}

                  <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-[8px] font-black tracking-widest text-white/80">
                    DIGITAL PRODUCT
                  </span>

                  {soldOut && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-red-500 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-white">
                      Sold out
                    </span>
                  )}
                </div>

                <div className="p-5">
                  <p className="text-[9px] font-black tracking-[0.16em] text-[#C6F36B]">
                    {categoryName ?? "DIGITAL"}
                  </p>
                  <h3 className="mt-2 text-sm font-black uppercase tracking-tight">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/40">
                      {product.description}
                    </p>
                  )}
                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                        From
                      </p>
                      <p className="mt-1 text-sm font-black text-[#F2F0E9]">
                        {formatPrice(product.price)}
                      </p>
                      {product.compare_at_price !== null &&
                        Number(product.compare_at_price) > Number(product.price) && (
                          <p className="text-[10px] text-white/35 line-through">
                            {formatPrice(product.compare_at_price)}
                          </p>
                        )}
                    </div>
                    <span className="text-lg text-[#C6F36B] transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
