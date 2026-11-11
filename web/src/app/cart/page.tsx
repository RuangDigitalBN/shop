
"use client";

import Link from "next/link";
import { useCart } from "../CartContext";

export default function CartPage() {
  const {
    cart,
    itemCount,
    subtotal,
    isLoaded,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-[#171717] px-5 py-16 text-[#F2F0E9]">
        <p className="text-white/50">Loading your cart...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#171717] px-5 py-12 text-[#F2F0E9] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-sm font-bold text-[#C6F36B] transition hover:text-white"
        >
          ← Continue shopping
        </Link>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#C6F36B]">
              Your selection
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
              Shopping Cart
            </h1>
            <p className="mt-2 text-sm text-white/50">
              {itemCount} {itemCount === 1 ? "item" : "items"} in your cart
            </p>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-sm font-bold text-red-400 transition hover:text-red-300"
            >
              Clear cart
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-[#202020] px-6 py-16 text-center">
            <div className="text-5xl">🛒</div>
            <h2 className="mt-5 text-2xl font-black">
              Your cart is empty
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Looks like you haven't added anything yet.
            </p>
            <Link
              href="/"
              className="mt-7 inline-flex rounded-xl bg-[#C6F36B] px-6 py-3 text-sm font-black text-[#171717] transition hover:bg-white"
            >
              Explore products
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {cart.map((item) => (
                <div
                  key={item.cartItemId}
                  className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#202020] p-4 sm:flex-row sm:items-center sm:p-5"
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#303030]">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-white/30">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="font-black">{item.name}</h2>

                    <p className="mt-1 text-sm text-[#C6F36B]">
                      BND {item.unitPrice.toFixed(2)} each
                    </p>

                    <div className="mt-3 space-y-1 text-xs text-white/50">
                      <p>Player ID: {item.playerId}</p>
                      <p>Server ID: {item.zoneId}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex items-center overflow-hidden rounded-lg border border-white/10">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.cartItemId, item.quantity - 1)
                          }
                          disabled={item.quantity <= 1}
                          className="px-3 py-2 text-white/70 transition hover:bg-white/10 disabled:opacity-30"
                        >
                          −
                        </button>

                        <span className="min-w-9 text-center text-sm font-bold">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.cartItemId, item.quantity + 1)
                          }
                          disabled={
                            item.trackStock &&
                            item.quantity >= Number(item.stockQuantity ?? 0)
                          }
                          className="px-3 py-2 text-white/70 transition hover:bg-white/10 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.cartItemId)}
                        className="text-xs font-bold text-red-400 transition hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs text-white/40">Item total</p>
                    <p className="mt-1 text-lg font-black">
                      BND {(item.unitPrice * item.quantity).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <aside className="h-fit rounded-2xl border border-white/10 bg-[#202020] p-6">
              <h2 className="text-xl font-black">Order Summary</h2>

              <div className="mt-6 flex justify-between text-sm text-white/50">
                <span>Total items</span>
                <span>{itemCount}</span>
              </div>

              <div className="mt-4 flex justify-between text-sm text-white/50">
                <span>Subtotal</span>
                <span>BND {subtotal.toFixed(2)}</span>
              </div>

              <div className="my-5 border-t border-white/10" />

              <div className="flex justify-between gap-3">
                <span className="font-bold">Total</span>
                <span className="text-xl font-black text-[#C6F36B]">
                  BND {subtotal.toFixed(2)}
                </span>
              </div>

              <p className="mt-4 text-xs leading-relaxed text-white/40">
                Final prices and stock availability will be checked again
                before your order is confirmed.
              </p>

              <Link
  href="/checkout"
  className="mt-6 block w-full rounded-xl bg-[#C6F36B] px-5 py-4 text-center text-sm font-black text-[#171717] transition hover:bg-white"
>
  Proceed to Checkout →
</Link>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
