"use client";
import { useCart } from "./CartContext";
import StoreIcon from "./StoreIcons";

export default function StoreBottomNav() {
  const { itemCount } = useCart();
  return <nav className="store-bottom-nav" aria-label="Quick navigation">
    {[["Home", "/", "home"], ["Games", "/#games", "games"], ["Cart", "/cart", "cart"], ["Orders", "/checkout", "orders"]].map(([label, href, icon]) =>
      <a key={label} href={href} className={label === "Home" ? "is-current" : undefined} aria-current={label === "Home" ? "page" : undefined} aria-label={label === "Cart" ? `Cart, ${itemCount} items` : label === "Orders" ? "Orders — checkout" : label}>
        <span><StoreIcon name={icon} />{label === "Cart" && itemCount > 0 && <b>{itemCount}</b>}</span>{label}
      </a>)}
  </nav>;
}
