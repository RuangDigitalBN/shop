import type { ReactNode } from "react";
import Link from "next/link";
import StoreBrand from "./StoreBrand";
import CartLink from "./CartLink";
import MobileNav from "./MobileNav";
import StoreSearch from "./StoreSearch";

export default function StoreHeader({ variant = "full", backControl }: {
  variant?: "full" | "interior" | "checkout";
  backControl?: ReactNode;
}) {
  return <header className={`store-header store-header-${variant}`}><div className="store-header-inner">
    <StoreBrand />
    {variant !== "checkout" && <nav aria-label="Store navigation" className="store-desktop-nav">
      <Link href="/" aria-current={variant === "full" ? "page" : undefined}>Home</Link><Link href="/#games">Games</Link><Link href="/#popular">All Products</Link>
    </nav>}
    <div className="store-header-actions">
      {variant === "checkout" ? backControl : <>
        <StoreSearch />
        <CartLink variant="compact" /><MobileNav />
      </>}
    </div>
  </div></header>;
}
