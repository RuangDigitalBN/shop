"use client";

import { useRef, useState } from "react";
import { applyBulkEdit, bulkEditSummary, emptyBulkEdit, targetKey, type BulkEditChanges, type BulkEditResult } from "@/lib/admin-product-bulk-edit";
import type { AdminProduct, ProductType } from "@/lib/admin-products";

const inputClass = "mt-1 w-full rounded-lg border border-white/20 bg-[#171717] px-3 py-3 text-sm";
const buttonClass = "rounded-lg border border-white/20 px-4 py-3 text-sm font-bold disabled:opacity-50";
type Review = { targets: { id: string; name: string }[]; changes: BulkEditChanges; file: File | null };

export default function BulkEditProducts({ targets, products, types, disabled, onUpdated }: {
  targets: AdminProduct[]; products: AdminProduct[]; types: ProductType[]; disabled: boolean; onUpdated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState(emptyBulkEdit);
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [result, setResult] = useState<BulkEditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const currentKey = targetKey(targets);
  const reviewMatches = review !== null && targetKey(review.targets) === currentKey;
  const change = <K extends keyof BulkEditChanges>(field: K, value: BulkEditChanges[K]) => {
    setChanges(previous => ({ ...previous, [field]: value })); setReview(null); setError("");
  };

  function reviewChanges(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || inFlight.current) return;
    setReview(null); setError("");
    if (!targets.length || targets.length > 100) { setError("Choose 1–100 filtered products. Narrow the filters for larger sets."); return; }
    if (!bulkEditSummary(changes, file).length) { setError("Choose at least one change. Blank descriptions keep existing descriptions."); return; }
    setReview({ targets: targets.map(p => ({ id: p.id, name: p.name })), changes: { ...changes }, file });
  }

  async function confirm() {
    if (!review || !reviewMatches || disabled || inFlight.current) return;
    inFlight.current = true; setAttempted(true); setBusy(true); setError("");
    try {
      const outcome = await applyBulkEdit(review.targets.map(p => p.id), review.changes, review.file, types, setProgress);
      setResult(outcome);
      try { await onUpdated(); }
      catch { setError("Could not refresh the catalog. Reload before doing more edits."); }
    } finally { setBusy(false); }
  }

  return <section aria-label="Bulk edit filtered products" className="mt-6 space-y-4 rounded-xl border border-white/20 p-4">
    <button type="button" className={buttonClass} aria-expanded={open} aria-controls="bulk-edit-form" onClick={() => setOpen(!open)}>Bulk Edit filtered products</button>
    <p className="text-sm text-white/70" role="status">{targets.length} products in the current filtered set. With no filters, this includes the whole catalog.</p>
    {targets.length > 100 && <p className="text-sm">Narrow the filters to 100 products or fewer before applying a bulk edit.</p>}
    {open && <div className="space-y-4">
      <form id="bulk-edit-form" onSubmit={reviewChanges} className="space-y-4">
        <fieldset disabled={disabled || busy || attempted} className="space-y-4">
          <legend className="mb-3 font-bold">Choose shared changes</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>Shared image<select className={inputClass} value={file ? "" : changes.image_url ?? ""} onChange={e => { setFile(null); change("image_url", e.target.value || null); }}>
              <option value="">Keep current images</option>
              {products.filter((p, i, all) => p.image_url && all.findIndex(other => other.image_url === p.image_url) === i).map(p => <option key={p.id} value={p.image_url!}>{p.name}</option>)}
            </select></label>
            <label>Or upload one shared image<input key={file?.name ?? "no-bulk-edit-file"} className={inputClass} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
              const selected = e.target.files?.[0]; if (!selected) return;
              setReview(null);
              if (!["image/png", "image/jpeg", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
                setError("Choose a PNG, JPG or WEBP up to 5 MB."); e.target.value = ""; return;
              }
              setFile(selected); change("image_url", null);
            }} /><span className="text-xs text-white/60">{file ? `Selected: ${file.name}. ` : ""}One file for all products. Old files are retained.</span></label>
            <label>Active status<select className={inputClass} value={changes.status} onChange={e => change("status", e.target.value as BulkEditChanges["status"])}>
              <option value="keep">Keep current status</option><option value="active">Active</option><option value="inactive">Inactive / hidden</option>
            </select></label>
            <label>Order method<select className={inputClass} value={changes.order_method} onChange={e => change("order_method", e.target.value as BulkEditChanges["order_method"])}>
              <option value="keep">Keep current order method</option><option value="normal_checkout">Normal Checkout</option><option value="whatsapp">WhatsApp Order</option>
            </select></label>
          </div>
          <label className="flex items-center gap-3"><input type="checkbox" checked={changes.replace_description} onChange={e => change("replace_description", e.target.checked)} /> Replace descriptions</label>
          <label className="block">Replacement description<textarea className={inputClass} disabled={!changes.replace_description} value={changes.description} onChange={e => change("description", e.target.value)} />
            <span className="text-xs text-white/60">Opt in and enter text to replace descriptions. Blank or untouched keeps each existing description.</span>
          </label>
          <button type="submit" disabled={!targets.length || targets.length > 100} className={buttonClass}>Review changes</button>
        </fieldset>
      </form>
      {review && !attempted && <div aria-label="Review bulk edit" className="space-y-3 rounded-lg border border-[#C6F36B]/40 p-4">
        <h3 className="font-bold">Review changes to {review.targets.length} products</h3>
        <ul className="list-inside list-disc text-sm">{bulkEditSummary(review.changes, review.file).map(text => <li key={text}>{text}</li>)}</ul>
        {review.changes.replace_description && review.changes.description.trim() && <p className="whitespace-pre-wrap break-words text-sm">New description: {review.changes.description.trim()}</p>}
        <details><summary className="cursor-pointer text-sm">Affected products ({review.targets.length})</summary><ul className="mt-2 space-y-1 text-sm">{review.targets.map(p => <li key={p.id}>{p.name}</li>)}</ul></details>
        <p className="text-sm text-white/70">Changes save one product at a time. A failure stops the operation and reports confirmed saves. Old image files are kept.</p>
        {!reviewMatches && <p role="alert">The filtered set changed. Review changes again before applying.</p>}
        <button type="button" disabled={!reviewMatches || disabled} onClick={() => { void confirm(); }} className={buttonClass}>Confirm and apply to {review.targets.length} products</button>
        <button type="button" onClick={() => setReview(null)} className={buttonClass}>Cancel review</button>
      </div>}
      {busy && <p role="status">Applying changes: {progress} / {review?.targets.length} confirmed. Targets are fixed for this operation.</p>}
      {error && <p role="alert">{error}</p>}
      {result && review && <div role="status" className="space-y-2 text-sm">
        <p>{result.completed.length} / {review.targets.length} product updates confirmed.</p>
        {result.error && <p>Stopped: {result.error} {result.failedId ? `Update not confirmed for ${review.targets.find(p => p.id === result.failedId)?.name ?? result.failedId}.` : ""} {review.targets.length - result.completed.length - (result.failedId ? 1 : 0)} products were not attempted.</p>}
        <details><summary className="cursor-pointer">Confirmed products ({result.completed.length})</summary><ul>{review.targets.filter(p => result.completed.includes(p.id)).map(p => <li key={p.id}>{p.name}</li>)}</ul></details>
        {result.imageUrl && <p className="break-all">Shared image URL: {result.imageUrl}</p>}
        <p>Reload and check the catalog before another bulk edit. This operation will not retry automatically.</p>
      </div>}
    </div>}
  </section>;
}
