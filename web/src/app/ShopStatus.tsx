"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { fetchShopState, shopStatusMessage, type ShopState } from "@/lib/shop-status";

type ShopContext = {
  status: ShopState | "loading"; canOrder: boolean; checking: boolean;
  refresh: () => Promise<ShopState>; publish: (status: ShopState) => void;
};
const Context = createContext<ShopContext | null>(null);

export function ShopStatusProvider({ children }: { children: ReactNode }) {
  const admin = usePathname().startsWith("/admin");
  const [status, setStatus] = useState<ShopContext["status"]>("loading");
  const [checking, setChecking] = useState(false);
  const pending = useRef<Promise<ShopState> | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setChecking(true);
    pending.current = fetchShopState().then(state => { if (mounted.current) setStatus(state); return state; })
      .finally(() => { pending.current = null; if (mounted.current) setChecking(false); });
    return pending.current;
  }, []);
  const publish = useCallback((state: ShopState) => { setStatus(state); setChecking(false); }, []);

  useEffect(() => {
    // Admin must remain reachable even if the shop is closed or the setting is missing.
    if (admin) return;
    mounted.current = true;
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    const timer = window.setInterval(visibleRefresh, 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
    };
  }, [admin, refresh]);

  const value = useMemo(() => ({ status, canOrder: status === "open", checking, refresh, publish }), [status, checking, refresh, publish]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useShopStatus() {
  const value = useContext(Context);
  if (!value) throw new Error("Shop status provider is missing.");
  return value;
}

export function ShopStatusBanner() {
  const { status, checking, refresh } = useShopStatus();
  if (status === "open" || status === "loading") return null;
  return <aside id="store-shop-status" className="store-shop-status" role="status">
    <p>{shopStatusMessage(status)}</p>
    {status === "unavailable" && <button type="button" disabled={checking} onClick={() => { void refresh(); }}>Try again</button>}
  </aside>;
}
