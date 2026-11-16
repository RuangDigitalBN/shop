"use client";
import Link from "next/link";
import { useCart } from "./CartContext";

export default function CartLink({ variant = "regular" }: { variant?: "compact" | "regular" }) {
  const { itemCount } = useCart();
  return (
    <Link href="/cart" aria-label={`Cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}`} className={`store-cart-link store-cart-${variant}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3 3h2l3 12h10l3-9H6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" />
      </svg>
      <span className="store-cart-label">Cart</span><span className="store-cart-count">{itemCount}</span>
    </Link>
  );
}
