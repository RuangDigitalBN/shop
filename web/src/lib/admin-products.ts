import { getOrderMethod, withOrderMethod, type OrderMethod } from "./whatsapp-order";

export type Game = { id: string; name: string; is_active: boolean };
export type ProductType = Game & { category_id: string };
export type AdminProduct = {
  id: string; category_id: string | null; product_type_id: string | null;
  name: string; slug: string; sku: string | null; description: string | null;
  image_url: string | null; price: number; compare_at_price: number | null;
  stock_quantity: number | null; track_stock: boolean; is_active: boolean;
  sort_order: number | null; metadata: unknown;
};
export type ProductDraft = Omit<AdminProduct, "id">;
export async function readAllProducts(fetchPage: (from: number, to: number) => PromiseLike<{ data: AdminProduct[] | null; error: { message: string } | null }>) {
  const products: AdminProduct[] = [];
  for (let from = 0; ; from += 500) {
    let result;
    try { result = await fetchPage(from, from + 499); }
    catch { return { data: null, error: { message: "Could not load the full catalog. Please retry." } }; }
    if (result.error) return { data: null, error: result.error };
    products.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < 500) return { data: products, error: null };
  }
}
export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const productStatus = (p: Pick<AdminProduct, "is_active" | "track_stock" | "stock_quantity">) =>
  !p.is_active ? "hidden" : p.track_stock && (p.stock_quantity ?? 0) <= 0 ? "sold_out" : "active";

export function groupProducts(products: AdminProduct[], games: Game[], types: ProductType[], filters: {
  game: string; type: string; status: string; search: string; sort: string;
}) {
  const search = filters.search.trim().toLowerCase();
  const filtered = products.filter(p => (!filters.game || p.category_id === filters.game) &&
    (!filters.type || p.product_type_id === filters.type) && (!filters.status || productStatus(p) === filters.status) &&
    (!search || [p.name, p.slug, p.sku, games.find(g => g.id === p.category_id)?.name,
      types.find(t => t.id === p.product_type_id)?.name].some(v => v?.toLowerCase().includes(search))));
  const groups = new Map<string, { key: string; game: string; type: string; products: AdminProduct[] }>();
  const rank = (id: string | null, entries: Game[]) => { const i = entries.findIndex(e => e.id === id); return i < 0 ? entries.length : i; };
  filtered.sort((a, b) => rank(a.category_id, games) - rank(b.category_id, games) ||
    rank(a.product_type_id, types) - rank(b.product_type_id, types) ||
    (filters.sort === "price_asc" ? a.price - b.price : filters.sort === "price_desc" ? b.price - a.price :
      (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const p of filtered) {
    const key = `${p.category_id ?? ""}/${p.product_type_id ?? ""}`;
    if (!groups.has(key)) groups.set(key, { key, game: games.find(g => g.id === p.category_id)?.name ?? "Unassigned game",
      type: types.find(t => t.id === p.product_type_id)?.name ?? "Untyped", products: [] });
    groups.get(key)!.products.push(p);
  }
  return [...groups.values()];
}

// Explicit allowlist: never carry IDs, timestamps or SKU into a new product.
export function duplicateProduct(p: AdminProduct): ProductDraft {
  return { category_id: p.category_id, product_type_id: p.product_type_id, name: "", slug: "", sku: null,
    description: p.description, image_url: p.image_url, price: p.price, compare_at_price: p.compare_at_price,
    stock_quantity: p.stock_quantity, track_stock: p.track_stock, is_active: p.is_active,
    sort_order: p.sort_order, metadata: withOrderMethod(p.metadata, getOrderMethod(p.metadata)) };
}

export function validateDraft(p: ProductDraft, games: Game[], types: ProductType[]): string[] {
  const errors: string[] = [];
  if (!p.name.trim() || !p.slug || slugify(p.slug) !== p.slug) errors.push("Name and a valid URL slug are required.");
  if (!Number.isFinite(p.price) || p.price < 0) errors.push("Price must be zero or more.");
  if (p.compare_at_price !== null && (!Number.isFinite(p.compare_at_price) || p.compare_at_price < 0)) errors.push("Original price must be zero or more.");
  if (p.stock_quantity !== null && (!Number.isSafeInteger(p.stock_quantity) || p.stock_quantity < 0)) errors.push("Stock must be a non-negative whole number.");
  if (p.track_stock && p.stock_quantity === null) errors.push("Tracked stock requires a quantity.");
  if (p.sort_order !== null && (!Number.isSafeInteger(p.sort_order) || p.sort_order < 0)) errors.push("Order must be a non-negative whole number.");
  if (p.category_id && !games.some(g => g.id === p.category_id)) errors.push("Unknown game.");
  if (p.product_type_id && !types.some(t => t.id === p.product_type_id && t.category_id === p.category_id)) errors.push("Product Type must belong to the game.");
  if (p.is_active && (!p.category_id || !p.product_type_id)) errors.push("Active products require a Game and Product Type.");
  if (p.image_url) { try { if (!["https:", "http:"].includes(new URL(p.image_url).protocol)) throw new Error(); } catch { errors.push("Image URL must be an HTTP(S) URL."); } }
  return errors;
}

export type BulkRow = { name: string; price: string; compare_at_price: string; stock_quantity: string; status: string };
export type BulkSettings = { category_id: string; product_type_id: string; description: string; image_url: string | null;
  order_method: OrderMethod; track_stock: boolean; is_active: boolean; sort_order: string };
export function prepareBulk(settings: BulkSettings, rows: BulkRow[], existing: AdminProduct[], games: Game[], types: ProductType[]) {
  const errors: string[] = [];
  if (!rows.length || rows.length > 100) errors.push("Add between 1 and 100 rows.");
  const names = new Set(existing.map(p => p.name.trim().toLowerCase()));
  const slugs = new Set(existing.map(p => p.slug));
  const products = rows.map((row, index): ProductDraft => {
    const p = { category_id: settings.category_id || null, product_type_id: settings.product_type_id || null,
      name: row.name.trim(), slug: slugify(row.name), sku: null, description: settings.description.trim() || null,
      image_url: settings.image_url, metadata: withOrderMethod(null, settings.order_method),
      price: row.price.trim() ? Number(row.price) : NaN,
      compare_at_price: row.compare_at_price.trim() ? Number(row.compare_at_price) : null,
      stock_quantity: row.stock_quantity.trim() ? Number(row.stock_quantity) : settings.track_stock ? NaN : 0,
      track_stock: settings.track_stock, is_active: row.status === "shared" ? settings.is_active : row.status === "active",
      sort_order: settings.sort_order.trim() ? Number(settings.sort_order) + index : NaN };
    const issues = validateDraft(p, games, types);
    if (names.has(p.name.toLowerCase()) || slugs.has(p.slug)) issues.push("Name or slug already exists in the catalog or this batch.");
    names.add(p.name.toLowerCase()); slugs.add(p.slug);
    errors.push(...issues.map(e => `Row ${index + 1}: ${e}`));
    return p;
  });
  return { products, errors };
}

// v1 columns: IDs identify existing rows for preview only; no CSV writes in Phase 2.
export const CSV_COLUMNS = ["id", "category_id", "product_type_id", "name", "slug", "sku", "description", "image_url", "price", "compare_at_price", "stock_quantity", "track_stock", "is_active", "sort_order", "order_method", "metadata"] as const;
// Prefix spreadsheet formulas (including whitespace-prefixed ones) and literal apostrophes.
const protectCell = (s: string) => /^(?:\s*[=+@-]|[\t\r\n]|')/.test(s) ? `'${s}` : s;
const unprotectCell = (s: string) => s.startsWith("'") && protectCell(s.slice(1)).startsWith("'") ? s.slice(1) : s;
export function exportProductsCsv(products: AdminProduct[]) {
  const quote = (v: unknown) => `"${protectCell(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
  return "\uFEFF" + [CSV_COLUMNS.join(","), ...products.map(p => CSV_COLUMNS.map(c => quote(c === "order_method" ? getOrderMethod(p.metadata) : c === "metadata" ? JSON.stringify(p.metadata ?? {}) : p[c])).join(","))].join("\r\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  const finish = () => { row.push(unprotectCell(cell)); cell = ""; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === '"') { if (cell || closed) throw new Error("Unexpected quote in CSV."); quoted = true; }
    else if (c === ",") finish();
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; finish(); rows.push(row); row = []; }
    else { if (closed) throw new Error("Unexpected text after a quoted cell."); cell += c; }
  }
  if (quoted) throw new Error("Unclosed quote in CSV.");
  if (cell || closed || row.length) { finish(); rows.push(row); }
  return rows;
}

export function previewProductsCsv(text: string, existing: AdminProduct[], games: Game[], types: ProductType[]) {
  const parsed = parseCsv(text); const header = parsed.shift();
  if (!header || header.join(",") !== CSV_COLUMNS.join(",")) throw new Error("CSV must have the exact v1 column headers in the documented order.");
  if (!parsed.length || parsed.length > 500) throw new Error("Preview supports 1–500 products per file.");
  const seenIds = new Set<string>(), seenSlugs = new Set<string>(), seenSkus = new Set<string>();
  return parsed.map((values, i) => {
    const errors: string[] = [];
    if (values.length !== CSV_COLUMNS.length) errors.push("Incorrect column count.");
    const r = Object.fromEntries(CSV_COLUMNS.map((c, j) => [c, values[j] ?? ""]));
    let metadata: unknown = {};
    try { metadata = JSON.parse(r.metadata || "{}"); if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error(); }
    catch { errors.push("Metadata must be a JSON object."); }
    if (!["normal_checkout", "whatsapp"].includes(r.order_method)) errors.push("Invalid order_method.");
    if (!["true", "false"].includes(r.track_stock) || !["true", "false"].includes(r.is_active)) errors.push("Booleans must be true or false.");
    const numeric = (s: string, nullable = false) => s.trim() ? Number(s) : nullable ? null : NaN;
    const draft: ProductDraft = { category_id: r.category_id || null, product_type_id: r.product_type_id || null,
      name: r.name, slug: r.slug, sku: r.sku || null, description: r.description || null, image_url: r.image_url || null,
      price: numeric(r.price)!, compare_at_price: numeric(r.compare_at_price, true), stock_quantity: numeric(r.stock_quantity, true),
      track_stock: r.track_stock === "true", is_active: r.is_active === "true", sort_order: numeric(r.sort_order, true),
      metadata: withOrderMethod(metadata, r.order_method as OrderMethod) };
    errors.push(...validateDraft(draft, games, types));
    if (r.id && (!existing.some(p => p.id === r.id) || seenIds.has(r.id))) errors.push("Unknown or repeated product ID.");
    if (seenSlugs.has(r.slug) || existing.some(p => p.slug === r.slug && p.id !== r.id)) errors.push("Duplicate slug.");
    if (r.sku && (seenSkus.has(r.sku) || existing.some(p => p.sku === r.sku && p.id !== r.id))) errors.push("Duplicate SKU.");
    seenIds.add(r.id); seenSlugs.add(r.slug); if (r.sku) seenSkus.add(r.sku);
    return { row: i + 2, name: r.name, action: r.id ? "Existing product" : "New product", errors, draft };
  });
}
