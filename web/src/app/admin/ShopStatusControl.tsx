"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readShopState, updateShopState, type ShopState } from "@/lib/shop-status";
import { useShopStatus } from "../ShopStatus";

export default function ShopStatusControl() {
  const { publish } = useShopStatus();
  const [current, setCurrent] = useState<ShopState>("unavailable");
  const [draft, setDraft] = useState("open");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const load = useCallback(() => readShopState(supabase).then(state => {
    setCurrent(state); setDraft(state === "closed" ? "closed" : "open"); setLoading(false);
    setError(state === "unavailable" ? "Could not load shop status. Refresh and try again." : "");
  }), []);
  useEffect(() => { void load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current || loading || current === "unavailable" || draft === current) return;
    saving.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await updateShopState(supabase, draft === "open", current === "open");
      const next = draft === "open" ? "open" : "closed";
      setCurrent(next); publish(next); setMessage("Shop status saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save shop status."); }
    finally { saving.current = false; setBusy(false); }
  }

  return <section className="mt-8 rounded-2xl border border-white/15 bg-[#262626] p-5 sm:p-6" aria-labelledby="shop-control-heading">
    <h2 id="shop-control-heading" className="text-xl font-bold">Shop status</h2>
    <p className="mt-2 text-sm text-white/70" role="status">Current status: <strong>{loading ? "Loading…" : current === "open" ? "Open" : current === "closed" ? "Temporarily Closed" : "Unavailable"}</strong></p>
    <p className="mt-2 text-sm text-white/60">Closing stops new orders, including WhatsApp actions. Browsing, requests and admin stay available.</p>
    <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm" htmlFor="shop-open-state">New status<select id="shop-open-state" disabled={loading || busy || current === "unavailable"} value={draft} onChange={e => setDraft(e.target.value)} className="mt-2 block rounded-lg border border-white/20 bg-[#171717] p-3"><option value="open">Open</option><option value="closed">Temporarily Closed</option></select></label>
      <button type="submit" disabled={loading || busy || current === "unavailable" || current === draft} className="rounded-lg bg-[#C6F36B] px-4 py-3 text-sm font-bold text-[#171717] disabled:opacity-50">{busy ? "Saving…" : "Save shop status"}</button>
      <button type="button" disabled={loading || busy} onClick={() => { setLoading(true); setMessage(""); void load(); }} className="rounded-lg border border-white/20 px-4 py-3 text-sm disabled:opacity-50">Refresh status</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-[#C6F36B]">{message}</p>}
  </section>;
}
