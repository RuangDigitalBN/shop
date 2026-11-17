
"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { cartAccountKey, validateGameFields } from "@/lib/game-fields";

export type CartItem = {
  categoryName?: string;
  cartItemId: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  playerId: string;
  zoneId: string;
  trackStock: boolean;
  stockQuantity: number | null;
};

type NewCartItem = Omit<CartItem, "cartItemId">;

type CartContextType = {
  cart: CartItem[];
  itemCount: number;
  subtotal: number;
  isLoaded: boolean;
  addItem: (item: NewCartItem) => {
    success: boolean;
    message: string;
  };
  updateQuantity: (cartItemId: string, quantity: number) => void;
  removeItem: (cartItemId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const STORAGE_KEY = "ruang-digital-cart";

// Stable server snapshot prevents saved browser state from changing hydration.
const EMPTY_CART: CartItem[] = [];
const SERVER_SNAPSHOT = { cart: EMPTY_CART, isLoaded: false };
let cachedRaw: string | null | undefined;
let cachedSnapshot = { cart: EMPTY_CART, isLoaded: true };
const listeners = new Set<() => void>();

function getCartSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      let cart = EMPTY_CART;
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) cart = parsed;
        } catch {
          try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage unavailable. */ }
        }
      }
      cachedRaw = raw;
      cachedSnapshot = { cart, isLoaded: true };
    }
  } catch {
    // Retain the in-memory cart when browser storage is unavailable.
  }
  return cachedSnapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

function subscribeCart(listener: () => void) {
  listeners.add(listener);
  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  }
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function setCart(update: CartItem[] | ((cart: CartItem[]) => CartItem[])) {
  const current = getCartSnapshot().cart;
  const cart = typeof update === "function" ? update(current) : update;
  const raw = JSON.stringify(cart);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
  } catch {
    // Keep the last observed storage value so failed writes retain in-memory updates.
  }
  cachedSnapshot = { cart, isLoaded: true };
  for (const listener of listeners) listener();
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { cart, isLoaded } = useSyncExternalStore(
    subscribeCart, getCartSnapshot, getServerSnapshot
  );

  function addItem(item: NewCartItem) {
    const validation = validateGameFields(item.categoryName ?? "Mobile Legends (Global)", item);
    if (!validation.values) return { success: false, message: validation.error! };
    item = { ...item, ...validation.values };
    const existingItem = cart.find(
      (cartItem) =>
        cartAccountKey(cartItem) === cartAccountKey(item)
    );

    const currentQuantity = existingItem?.quantity ?? 0;
    const newQuantity = currentQuantity + item.quantity;

    if (
      item.trackStock &&
      newQuantity > Number(item.stockQuantity ?? 0)
    ) {
      return {
        success: false,
        message: "Not enough stock available for this quantity.",
      };
    }

    if (existingItem) {
      setCart((currentCart) =>
        currentCart.map((cartItem) =>
          cartItem.cartItemId === existingItem.cartItemId
            ? { ...cartItem, quantity: newQuantity }
            : cartItem
        )
      );
    } else {
      setCart((currentCart) => [
        ...currentCart,
        {
          ...item,
          cartItemId: crypto.randomUUID(),
        },
      ]);
    }

    return {
      success: true,
      message: "Product added to cart.",
    };
  }

  function updateQuantity(cartItemId: string, quantity: number) {
    if (quantity < 1) return;

    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.cartItemId !== cartItemId) return item;

        const safeQuantity = item.trackStock
          ? Math.min(quantity, Number(item.stockQuantity ?? 0))
          : quantity;

        return {
          ...item,
          quantity: Math.max(1, safeQuantity),
        };
      })
    );
  }

  function removeItem(cartItemId: string) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.cartItemId !== cartItemId)
    );
  }

  function clearCart() {
    setCart([]);
  }

  const itemCount = useMemo(
    () => cart.reduce((total, item) => total + item.quantity, 0),
    [cart]
  );

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (total, item) => total + item.unitPrice * item.quantity,
        0
      ),
    [cart]
  );

  return (
    <CartContext.Provider
      value={{
        cart,
        itemCount,
        subtotal,
        isLoaded,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
