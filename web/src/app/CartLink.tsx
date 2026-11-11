
"use client";

import Link from "next/link";
import { useCart } from "./CartContext";

export default function CartLink() {
  const { itemCount } = useCart();

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[#F2F0E9] transition hover:border-[#C6F36B] hover:text-[#C6F36B] sm:text-xs"
    >
      <span>Cart</span>
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C6F36B] px-1 text-[10px] font-black text-[#171717]">
        {itemCount}
      </span>
    </Link>
  );
}
