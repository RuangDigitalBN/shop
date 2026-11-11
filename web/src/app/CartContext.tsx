
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved cart when the app opens
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(STORAGE_KEY);

      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);

        if (Array.isArray(parsedCart)) {
          setCart(parsedCart);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }

    setIsLoaded(true);
  }, []);

  // Save cart whenever it changes
  useEffect(() => {
    if (!isLoaded) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, isLoaded]);

  function addItem(item: NewCartItem) {
    const existingItem = cart.find(
      (cartItem) =>
        cartItem.productId === item.productId &&
        cartItem.playerId === item.playerId &&
        cartItem.zoneId === item.zoneId
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
