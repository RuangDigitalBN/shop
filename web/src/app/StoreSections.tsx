"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionHeading, StoreStatus } from "./StoreUI";
import StoreIcon from "./StoreIcons";
import { supabase } from "@/lib/supabase";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

type ProductType = { id: string; category_id: string; name: string; slug: string };

type Product = {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  product_type_id: string | null;
  description: string | null;
  image_url: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  track_stock: boolean | null;
  stock_quantity: number | null;
  sort_order: number | null;
};

const gameGradients = [
  "from-[#7137B8]/20 via-[#241B31] to-[#101114]",
  "from-[#a66a32]/20 via-[#51331f] to-[#101114]",
  "from-[#c94d28]/20 via-[#67271e] to-[#101114]",
  "from-[#64717c]/20 via-[#343c43] to-[#101114]",
  "from-[#315b86]/20 via-[#20334a] to-[#101114]",
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
    <section id="games" className="store-container store-section">
      <SectionHeading eyebrow="Find your game top-up here" action={<a href="#popular">View All →</a>}>Categories</SectionHeading>

      {loading ? (
        <StoreStatus>Loading games...</StoreStatus>
      ) : error ? (
        <StoreStatus error>{error}</StoreStatus>
      ) : games.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[#202020] p-6 text-sm text-white/45">
          No games are available at the moment. Please check back soon.
        </p>
      ) : (
        <div className="store-category-grid">
          {games.map((game, index) => <CategoryTile key={game.id} game={game} index={index} />)}
        </div>
      )}
    </section>
  );
}

export function PopularProductsSection() {
  const searchParams = useSearchParams();
  const selectedGame = searchParams.get("game");
  const selectedType = searchParams.get("type");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadStorefront() {
      const [productsResult, categoriesResult, typesResult] = await Promise.all([
        supabase
          .from("products")
          .select(
  "id, name, slug, category_id, product_type_id, description, image_url, price, compare_at_price, track_stock, stock_quantity, sort_order"
          )
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase
          .from("categories")
          .select("id, name, slug, description")
          .eq("is_active", true).order("sort_order").order("name"),
        supabase.from("product_types").select("id, category_id, name, slug").eq("is_active", true).order("sort_order").order("name"),
      ]);

      if (productsResult.error || categoriesResult.error || typesResult.error) {
        setError("Unable to load products right now.");
      } else {
        const activeGames = new Set((categoriesResult.data ?? []).map((game) => game.id));
        const activeTypes = new Map((typesResult.data ?? []).map((type) => [type.id, type]));
        setProducts((productsResult.data ?? []).filter((product) =>
          product.category_id && activeGames.has(product.category_id) &&
          product.product_type_id && activeTypes.get(product.product_type_id)?.category_id === product.category_id
        ));
        setProductTypes(typesResult.data ?? []);
        setCategories(categoriesResult.data ?? []);
      }

      setLoading(false);
    }

    loadStorefront();
  }, []);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  // The first product in each category's existing sort order gets the editable Popular marker.
  const popularProductIds = new Set<string>();
  const seenCategoryIds = new Set<string>();
  for (const product of products) {
    if (product.category_id && !seenCategoryIds.has(product.category_id)) {
      seenCategoryIds.add(product.category_id);
      popularProductIds.add(product.id);
    }
  }
  const selectedCategory = categories.find(
  (category) => category.slug === selectedGame
);

  const visibleTypes = productTypes.filter((type) => type.category_id === selectedCategory?.id);
  const selectedProductType = visibleTypes.find((type) => type.slug === selectedType);
  const visibleProducts = products.filter((product) =>
    (!selectedGame || product.category_id === selectedCategory?.id) &&
    (!selectedType || (!!selectedGame && product.product_type_id === selectedProductType?.id))
  );

  function filterHref(game: string | null, type: string | null = null) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("game");
    params.delete("type");
    if (game) params.set("game", game);
    if (game && type) params.set("type", type);
    return `/${params.size ? `?${params}` : ""}#popular`;
  }

  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const searchedProducts = query ? visibleProducts.filter((product) => [product.name, product.description, product.category_id ? categoryNames.get(product.category_id) : ""].some((value) => value?.toLowerCase().includes(query))) : visibleProducts;

  return (
    <section id="popular" className="store-container store-section">
      <SectionHeading eyebrow="Top-ups & digital essentials" action={<Link href="/#popular">View All →</Link>}>Popular Products</SectionHeading>
      {query && <p className="store-search-result">Search: “{searchParams.get("q")}” · {searchedProducts.length} results <Link href="/#popular">Clear search</Link></p>}
      <div className="store-filters" aria-label="Filter products by game">
  <Link
    href={filterHref(null)}
    scroll={false}
    aria-current={!selectedGame ? "true" : undefined}
    className={`shrink-0 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
      !selectedGame
        ? "border-[#C6F36B] bg-[#C6F36B] text-[#171717]"
        : "border-white/15 text-white/55 hover:border-[#C6F36B] hover:text-[#C6F36B]"
    }`}
  >
    All Games
  </Link>

  {categories.map((category) => (
    <Link
      key={category.id}
      href={filterHref(category.slug)}
      scroll={false}
      aria-current={selectedGame === category.slug ? "true" : undefined}
        className={`shrink-0 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
        selectedGame === category.slug
          ? "border-[#C6F36B] bg-[#C6F36B] text-[#171717]"
          : "border-white/15 text-white/55 hover:border-[#C6F36B] hover:text-[#C6F36B]"
      }`}
    >
      {category.name}
    </Link>
  ))}
</div>
      {selectedCategory && visibleTypes.length > 0 && (
        <div className="store-filters" aria-label={`Product Types for ${selectedCategory.name}`}>
          {[{ id: "all", slug: "", name: "All Types" }, ...visibleTypes].map((type) => {
            const selected = type.slug ? selectedType === type.slug : !selectedType;
            return <Link key={type.id} href={filterHref(selectedCategory.slug, type.slug || null)} scroll={false} aria-current={selected ? "true" : undefined} className={`shrink-0 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${selected ? "border-[#C6F36B] bg-[#C6F36B] text-[#171717]" : "border-white/15 text-white/55 hover:border-[#C6F36B] hover:text-[#C6F36B]"}`}>{type.name}</Link>;
          })}
        </div>
      )}

      {loading ? (
        <StoreStatus>Loading products...</StoreStatus>
      ) : error ? (
        <StoreStatus error>{error}</StoreStatus>
      ) : searchedProducts.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-[#202020] p-6 text-sm text-white/45">
          {query ? "No products match your search. Try another game or product." : "New products are coming soon. Please check back later."}
        </p>
      ) : (

<div className="flex flex-col gap-3">
  {searchedProducts.map((product, index) => {
    const categoryName = product.category_id
      ? categoryNames.get(product.category_id)
      : undefined;

    const soldOut =
      product.track_stock === true &&
      Number(product.stock_quantity ?? 0) <= 0;
    const isPopular = popularProductIds.has(product.id);

    return (
      <a
        href={`/products/${product.slug}`}
        key={product.id}
        className={`store-product-row group flex items-center gap-3 rounded-2xl border p-3 transition hover:border-[#C6F36B]/40 hover:bg-[#1D1E24] sm:gap-4 sm:p-3.5 ${
          isPopular
            ? "border-white/10 bg-[#191A1F]"
            : "border-white/10 bg-[#191A1F]"
        }`}
      >
        <div
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${
            productGradients[index % productGradients.length]
          } sm:h-14 sm:w-14`}
        >
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="text-2xl font-black italic text-white/25">
              {product.name.slice(0, 3).toUpperCase()}
            </span>
          )}
        </div>

        <div className="store-product-info min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#C6F36B]">
              {categoryName ?? "DIGITAL"}
            </p>
            {isPopular && (
              <span className="rounded-full border border-[#C6F36B]/20 bg-[#C6F36B]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#C6F36B]">
                Popular
              </span>
            )}
          </div>

          <h3 className="mt-1 text-sm font-black uppercase tracking-tight text-[#F2F0E9] sm:text-base">
            {product.name}
          </h3>

          {product.description && (
            <p className="mt-1 line-clamp-1 text-xs text-white/40 sm:line-clamp-2">
              {product.description}
            </p>
          )}

          {soldOut && (
            <span className="mt-2 inline-block rounded-full bg-red-500/15 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-red-400">
              Sold out
            </span>
          )}
        </div>

        <div className="store-product-price flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="text-right">
            <p className="text-[8px] font-bold uppercase tracking-wider text-white/35 sm:text-[9px]">
              Price
            </p>

            <p className="mt-1 text-xs font-black text-[#C6F36B] sm:text-sm">
              {formatPrice(product.price)}
            </p>

            {product.compare_at_price !== null &&
              Number(product.compare_at_price) > Number(product.price) && (
                <p className="text-[9px] text-white/35 line-through">
                  {formatPrice(product.compare_at_price)}
                </p>
              )}
          </div>

          <span className="store-row-action"><StoreIcon name="cart" size={18} />{soldOut ? "View" : "Add"}</span>
        </div>
      </a>
    );
  })}
</div>

      )}
    </section>
  );
}

function CategoryTile({ game, index }: { game: Category; index: number }) {
  const name = game.name.toLowerCase();
  const symbol = name.includes("mobile legends") ? "ML" : name.includes("pubg") ? "PUBG" : name.includes("valorant") ? "V" : name.includes("free fire") ? "F" : name.includes("steam") ? "◉" : name.includes("roblox") ? "◇" : "✦";
  return <a href={`/?game=${game.slug}#popular`} className={`store-category bg-gradient-to-br ${gameGradients[index % gameGradients.length]}`}>
    <span className={`store-game-symbol store-game-symbol-${name.includes("valorant") || name.includes("free fire") ? "red" : name.includes("steam") || symbol === "✦" ? "white" : "gold"}`} aria-hidden="true">{symbol}</span><h3>{game.name}</h3>
  </a>;
}
