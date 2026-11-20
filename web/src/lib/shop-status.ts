import type { SupabaseClient } from "@supabase/supabase-js";

export type ShopState = "open" | "closed" | "unavailable";
export const SHOP_CLOSED_MESSAGE = "We’re temporarily closed. Orders will reopen soon.";
export function shopStatusMessage(state: ShopState | "loading") {
  return state === "closed" ? SHOP_CLOSED_MESSAGE : state === "loading" ? "Checking order availability…" : "Ordering is temporarily unavailable. Please try again.";
}

// No process/CDN cache: a missing, unreadable or malformed record never means open.
export async function readShopState(client: Pick<SupabaseClient, "from">): Promise<ShopState> {
  try {
    const { data, error } = await client.from("shop_settings").select("is_open").eq("id", true).maybeSingle();
    if (error || typeof data?.is_open !== "boolean") return "unavailable";
    return data.is_open ? "open" : "closed";
  } catch { return "unavailable"; }
}

export async function fetchShopState(): Promise<ShopState> {
  try {
    const response = await fetch("/api/shop-status", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return "unavailable";
    const data = await response.json();
    return data?.status === "open" || data?.status === "closed" ? data.status : "unavailable";
  } catch { return "unavailable"; }
}

export async function updateShopState(client: Pick<SupabaseClient, "from">, next: boolean, expected: boolean) {
  if (typeof next !== "boolean" || typeof expected !== "boolean") throw new Error("Choose a valid shop status.");
  const { data, error } = await client.from("shop_settings").update({ is_open: next }).eq("id", true).eq("is_open", expected).select("id, is_open").maybeSingle();
  if (error || data?.id !== true || data.is_open !== next) throw new Error("Shop status was not confirmed. Refresh and try again.");
}
