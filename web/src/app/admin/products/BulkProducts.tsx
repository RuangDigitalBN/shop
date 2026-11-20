"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { prepareBulk, previewProductsCsv, type AdminProduct, type Game, type ProductType, type BulkRow, type BulkSettings } from "@/lib/admin-products";

const inputClass = "w-full rounded-lg border border-white/20 bg-[#171717] px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-white/20 px-4 py-2 text-sm font-bold disabled:opacity-50";
const blankRow = (): BulkRow => ({ name: "", price: "", compare_at_price: "", stock_quantity: "0", status: "shared" });
const initialSettings: BulkSettings = { category_id: "", product_type_id: "", description: "", image_url: null,
  order_method: "normal_checkout", track_stock: false, is_active: true, sort_order: "0" };

export default function BulkProducts({ products, games, types, onCreated }: {
  products: AdminProduct[]; games: Game[]; types: ProductType[]; onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [rows, setRows] = useState<BulkRow[]>([blankRow()]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [preview, setPreview] = useState<ReturnType<typeof previewProductsCsv>>([]);
  const [csvError, setCsvError] = useState("");
  const shared = (field: keyof BulkSettings, value: string | boolean | null) => setSettings(s => ({ ...s, [field]: value }));
  const rowField = (index: number, field: keyof BulkRow, value: string) => setRows(r => r.map((item, i) => i === index ? { ...item, [field]: value } : item));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || attempted) return;
    const prepared = prepareBulk(settings, rows, products, games, types);
    setMessages(prepared.errors);
    if (prepared.errors.length) return;
    setBusy(true);
    try {
      let imageUrl = settings.image_url;
      if (file) {
        // Use the existing bucket and UUID folder pattern. All rows share this one upload.
        const path = `${crypto.randomUUID()}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, {
          contentType: file.type, cacheControl: "3600", upsert: false,
        });
        if (error) throw new Error(`Image upload failed: ${error.message}`);
        imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        // Retain the uploaded reference if validation or insert fails; never upload it again on retry.
        shared("image_url", imageUrl); setFile(null);
      }
      setAttempted(true);
      // One statement: a constraint/RLS failure rejects the entire batch, never a per-row write loop.
      const { error } = await supabase.from("products").insert(prepared.products.map(p => ({ ...p, image_url: imageUrl })));
      if (error) throw new Error(`Batch was not confirmed: ${error.message}. Reload the catalog and check before starting another batch.`);
      setMessages([`${prepared.products.length} products created with one shared image reference. Reload this page to start another batch.`]);
      await onCreated();
    } catch (error) {
      setMessages([error instanceof Error ? error.message : "Creation was not confirmed. Reload and check the catalog before retrying."]);
    } finally { setBusy(false); }
  }

  async function readCsv(file: File | undefined) {
    setPreview([]); setCsvError("");
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setCsvError("CSV must be at most 2 MB."); return; }
    try { setPreview(previewProductsCsv(await file.text(), products, games, types)); }
    catch (error) { setCsvError(error instanceof Error ? error.message : "Could not read CSV."); }
  }

  return <section id="bulk-tools" className="mt-8 scroll-mt-4 space-y-6 rounded-2xl border border-white/10 bg-[#262626] p-4 md:p-8" aria-label="Bulk product tools">
    <button type="button" className={buttonClass} aria-expanded={open} aria-controls="bulk-form" onClick={() => setOpen(!open)}>Bulk Add Products</button>
    {open && <form id="bulk-form" onSubmit={create} className="space-y-6">
      <h2 className="text-xl font-bold">Create a product batch</h2>
      <p className="text-sm text-white/60">Choose shared settings once, then add up to 100 denominations. Names generate unique slugs. One image is stored for the whole batch.</p>
      <fieldset disabled={busy || attempted} className="space-y-5">
        <legend className="mb-3 font-bold">Shared settings</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Game<select required aria-label="Bulk Game" className={inputClass} value={settings.category_id} onChange={e => setSettings(s => ({ ...s, category_id: e.target.value, product_type_id: "" }))}>
            <option value="">Choose a game</option>{games.map(g => <option key={g.id} value={g.id}>{g.name}{!g.is_active ? " (Hidden)" : ""}</option>)}
          </select></label>
          <label>Product Type<select required aria-label="Bulk Product Type" disabled={!settings.category_id} className={inputClass} value={settings.product_type_id} onChange={e => shared("product_type_id", e.target.value)}>
            <option value="">Choose a Product Type</option>{types.filter(t => t.category_id === settings.category_id).map(t => <option key={t.id} value={t.id}>{t.name}{!t.is_active ? " (Hidden)" : ""}</option>)}
          </select></label>
          <label>Order method<select className={inputClass} value={settings.order_method} onChange={e => shared("order_method", e.target.value)}><option value="normal_checkout">Normal Checkout</option><option value="whatsapp">WhatsApp Order</option></select></label>
          <label>Starting sort order<input required type="number" min="0" step="1" className={inputClass} value={settings.sort_order} onChange={e => shared("sort_order", e.target.value)} /></label>
          <label>Reuse an existing image<select className={inputClass} value={file ? "" : settings.image_url ?? ""} onChange={e => { setFile(null); shared("image_url", e.target.value || null); }}>
            <option value="">No image</option>{products.filter((p, i, all) => p.image_url && all.findIndex(other => other.image_url === p.image_url) === i).map(p => <option key={p.id} value={p.image_url!}>{p.name}</option>)}
          </select></label>
          <label>Or upload one shared image<input key={file?.name ?? settings.image_url ?? "none"} type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} onChange={e => {
            const selected = e.target.files?.[0]; if (!selected) return;
            if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
              setMessages(["Choose a PNG, JPG or WEBP image up to 5 MB."]); e.target.value = ""; return;
            }
            setFile(selected); shared("image_url", null); setMessages([]);
          }} /><span className="text-xs text-white/60">{file ? `Selected: ${file.name}. ` : ""}PNG, JPG or WEBP, up to 5 MB.</span></label>
        </div>
        <label className="block">Shared description<textarea className={inputClass} value={settings.description} onChange={e => shared("description", e.target.value)} /></label>
        <div className="flex flex-wrap gap-6">
          <label><input type="checkbox" checked={settings.track_stock} onChange={e => shared("track_stock", e.target.checked)} /> Track stock for all rows</label>
          <label><input type="checkbox" checked={settings.is_active} onChange={e => shared("is_active", e.target.checked)} /> Active by default</label>
        </div>
        <h3 className="font-bold">Products</h3>
        {rows.map((row, index) => <fieldset key={index} className="rounded-xl border border-white/15 p-4">
          <legend className="px-2">Row {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>Name<input required className={inputClass} value={row.name} onChange={e => rowField(index, "name", e.target.value)} /></label>
            <label>Price (BND)<input required type="number" min="0" step="0.01" className={inputClass} value={row.price} onChange={e => rowField(index, "price", e.target.value)} /></label>
            <label>Original price (optional)<input type="number" min="0" step="0.01" className={inputClass} value={row.compare_at_price} onChange={e => rowField(index, "compare_at_price", e.target.value)} /></label>
            <label>Stock quantity<input required={settings.track_stock} type="number" min="0" step="1" className={inputClass} value={row.stock_quantity} onChange={e => rowField(index, "stock_quantity", e.target.value)} /></label>
            <label>Status<select className={inputClass} value={row.status} onChange={e => rowField(index, "status", e.target.value)}><option value="shared">Use shared status</option><option value="active">Active</option><option value="hidden">Hidden</option></select></label>
            <button type="button" className={buttonClass} disabled={rows.length === 1} onClick={() => setRows(r => r.filter((_, i) => i !== index))}>Remove row {index + 1}</button>
          </div>
        </fieldset>)}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass} disabled={rows.length >= 100} onClick={() => setRows(r => [...r, blankRow()])}>Add row</button>
          <button type="button" className={buttonClass} disabled={rows.length > 90} onClick={() => setRows(r => [...r, ...Array.from({ length: 10 }, blankRow)])}>Add 10 rows</button>
          <button type="submit" className={buttonClass}>Create {rows.length} products</button>
        </div>
      </fieldset>
      {busy && <p role="status">Saving batch…</p>}
      <div role="status" className="space-y-2 text-sm">{messages.map((m, i) => <p key={i}>{m}</p>)}</div>
    </form>}
    <div className="space-y-3 border-t border-white/10 pt-5">
      <h2 className="font-bold">CSV import preview</h2>
      <p className="text-sm text-white/60">Export the catalog below for the column template. Choose an Excel UTF-8 comma-separated CSV (up to 2 MB / 500 rows). This validates only; it never saves changes.</p>
      <label className="block">Preview CSV<input type="file" accept=".csv,text/csv" className={inputClass} onChange={e => { void readCsv(e.target.files?.[0]); }} /></label>
      {csvError && <p role="alert">{csvError}</p>}
      {preview.length > 0 && <div role="status" className="space-y-2 text-sm">
        <p>{preview.length} rows checked; {preview.filter(r => r.errors.length).length} rows have errors. No changes saved.</p>
        {preview.map(r => <p key={r.row}>Row {r.row} · {r.name || "(missing name)"} · {r.action}: {r.errors.join(" ") || "Valid"}</p>)}
      </div>}
    </div>
  </section>;
}
