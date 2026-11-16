"use client";
import { useRef, useState } from "react";
import StoreIcon from "./StoreIcons";

export default function StoreSearch() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <div className={`store-search${open ? " is-open" : ""}`} onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
  }}>
    <button ref={toggle} type="button" className="store-search-toggle" aria-label="Search games or products" aria-expanded={open} aria-controls="store-search-form" onClick={() => setOpen(!open)}><StoreIcon name="search" /></button>
    <form id="store-search-form" action="/#popular" role="search"><StoreIcon name="search" size={18} /><input type="search" name="q" aria-label="Search games or products" placeholder="Search games or products..." /><button type="submit" aria-label="Submit search">→</button></form>
  </div>;
}
