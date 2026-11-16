import Link from "next/link";

export default function CatalogNav() {
  return <nav aria-label="Catalog management" className="mx-auto flex max-w-7xl flex-wrap gap-3 px-6 pt-5 text-sm md:px-10">
    {[["Games", "/admin/categories"], ["Product Types", "/admin/product-types"], ["Products", "/admin/products"]].map(([label, href]) => <Link key={href} href={href} className="rounded-lg border border-white/15 px-4 py-2 text-white/70 hover:text-[#C6F36B]">{label}</Link>)}
  </nav>;
}
